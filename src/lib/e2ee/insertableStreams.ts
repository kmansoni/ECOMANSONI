/**
 * Insertable Streams Integration for E2EE media
 * Фаза 5: интеграция SFrame с WebRTC Insertable Streams API
 *
 * Поддерживает два метода:
 *   1. createEncodedStreams (Chrome >= 86, non-spec)
 *   2. RTCRtpScriptTransform (spec-compliant, Firefox >= 117, Safari >= 15.4)
 */

import { SFrameContext } from './sframe';

export interface InsertableStreamsConfig {
  /** Called when encryption/decryption fails */
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  /** Called on frame processed (for metrics) */
  onFrame?: (direction: 'encrypt' | 'decrypt', size: number) => void;
}

interface TransformEntry {
  readable: ReadableStream;
  writable: WritableStream;
}

interface ActiveTransformEntry extends TransformEntry {
  abortController: AbortController;
}

interface MediaEncryptorStats {
  encryptedFrames: number;
  decryptedFrames: number;
  encryptionErrors: number;
  decryptionErrors: number;
}

/**
 * Manages SFrame encryption/decryption for WebRTC media tracks
 * using the Insertable Streams API (RTCRtpScriptTransform / TransformStream)
 */
export class MediaEncryptor {
  private sframeContext: SFrameContext;
  /** Per-peerId decryption contexts */
  private decryptionContexts: Map<string, SFrameContext> = new Map();
  private config: InsertableStreamsConfig;
  private activeTransforms: Map<string, ActiveTransformEntry> = new Map();
  private stats: MediaEncryptorStats = {
    encryptedFrames: 0,
    decryptedFrames: 0,
    encryptionErrors: 0,
    decryptionErrors: 0,
  };

  constructor(config: InsertableStreamsConfig = {}) {
    this.config = config;
    this.sframeContext = new SFrameContext();
  }

  /**
   * Set the current encryption key for outgoing media
   */
  async setEncryptionKey(key: CryptoKey, keyId: number): Promise<void> {
    await this.sframeContext.setEncryptionKey(key, keyId);
  }

  /**
   * Set a decryption key for incoming media from a specific peer
   */
  async setDecryptionKey(key: CryptoKey, keyId: number, peerId: string): Promise<void> {
    let ctx = this.decryptionContexts.get(peerId);
    if (!ctx) {
      ctx = new SFrameContext();
      this.decryptionContexts.set(peerId, ctx);
    }
    await ctx.setEncryptionKey(key, keyId);
  }

  /**
   * Apply encryption transform to an outgoing RTCRtpSender.
   * Uses Insertable Streams (encoded transforms).
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    this.removeTransform(trackId);

    // Method 1: Insertable Streams via createEncodedStreams (Chrome 86+, Edge)
    if (typeof (sender as any).createEncodedStreams === 'function') {
      const { readable, writable } = (sender as any).createEncodedStreams() as TransformEntry;

      const transformStream = new TransformStream({
        transform: async (frame: any, controller: any) => {
          try {
            const encryptedData = await this.sframeContext.encryptFrame(frame.data as ArrayBuffer);
            frame.data = encryptedData;
            this.stats.encryptedFrames++;
            this.config.onFrame?.('encrypt', encryptedData.byteLength);
            controller.enqueue(frame);
          } catch (error) {
            this.stats.encryptionErrors++;
            this.config.onError?.(error as Error, 'encrypt');
            // НЕ передаём незашифрованный кадр — безопаснее потерять кадр, чем слить открытые данные
          }
        },
      });

      const abortController = new AbortController();
      readable.pipeThrough(transformStream).pipeTo(writable, { signal: abortController.signal }).catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.error('[MediaEncryptor] Sender pipe error:', err);
      });

      this.activeTransforms.set(trackId, { readable, writable, abortController });
      return;
    }

    // C-4: Method 2: RTCRtpScriptTransform (Firefox 117+, Safari 15.4+) — NOT YET IMPLEMENTED
    // Fail-closed: do NOT pass media through unencrypted. Throw to halt call setup.
    if (typeof (globalThis as any).RTCRtpScriptTransform !== 'undefined') {
      throw new Error(
        '[MediaEncryptor] RTCRtpScriptTransform is required on this browser but not yet implemented. ' +
        'E2EE media encryption unavailable. Call cannot proceed securely.'
      );
    }

    // C-4: No E2EE transform support at all — fail-closed
    throw new Error(
      '[MediaEncryptor] Neither Insertable Streams (createEncodedStreams) nor RTCRtpScriptTransform ' +
      'is supported on this browser. E2EE media encryption unavailable.'
    );
  }

  /**
   * Apply decryption transform to an incoming RTCRtpReceiver.
   */
  setupReceiverTransform(receiver: RTCRtpReceiver, trackId: string, peerId: string): void {
    this.removeTransform(trackId);

    // Method 1: Insertable Streams via createEncodedStreams (Chrome 86+, Edge)
    if (typeof (receiver as any).createEncodedStreams === 'function') {
      const { readable, writable } = (receiver as any).createEncodedStreams() as TransformEntry;

      const transformStream = new TransformStream({
        transform: async (frame: any, controller: any) => {
          const ctx = this.decryptionContexts.get(peerId);
          if (!ctx) {
            // SECURITY FIX: Drop frames when no decryption key available.
            // In E2EE mode, passing unencrypted frames would violate confidentiality.
            // A missing ctx means either the key hasn't arrived yet or the peer is untrusted —
            // either way, surfacing raw media is unacceptable.
            this.stats.decryptionErrors++;
            this.config.onError?.(new Error('No decryption key for peer ' + peerId), 'decrypt');
            return; // drop frame — do NOT enqueue
          }
          try {
            const decryptedData = await ctx.decryptFrame(frame.data as ArrayBuffer);
            frame.data = decryptedData;
            this.stats.decryptedFrames++;
            this.config.onFrame?.('decrypt', decryptedData.byteLength);
            controller.enqueue(frame);
          } catch (error) {
            this.stats.decryptionErrors++;
            this.config.onError?.(error as Error, 'decrypt');
            // Graceful degradation: drop frame silently
          }
        },
      });

      const abortController = new AbortController();
      readable.pipeThrough(transformStream).pipeTo(writable, { signal: abortController.signal }).catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.error('[MediaEncryptor] Receiver pipe error:', err);
      });

      this.activeTransforms.set(trackId, { readable, writable, abortController });
      return;
    }

    // C-4: Method 2: RTCRtpScriptTransform (Firefox 117+, Safari 15.4+) — NOT YET IMPLEMENTED
    if (typeof (globalThis as any).RTCRtpScriptTransform !== 'undefined') {
      throw new Error(
        '[MediaEncryptor] RTCRtpScriptTransform is required on this browser but not yet implemented. ' +
        'E2EE media decryption unavailable. Call cannot proceed securely.'
      );
    }

    // C-4: No E2EE transform support — fail-closed
    throw new Error(
      '[MediaEncryptor] Neither Insertable Streams (createEncodedStreams) nor RTCRtpScriptTransform ' +
      'is supported on this browser. E2EE media decryption unavailable.'
    );
  }

  /**
   * Remove transform entry for a specific track (does not close streams).
   */
  removeTransform(trackId: string): void {
    const entry = this.activeTransforms.get(trackId);
    if (entry) {
      entry.abortController.abort();
      this.activeTransforms.delete(trackId);
    }
  }

  /**
   * Remove all transforms (cleanup).
   */
  removeAllTransforms(): void {
    for (const entry of this.activeTransforms.values()) {
      entry.abortController.abort();
    }
    this.activeTransforms.clear();
  }

  /**
   * Check if the browser supports Insertable Streams API.
   */
  /**
   * C-4: Check if the browser supports E2EE transforms that are actually IMPLEMENTED.
   * RTCRtpScriptTransform is detected but NOT supported yet — excluded from true.
   * Only returns true if we can ACTUALLY apply transforms (Insertable Streams / createEncodedStreams).
   */
  static isSupported(): boolean {
    if (typeof RTCRtpSender === 'undefined') return false;
    // Only report support for Insertable Streams — the only implemented method.
    // RTCRtpScriptTransform detected but NOT implemented yet (see C-4 fix in setup*Transform).
    return 'createEncodedStreams' in RTCRtpSender.prototype;
  }

  /**
   * Get stats about processed frames.
   */
  getStats(): MediaEncryptorStats {
    return { ...this.stats };
  }

  /**
   * Destroy and cleanup all state.
   */
  destroy(): void {
    this.removeAllTransforms();
    this.decryptionContexts.clear();
  }
}

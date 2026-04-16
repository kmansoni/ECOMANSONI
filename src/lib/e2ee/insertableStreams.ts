/**
 * Insertable Streams Integration for E2EE media
 * Фаза 5: интеграция SFrame с WebRTC Insertable Streams API
 *
 * Поддерживает два метода:
 *   1. createEncodedStreams (Chrome >= 86, non-spec)
 *   2. RTCRtpScriptTransform (spec-compliant, Firefox >= 117, Safari >= 15.4)
 */

import { SFrameContext } from './sframe';
import { logger } from '@/lib/logger';

// Нестандартные WebRTC API — экспериментальная поддержка Insertable Streams
interface RTCRtpSenderWithStreams extends RTCRtpSender {
  createEncodedStreams?: () => { readable: ReadableStream; writable: WritableStream };
}

interface RTCRtpReceiverWithStreams extends RTCRtpReceiver {
  createEncodedStreams?: () => { readable: ReadableStream; writable: WritableStream };
}

interface EncodedFrame {
  data: ArrayBuffer;
  timestamp: number;
  type?: string;
  getMetadata?: () => Record<string, unknown>;
}

type GlobalWithScriptTransform = typeof globalThis & {
  RTCRtpScriptTransform?: new (worker: Worker, options: Record<string, unknown>) => unknown;
};

/** Контекст поломки pipe — передаётся в caller для recovery */
export interface PipeBreakInfo {
  trackId: string;
  direction: 'encrypt' | 'decrypt';
  /** Для receiver — peerId отправителя (producerId). Для sender — undefined. */
  peerId?: string;
}

export interface InsertableStreamsConfig {
  /** Called when encryption/decryption fails on a per-frame basis (informational) */
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  /** Called on frame processed (for metrics) */
  onFrame?: (direction: 'encrypt' | 'decrypt', size: number) => void;
  /** Called when the transform pipe breaks — caller must re-create producer/consumer to recover */
  onPipeBreak?: (info: PipeBreakInfo) => void;
}

interface TransformEntry {
  readable: ReadableStream;
  writable: WritableStream;
}

interface ActiveTransformEntry extends TransformEntry {
  abortController: AbortController;
}

interface ScriptTransformEntry {
  worker: Worker;
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
  private scriptTransforms: Map<string, ScriptTransformEntry> = new Map();
  private currentEncryptionKey: { key: CryptoKey; keyId: number } | null = null;
  private currentDecryptionKeys: Map<string, { key: CryptoKey; keyId: number }> = new Map();
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
    this.currentEncryptionKey = { key, keyId };

    // Propagate to script-transform workers (if any)
    for (const { worker } of this.scriptTransforms.values()) {
      worker.postMessage({ type: 'setEncryptionKey', key, keyId });
    }
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
    this.currentDecryptionKeys.set(peerId, { key, keyId });

    // Propagate to script-transform workers (if any)
    for (const { worker } of this.scriptTransforms.values()) {
      worker.postMessage({ type: 'setDecryptionKey', key, keyId, peerId });
    }
  }

  private _createScriptWorker(trackId: string): Worker {
    const source = `
      const encState = { key: null, keyId: 0, counter: 0 };
      const decStates = new Map();

      function encodeVarInt(value) {
        if (value < 0) throw new Error('VarInt must be non-negative');
        if (value === 0) return new Uint8Array([0]);
        const bytes = [];
        let v = value;
        while (v > 0) {
          bytes.unshift(v & 0x7f);
          v = v >>> 7;
        }
        for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
        return new Uint8Array(bytes);
      }

      function decodeVarInt(data, offset) {
        let value = 0;
        let i = offset;
        while (i < data.length) {
          const byte = data[i++];
          value = value * 128 + (byte & 0x7f);
          if (!(byte & 0x80)) break;
        }
        return [value, i - offset];
      }

      function buildIV(counter) {
        const iv = new ArrayBuffer(12);
        const view = new DataView(iv);
        view.setUint32(8, counter >>> 0, false);
        if (counter > 0xffffffff) {
          view.setUint32(4, Math.floor(counter / 0x100000000) >>> 0, false);
        }
        return iv;
      }

      function buildHeader(keyId, counter) {
        const counterBytes = encodeVarInt(counter);
        if (keyId <= 0x7f) {
          const buf = new ArrayBuffer(1 + counterBytes.length);
          const view = new Uint8Array(buf);
          view[0] = keyId & 0x7f;
          view.set(counterBytes, 1);
          return buf;
        }

        let kidBytes = 0;
        let tmp = keyId >> 4;
        while (tmp > 0) { kidBytes++; tmp >>= 8; }
        kidBytes = Math.min(kidBytes, 7);

        const firstByte = 0x80 | ((kidBytes & 0x07) << 4) | ((keyId >> (kidBytes * 8)) & 0x0f);
        const buf = new ArrayBuffer(1 + kidBytes + counterBytes.length);
        const view = new Uint8Array(buf);
        view[0] = firstByte;
        for (let i = 0; i < kidBytes; i++) {
          view[1 + i] = (keyId >> ((kidBytes - 1 - i) * 8)) & 0xff;
        }
        view.set(counterBytes, 1 + kidBytes);
        return buf;
      }

      function parseHeader(data) {
        const bytes = new Uint8Array(data);
        if (bytes.length < 2) return null;
        const first = bytes[0];
        const xBit = (first & 0x80) !== 0;
        let offset = 0;
        let keyId;

        if (!xBit) {
          keyId = first & 0x7f;
          offset = 1;
        } else {
          const lenField = (first >> 4) & 0x07;
          const kidHigh = first & 0x0f;
          offset = 1;
          keyId = kidHigh;
          for (let i = 0; i < lenField && offset < bytes.length; i++, offset++) {
            keyId = (keyId << 8) | bytes[offset];
          }
        }

        const [counter, consumed] = decodeVarInt(bytes, offset);
        offset += consumed;
        return { keyId, counter, headerLength: offset };
      }

      self.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.type === 'setEncryptionKey') {
          encState.key = msg.key;
          encState.keyId = msg.keyId & 0xff;
          encState.counter = 0;
        }
        if (msg.type === 'setDecryptionKey') {
          decStates.set(msg.peerId, { key: msg.key, keyId: msg.keyId & 0xff });
        }
      });

      self.addEventListener('rtctransform', (event) => {
        const transformer = event.transformer;
        const options = transformer.options || {};
        const operation = options.operation;
        const peerId = options.peerId;

        const t = new TransformStream({
          async transform(frame, controller) {
            try {
              if (operation === 'encrypt') {
                if (!encState.key) return;
                const counter = encState.counter++;
                const header = buildHeader(encState.keyId, counter);
                const iv = buildIV(counter);
                const encrypted = await crypto.subtle.encrypt(
                  { name: 'AES-GCM', iv, additionalData: header, tagLength: 128 },
                  encState.key,
                  frame.data
                );
                const out = new ArrayBuffer(header.byteLength + encrypted.byteLength);
                const v = new Uint8Array(out);
                v.set(new Uint8Array(header), 0);
                v.set(new Uint8Array(encrypted), header.byteLength);
                frame.data = out;
                self.postMessage({ type: 'frame', direction: 'encrypt', size: out.byteLength });
                controller.enqueue(frame);
                return;
              }

              if (operation === 'decrypt') {
                const state = decStates.get(peerId);
                if (!state || !state.key) return;
                const parsed = parseHeader(frame.data);
                if (!parsed) return;
                const headerBuf = frame.data.slice(0, parsed.headerLength);
                const payloadBuf = frame.data.slice(parsed.headerLength);
                const iv = buildIV(parsed.counter);
                const plain = await crypto.subtle.decrypt(
                  { name: 'AES-GCM', iv, additionalData: headerBuf, tagLength: 128 },
                  state.key,
                  payloadBuf
                );
                frame.data = plain;
                self.postMessage({ type: 'frame', direction: 'decrypt', size: plain.byteLength });
                controller.enqueue(frame);
                return;
              }

              controller.enqueue(frame);
            } catch (err) {
              const message = (err && err.message) ? err.message : String(err);
              self.postMessage({ type: 'error', direction: operation === 'decrypt' ? 'decrypt' : 'encrypt', message });
            }
          }
        });

        transformer.readable.pipeThrough(t).pipeTo(transformer.writable).catch((err) => { self.postMessage({ type: 'pipe_error', message: String(err) }); });
      });
    `;

    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      throw new Error(
        `[MediaEncryptor] RTCRtpScriptTransform worker creation failed (${navigator.userAgent.slice(0, 40)}): ${err instanceof Error ? err.message : String(err)}. ` +
        'E2EE requires either Insertable Streams (Chrome 86+) or RTCRtpScriptTransform with Worker support.'
      );
    }
    URL.revokeObjectURL(url);

    worker.onerror = (ev) => {
      logger.error('[E2EE] ScriptTransform worker error', { message: ev.message, filename: ev.filename, trackId });
      this.stats.encryptionErrors++;
      this.config.onError?.(new Error(`ScriptTransform worker error: ${ev.message}`), 'encrypt');
    };

    worker.onmessage = (event) => {
      const data = event.data as { type?: string; direction?: 'encrypt' | 'decrypt'; size?: number; message?: string };
      if (data.type === 'frame' && data.direction && typeof data.size === 'number') {
        if (data.direction === 'encrypt') this.stats.encryptedFrames++;
        if (data.direction === 'decrypt') this.stats.decryptedFrames++;
        this.config.onFrame?.(data.direction, data.size);
      }
      if (data.type === 'error' && data.direction) {
        if (data.direction === 'encrypt') this.stats.encryptionErrors++;
        if (data.direction === 'decrypt') this.stats.decryptionErrors++;
        this.config.onError?.(new Error(data.message || 'ScriptTransform error'), data.direction);
      }
      if (data.type === 'pipe_error') {
        logger.error('[E2EE] ScriptTransform pipe failed — recovery needed', { error: data.message, trackId });
        this.removeTransform(trackId);
        this.config.onPipeBreak?.({ trackId, direction: 'encrypt' });
      }
    };

    this.scriptTransforms.set(trackId, { worker });
    return worker;
  }

  /**
   * Apply encryption transform to an outgoing RTCRtpSender.
   * Uses Insertable Streams (encoded transforms).
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    this.removeTransform(trackId);
    const method = MediaEncryptor.getTransformMethod();
    logger.debug('[E2EE] setupSenderTransform', { trackId, method });

    // Method 1: Insertable Streams via createEncodedStreams (Chrome 86+, Edge)
    if (typeof (sender as RTCRtpSenderWithStreams).createEncodedStreams === 'function') {
      const { readable, writable } = (sender as RTCRtpSenderWithStreams).createEncodedStreams!() as TransformEntry;

      const transformStream = new TransformStream({
        transform: async (frame: EncodedFrame, controller: TransformStreamDefaultController<EncodedFrame>) => {
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
        logger.error('[MediaEncryptor] Sender pipe error — recovery needed', { error: err, trackId });
        this.removeTransform(trackId);
        this.config.onPipeBreak?.({ trackId, direction: 'encrypt' });
      });

      this.activeTransforms.set(trackId, { readable, writable, abortController });
      return;
    }

    // Method 2: RTCRtpScriptTransform (Firefox/Safari compatible path)
    if ('RTCRtpScriptTransform' in globalThis) {
      const senderWithStreams = sender as RTCRtpSenderWithStreams;
      const RTCRtpScriptTransformCtor = (globalThis as GlobalWithScriptTransform).RTCRtpScriptTransform!;
      const worker = this._createScriptWorker(trackId);
      senderWithStreams.transform = new RTCRtpScriptTransformCtor(worker, {
        operation: 'encrypt',
        trackId,
      });

      if (this.currentEncryptionKey) {
        worker.postMessage({
          type: 'setEncryptionKey',
          key: this.currentEncryptionKey.key,
          keyId: this.currentEncryptionKey.keyId,
        });
      }
      return;
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
    const method = MediaEncryptor.getTransformMethod();
    logger.debug('[E2EE] setupReceiverTransform', { trackId, peerId, method });

    // Method 1: Insertable Streams via createEncodedStreams (Chrome 86+, Edge)
    if (typeof (receiver as RTCRtpReceiverWithStreams).createEncodedStreams === 'function') {
      const { readable, writable } = (receiver as RTCRtpReceiverWithStreams).createEncodedStreams!() as TransformEntry;

      const transformStream = new TransformStream({
        transform: async (frame: EncodedFrame, controller: TransformStreamDefaultController<EncodedFrame>) => {
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
        logger.error('[MediaEncryptor] Receiver pipe error — recovery needed', { error: err, trackId, peerId });
        this.removeTransform(trackId);
        this.config.onPipeBreak?.({ trackId, direction: 'decrypt', peerId });
      });

      this.activeTransforms.set(trackId, { readable, writable, abortController });
      return;
    }

    // Method 2: RTCRtpScriptTransform (Firefox/Safari compatible path)
    if ('RTCRtpScriptTransform' in globalThis) {
      const receiverWithStreams = receiver as RTCRtpReceiverWithStreams;
      const RTCRtpScriptTransformCtor = (globalThis as GlobalWithScriptTransform).RTCRtpScriptTransform!;
      const worker = this._createScriptWorker(trackId);
      receiverWithStreams.transform = new RTCRtpScriptTransformCtor(worker, {
        operation: 'decrypt',
        trackId,
        peerId,
      });

      const keyState = this.currentDecryptionKeys.get(peerId);
      if (keyState) {
        worker.postMessage({
          type: 'setDecryptionKey',
          key: keyState.key,
          keyId: keyState.keyId,
          peerId,
        });
      }
      return;
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

    const scriptEntry = this.scriptTransforms.get(trackId);
    if (scriptEntry) {
      scriptEntry.worker.terminate();
      this.scriptTransforms.delete(trackId);
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

    for (const entry of this.scriptTransforms.values()) {
      entry.worker.terminate();
    }
    this.scriptTransforms.clear();
  }

  /**
   * Check if the browser supports Insertable Streams API.
   */
  /**
   * Check if the browser supports at least one implemented E2EE transform path.
   */
  static isSupported(): boolean {
    const hasEncodedStreams =
      typeof RTCRtpSender !== 'undefined' &&
      'createEncodedStreams' in RTCRtpSender.prototype;
    const hasScriptTransform = 'RTCRtpScriptTransform' in globalThis;
    return hasEncodedStreams || hasScriptTransform;
  }

  /**
   * Определить какой конкретно путь E2EE доступен:
   * - 'encodedStreams' — Chrome 86+, наиболее надёжный
   * - 'scriptTransform' — Firefox/Safari, менее стабильный
   * - null — E2EE недоступен
   */
  static getTransformMethod(): 'encodedStreams' | 'scriptTransform' | null {
    if (typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype) {
      return 'encodedStreams';
    }
    if ('RTCRtpScriptTransform' in globalThis) {
      return 'scriptTransform';
    }
    return null;
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

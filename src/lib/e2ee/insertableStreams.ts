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
  /** Причина (typed) — позволяет RecoveryPolicy выбрать стратегию */
  reason: string;
  /** Epoch ключа на момент поломки */
  keyEpoch?: number;
  /** Epoch трансформа на момент поломки — для ABA race prevention */
  transformEpoch: number;
}

export interface InsertableStreamsConfig {
  /** Called when encryption/decryption fails on a per-frame basis (informational) */
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  /** Called on frame processed (for metrics) */
  onFrame?: (direction: 'encrypt' | 'decrypt', size: number) => void;
  /** Called when the transform pipe breaks — caller must re-create producer/consumer to recover */
  onPipeBreak?: (info: PipeBreakInfo) => void;
  /**
   * Typed crypto event emitter — заменяет onError.
   * CallRuntime использует evaluateE2EERecovery() для принятия решения.
   */
  onCryptoEvent?: (event: import('./e2eeRecoveryPolicy').CryptoEvent) => void;
}

interface TransformEntry {
  readable: ReadableStream;
  writable: WritableStream;
}

interface ActiveTransformEntry extends TransformEntry {
  abortController: AbortController;
  /** Epoch трансформа — защита от ABA race: old pipe catch не удалит newer transform */
  transformEpoch: number;
}

interface ScriptTransformEntry {
  worker: Worker;
  /** Epoch трансформа — защита от ABA race */
  transformEpoch: number;
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
private currentEncryptionKey: { key: CryptoKey; keyId: number; epoch: number } | null = null;
   private currentDecryptionKeys: Map<string, { key: CryptoKey; keyId: number; epoch: number }> = new Map();
  private stats: MediaEncryptorStats = {
    encryptedFrames: 0,
    decryptedFrames: 0,
    encryptionErrors: 0,
    decryptionErrors: 0,
  };
  /** Transform epoch counter — инкрементируется при каждом createTransform. ABA race prevention. */
  private transformEpochCounter = 0;

  constructor(config: InsertableStreamsConfig = {}) {
    this.config = config;
    this.sframeContext = new SFrameContext();
  }

  /**
   * Emit typed CryptoEvent для CallRuntime RecoveryPolicy.
   * Это единственный способ связи crypto layer → CallRuntime.
   */
  private emitCryptoEvent(
    kind: import('./e2eeRecoveryPolicy').CryptoErrorKind,
    trackId: string,
    direction: 'encrypt' | 'decrypt',
    extra?: { peerId?: string; epoch?: number; frameCounter?: number }
  ): void {
    this.config.onCryptoEvent?.({
      kind,
      trackId,
      direction,
      peerId: extra?.peerId,
      epoch: extra?.epoch,
      frameCounter: extra?.frameCounter,
      timestamp: Date.now(),
    });
  }

  /** Increment transform epoch counter и вернуть новое значение */
  private nextTransformEpoch(): number {
    return ++this.transformEpochCounter;
  }

/**
     * Set the current encryption key for outgoing media
     */
   async setEncryptionKey(key: CryptoKey, keyId: number, epoch: number = keyId): Promise<void> {
     await this.sframeContext.setEncryptionKey(key, keyId, epoch);
     this.currentEncryptionKey = { key, keyId, epoch: epoch >>> 0 };

     // Propagate to script-transform workers (if any)
     // Include epoch for IV uniqueness during key rotation
     for (const { worker } of this.scriptTransforms.values()) {
       worker.postMessage({ 
         type: 'setEncryptionKey', 
         key, 
         keyId, 
         epoch
       });
     }
   }

  /**
    * Set a decryption key for incoming media from a specific peer
    */
  async setDecryptionKey(key: CryptoKey, keyId: number, peerId: string, epoch: number = keyId): Promise<void> {
    let ctx = this.decryptionContexts.get(peerId);
    if (!ctx) {
      ctx = new SFrameContext();
      this.decryptionContexts.set(peerId, ctx);
    }
    await ctx.setEncryptionKey(key, keyId, epoch);
    this.currentDecryptionKeys.set(peerId, { key, keyId, epoch: epoch >>> 0 });

    // Propagate to script-transform workers (if any)
    // Include epoch for IV reconstruction
    for (const { worker } of this.scriptTransforms.values()) {
      worker.postMessage({ 
        type: 'setDecryptionKey', 
        key, 
        keyId, 
        peerId,
        epoch: epoch >>> 0
      });
    }
  }

  private _createScriptWorker(trackId: string): Worker {
    const source = `
      const encState = { key: null, keyId: 0, counter: 0, epoch: 0 };
      const decStates = new Map();
      const MAX_REPLAY_WINDOW = 8192;

      function ensureReplayState(state) {
        if (!state.seenCounters) state.seenCounters = new Set();
        if (typeof state.highestSeenCounter !== 'number') state.highestSeenCounter = -1;
        return state;
      }

      function assertAndTrackCounter(state, counter) {
        ensureReplayState(state);
        const floor = state.highestSeenCounter >= 0 ? state.highestSeenCounter - MAX_REPLAY_WINDOW : -1;
        if (state.highestSeenCounter >= 0 && counter <= floor) {
          throw new Error('Stale SFrame counter ' + counter + ' (highest: ' + state.highestSeenCounter + ') — possible replay attack');
        }
        if (state.seenCounters.has(counter)) {
          throw new Error('Duplicate SFrame counter ' + counter + ' — possible replay attack');
        }

        state.seenCounters.add(counter);
        if (counter > state.highestSeenCounter) {
          state.highestSeenCounter = counter;
          const newFloor = state.highestSeenCounter - MAX_REPLAY_WINDOW;
          state.seenCounters.forEach((c) => {
            if (c <= newFloor) state.seenCounters.delete(c);
          });
        }
      }

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

      // IV-REUSE fix: include keyId in IV to prevent collision between audio/video senders
      // with same epoch/counter. Format: [keyId(4)|epoch(4)|counter_hi(4)|counter_lo(4)]
      function buildIV(keyId, epoch, counter) {
        const iv = new ArrayBuffer(16);
        const view = new DataView(iv);
        view.setUint32(0, keyId >>> 0, false);
        view.setUint32(4, epoch >>> 0, false);
        view.setUint32(8, Math.floor(counter / 0x100000000) >>> 0, false);
        view.setUint32(12, counter >>> 0, false);
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
          encState.keyId = msg.keyId & 0x7fffffff;
          encState.counter = 0;
          // Use epoch from message (already incremented in SFrameContext)
          encState.epoch = msg.epoch >>> 0;
        }
        if (msg.type === 'setDecryptionKey') {
          decStates.set(msg.peerId, {
            key: msg.key,
            keyId: msg.keyId & 0x7fffffff,
            epoch: msg.epoch >>> 0,
            highestSeenCounter: -1,
            seenCounters: new Set()
          });
        }
      });

      self.addEventListener('rtctransform', (event) => {
        try {
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
                const iv = buildIV(encState.keyId, encState.epoch, counter);
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
                // IV includes parsed.keyId from SFrame header — matches encrypt IV construction
                const iv = buildIV(parsed.keyId, state.epoch, parsed.counter);
                const plain = await crypto.subtle.decrypt(
                  { name: 'AES-GCM', iv, additionalData: headerBuf, tagLength: 128 },
                  state.key,
                  payloadBuf
                );
                assertAndTrackCounter(state, parsed.counter);
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

        transformer.readable.pipeThrough(t).pipeTo(transformer.writable).catch((err) => {
          self.postMessage({
            type: 'pipe_error',
            direction: operation === 'decrypt' ? 'decrypt' : 'encrypt',
            peerId,
            message: String(err)
          });
        });
        } catch (initErr) {
          self.postMessage({ type: 'error', direction: 'encrypt', message: 'rtctransform init: ' + String(initErr) });
        }
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
      const data = event.data as { type?: string; direction?: 'encrypt' | 'decrypt'; peerId?: string; size?: number; message?: string };
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
        const direction = data.direction ?? 'encrypt';
        logger.error('[E2EE] ScriptTransform pipe failed — recovery needed', { error: data.message, trackId, direction, peerId: data.peerId });
        // Epoch fence: stale worker не может удалить newer transform
        const scriptEntry = this.scriptTransforms.get(trackId);
        this.removeTransform(trackId, scriptEntry?.transformEpoch);
        this.config.onPipeBreak?.({
          trackId,
          direction,
          peerId: data.peerId,
          reason: String(data.message ?? 'pipe_error'),
          transformEpoch: scriptEntry?.transformEpoch ?? 0,
        });
      }
    };

    this.scriptTransforms.set(trackId, { worker, transformEpoch: 0 });
    return worker;
  }

  /**
   * Apply encryption transform to an outgoing RTCRtpSender.
   * Uses Insertable Streams (encoded transforms).
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    const currentEpoch = this.nextTransformEpoch();
    this.removeTransform(trackId, currentEpoch);
    const method = MediaEncryptor.getTransformMethod();
    logger.debug('[E2EE] setupSenderTransform', { trackId, method, transformEpoch: currentEpoch });

    // Method 1: RTCRtpScriptTransform (Chrome 118+, Firefox 117+, Safari 15.4+)
    // Приоритетный путь: не конфликтует с encodedInsertableStreams, нет timing-проблем
    if ('RTCRtpScriptTransform' in globalThis) {
      const senderWithStreams = sender as RTCRtpSenderWithStreams;
      const RTCRtpScriptTransformCtor = (globalThis as GlobalWithScriptTransform).RTCRtpScriptTransform!;
      const worker = this._createScriptWorker(trackId);
      senderWithStreams.transform = new RTCRtpScriptTransformCtor(worker, {
        operation: 'encrypt',
        trackId,
      });

      this.scriptTransforms.set(trackId, { worker, transformEpoch: currentEpoch });

      if (this.currentEncryptionKey) {
        worker.postMessage({
          type: 'setEncryptionKey',
          key: this.currentEncryptionKey.key,
          keyId: this.currentEncryptionKey.keyId,
          epoch: this.currentEncryptionKey.epoch,
        });
      }
      return;
    }

    // Method 2: createEncodedStreams (legacy Chrome 86–117)
    // Требует encodedInsertableStreams: true на PeerConnection
    if (typeof (sender as RTCRtpSenderWithStreams).createEncodedStreams === 'function') {
      try {
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
              const err = error as Error;
              this.config.onError?.(err, 'encrypt');
              // Emit typed crypto event для RecoveryPolicy
              this.emitCryptoEvent(
                err.message.includes('No encryption key set')
                  ? 'ENCRYPT_TRANSIENT_FAILURE'
                  : 'ENCRYPT_PERSISTENT_FAILURE',
                trackId,
                'encrypt',
                { epoch: this.currentEncryptionKey?.epoch }
              );
              // Fail-closed: rethrow so pipe breaks, pipeTo.catch fires onPipeBreak → caller recovery
              throw error;
            }
          },
        });

        const abortController = new AbortController();
        readable.pipeThrough(transformStream).pipeTo(writable, { signal: abortController.signal }).catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          logger.error('[MediaEncryptor] Sender pipe error — recovery needed', { error: err, trackId });
          this.removeTransform(trackId, currentEpoch);
          this.config.onPipeBreak?.({
            trackId,
            direction: 'encrypt',
            reason: String((err as Error)?.message ?? err),
            keyEpoch: this.currentEncryptionKey?.epoch,
            transformEpoch: currentEpoch,
          });
        });

        this.activeTransforms.set(trackId, { readable, writable, abortController, transformEpoch: currentEpoch });
        return;
      } catch (e) {
        logger.warn('[MediaEncryptor] createEncodedStreams failed (sender)', e);
      }
    }

    // C-4: No E2EE transform support at all — fail-closed
    throw new Error(
      '[MediaEncryptor] Neither RTCRtpScriptTransform nor createEncodedStreams ' +
      'is supported on this browser. E2EE media encryption unavailable.'
    );
  }

/**
   * Apply decryption transform to an incoming RTCRtpReceiver.
   */
  setupReceiverTransform(receiver: RTCRtpReceiver, trackId: string, peerId: string): void {
    const currentEpoch = this.nextTransformEpoch();
    this.removeTransform(trackId, currentEpoch);
    const method = MediaEncryptor.getTransformMethod();
    logger.debug('[E2EE] setupReceiverTransform', { trackId, peerId, method, transformEpoch: currentEpoch });

    // Method 1: RTCRtpScriptTransform (Chrome 118+, Firefox 117+, Safari 15.4+)
    if ('RTCRtpScriptTransform' in globalThis) {
      const receiverWithStreams = receiver as RTCRtpReceiverWithStreams;
      const RTCRtpScriptTransformCtor = (globalThis as GlobalWithScriptTransform).RTCRtpScriptTransform!;
      const worker = this._createScriptWorker(trackId);
      receiverWithStreams.transform = new RTCRtpScriptTransformCtor(worker, {
        operation: 'decrypt',
        trackId,
        peerId,
      });

      this.scriptTransforms.set(trackId, { worker, transformEpoch: currentEpoch });

      const keyState = this.currentDecryptionKeys.get(peerId);
      if (keyState) {
        worker.postMessage({
          type: 'setDecryptionKey',
          key: keyState.key,
          keyId: keyState.keyId,
          peerId,
          epoch: keyState.epoch,
        });
      }
      return;
    }

    // Method 2: createEncodedStreams (legacy Chrome 86–117)
    if (typeof (receiver as RTCRtpReceiverWithStreams).createEncodedStreams === 'function') {
      try {
        const { readable, writable } = (receiver as RTCRtpReceiverWithStreams).createEncodedStreams!() as TransformEntry;

        const transformStream = new TransformStream({
          transform: async (frame: EncodedFrame, controller: TransformStreamDefaultController<EncodedFrame>) => {
            const ctx = this.decryptionContexts.get(peerId);
            if (!ctx) {
              // No key yet — frame will be dropped until caller calls setDecryptionKey.
              // This is normal during call bootstrap; no error logged to avoid noise.
              return;
            }
            try {
              const decryptedData = await ctx.decryptFrame(frame.data as ArrayBuffer);
              frame.data = decryptedData;
              this.stats.decryptedFrames++;
              this.config.onFrame?.('decrypt', decryptedData.byteLength);
              controller.enqueue(frame);
            } catch (error) {
              this.stats.decryptionErrors++;
              const err = error as Error;
              this.config.onError?.(err, 'decrypt');

              // Typed crypto events для RecoveryPolicy
              if (err.message.includes('No decryption key set')) {
                this.emitCryptoEvent('MISSING_KEY', trackId, 'decrypt', { peerId });
              } else if (err.message.includes('Stale SFrame counter')) {
                this.emitCryptoEvent('STALE_KEY_EPOCH', trackId, 'decrypt', {
                  peerId,
                  epoch: this.currentDecryptionKeys.get(peerId)?.epoch,
                });
              } else if (err.message.includes('AUTH') || err.message.includes('tag') || err.message.includes('decrypt')) {
                this.emitCryptoEvent('AUTH_TAG_FAILED', trackId, 'decrypt', { peerId });
              } else if (err.message.includes('Malformed')) {
                this.emitCryptoEvent('MALFORMED_FRAME', trackId, 'decrypt', { peerId });
              } else {
                this.emitCryptoEvent('DECRYPT_TRANSIENT_FAILURE', trackId, 'decrypt', { peerId });
              }

              // Fail-closed: rethrow so pipe breaks → pipeTo.catch fires onPipeBreak → caller recovery
              throw error;
            }
          },
        });

        const abortController = new AbortController();
        readable.pipeThrough(transformStream).pipeTo(writable, { signal: abortController.signal }).catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          logger.error('[MediaEncryptor] Receiver pipe error — recovery needed', { error: err, trackId, peerId });
          this.removeTransform(trackId, currentEpoch);
          this.config.onPipeBreak?.({
            trackId,
            direction: 'decrypt',
            peerId,
            reason: String((err as Error)?.message ?? err),
            keyEpoch: this.currentDecryptionKeys.get(peerId)?.epoch,
            transformEpoch: currentEpoch,
          });
        });

        this.activeTransforms.set(trackId, { readable, writable, abortController, transformEpoch: currentEpoch });
        return;
      } catch (e) {
        logger.warn('[MediaEncryptor] createEncodedStreams failed (receiver)', e);
      }
    }

    // C-4: No E2EE transform support — fail-closed
    throw new Error(
      '[MediaEncryptor] Neither RTCRtpScriptTransform nor createEncodedStreams ' +
      'is supported on this browser. E2EE media decryption unavailable.'
    );
  }

  /**
   * Remove transform entry for a specific track — idempotent, epoch-fenced.
   *
   * ABA race prevention: если old pipe catch пытается удалить transform,
   * а newer transform уже создан с большим epoch — old removal игнорируется.
   *
   * @param trackId — ID трека
   * @param transformEpoch — epoch трансформа который хочет удалить себя.
   *                          Если текущий transform имеет больший epoch — removal блокируется.
   */
  removeTransform(trackId: string, transformEpoch?: number): void {
    const entry = this.activeTransforms.get(trackId);
    if (entry) {
      // Epoch fence: stale transform не может удалить newer transform
      if (transformEpoch !== undefined && entry.transformEpoch > transformEpoch) {
        logger.debug('[MediaEncryptor] removeTransform blocked: stale epoch', {
          trackId,
          staleEpoch: transformEpoch,
          currentEpoch: entry.transformEpoch,
        });
        return;
      }
      entry.abortController.abort();
      this.activeTransforms.delete(trackId);
      logger.debug('[MediaEncryptor] removeTransform: activeTransform removed', { trackId });
    }

    const scriptEntry = this.scriptTransforms.get(trackId);
    if (scriptEntry) {
      // Epoch fence for script transforms
      if (transformEpoch !== undefined && scriptEntry.transformEpoch > transformEpoch) {
        logger.debug('[MediaEncryptor] removeTransform blocked: stale script epoch', {
          trackId,
          staleEpoch: transformEpoch,
          currentEpoch: scriptEntry.transformEpoch,
        });
        return;
      }
      scriptEntry.worker.terminate();
      this.scriptTransforms.delete(trackId);
      logger.debug('[MediaEncryptor] removeTransform: scriptTransform removed', { trackId });
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
    // RTCRtpScriptTransform приоритетнее: работает без encodedInsertableStreams и без timing-проблем
    if ('RTCRtpScriptTransform' in globalThis) {
      return 'scriptTransform';
    }
    if (typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype) {
      return 'encodedStreams';
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

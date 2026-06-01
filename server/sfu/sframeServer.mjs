/**
 * Server-side SFrame encryption for mediasoup media pipeline.
 *
 * Provides E2EE that works regardless of client browser capabilities.
 * The SFU acts as the encryption endpoint — clients communicate with SFU
 * via standard WebRTC, and SFU applies SFrame encryption/decryption for
 * inter-peer communication.
 *
 * Architecture:
 * - Each peer has an SRTP connection to SFU (standard WebRTC)
 * - SFU decrypts inbound media, applies SFrame encryption, forwards to peers
 * - SFU receives SFrame-encrypted media from peers, decrypts, applies SRTP for outbound
 *
 * Key management: Uses the existing epoch system from client-side E2EE.
 * SFU receives public keys via KEY_PACKAGE messages, stores them per peer.
 * When a peer sends media, SFU uses that peer's key to decrypt.
 * SFU encrypts outbound media with each recipient's key.
 */

import crypto from 'node:crypto';

// ─── SFrame for Node.js ───────────────────────────────────────────────────────

const MAX_REPLAY_WINDOW = 8192;

interface SFrameServerContext {
  key: CryptoKey | null;
  counter: number;
  keyId: number;
  epoch: number;
  highestSeenCounter: number;
  seenCounters: Set<number>;
}

function encodeVarInt(value: number): Buffer {
  if (value < 0) throw new Error('VarInt must be non-negative');
  if (value === 0) return Buffer.from([0]);

  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0x7f);
    v = Math.floor(v / 128);
  }
  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 0x80;
  }
  return Buffer.from(bytes);
}

function decodeVarInt(data: Buffer, offset: number): [number, number] {
  let value = 0;
  let consumed = 0;
  let i = offset;
  while (i < data.length) {
    const byte = data[i++];
    value = value * 128 + (byte & 0x7f);
    consumed++;
    if (!(byte & 0x80)) break;
    if (consumed > 7) throw new Error('VarInt overflow');
  }
  return [value, i - offset];
}

function buildIV(epoch: number, counter: number): Buffer {
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(epoch >>> 0, 0);
  // counter as 64-bit big-endian
  iv.writeUInt32BE(Math.floor(counter / 0x100000000) >>> 0, 4);
  iv.writeUInt32BE(counter >>> 0, 8);
  return iv;
}

function createSFrameContext(): SFrameServerContext {
  return {
    key: null,
    counter: 0,
    keyId: 0,
    epoch: 0,
    highestSeenCounter: -1,
    seenCounters: new Set(),
  };
}

// Import Web Crypto for AES-GCM
const webcrypto = crypto.webcrypto;

async function importKey(keyBytes: Buffer, keyId: number): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptFrame(
  ctx: SFrameServerContext,
  frame: Buffer
): Promise<Buffer> {
  if (!ctx.key) throw new Error('No encryption key set');

  const counter = ctx.counter++;
  const header = buildHeader(ctx.keyId, counter);
  const iv = buildIV(ctx.epoch, counter);

  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: header, tagLength: 128 },
    ctx.key,
    frame
  );

  return Buffer.concat([header, Buffer.from(encrypted)]);
}

async function decryptFrame(
  ctx: SFrameServerContext,
  frame: Buffer
): Promise<Buffer> {
  if (!ctx.key) throw new Error('No decryption key set');

  const parsed = parseHeader(frame);
  if (!parsed) throw new Error('Invalid SFrame header');

  const { counter, headerLength } = parsed;

  // Replay protection
  const floor = ctx.highestSeenCounter >= 0
    ? ctx.highestSeenCounter - MAX_REPLAY_WINDOW
    : -1;
  if (ctx.highestSeenCounter >= 0 && counter <= floor) {
    throw new Error(`Stale SFrame counter ${counter}`);
  }
  if (ctx.seenCounters.has(counter)) {
    throw new Error(`Duplicate SFrame counter ${counter}`);
  }

  const iv = buildIV(ctx.epoch, counter);
  const headerBuf = frame.subarray(0, headerLength);
  const payloadBuf = frame.subarray(headerLength);

  const decrypted = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: headerBuf, tagLength: 128 },
    ctx.key,
    payloadBuf
  );

  ctx.seenCounters.add(counter);
  if (counter > ctx.highestSeenCounter) {
    ctx.highestSeenCounter = counter;
    // Range-based eviction
    const newFloor = ctx.highestSeenCounter - MAX_REPLAY_WINDOW;
    for (const c of ctx.seenCounters) {
      if (c <= newFloor) ctx.seenCounters.delete(c);
    }
  }

  return Buffer.from(decrypted);
}

function buildHeader(keyId: number, counter: number): Buffer {
  const counterBytes = encodeVarInt(counter);
  if (keyId <= 0x7f) {
    const buf = Buffer.alloc(1 + counterBytes.length);
    buf[0] = keyId & 0x7f;
    counterBytes.copy(buf, 1);
    return buf;
  }
  // Long header
  let kidBytes = 0;
  let tmp = keyId >> 4;
  while (tmp > 0) { kidBytes++; tmp >>= 8; }
  kidBytes = Math.min(kidBytes, 7);

  const buf = Buffer.alloc(1 + kidBytes + counterBytes.length);
  buf[0] = 0x80 | ((kidBytes & 0x07) << 4) | ((keyId >> (kidBytes * 8)) & 0x0f);
  for (let i = 0; i < kidBytes; i++) {
    buf[1 + i] = (keyId >> ((kidBytes - 1 - i) * 8)) & 0xff;
  }
  counterBytes.copy(buf, 1 + kidBytes);
  return buf;
}

interface ParsedHeader {
  keyId: number;
  counter: number;
  headerLength: number;
}

function parseHeader(data: Buffer): ParsedHeader | null {
  try {
    if (data.length < 2) return null;
    const firstByte = data[0];
    const xBit = (firstByte & 0x80) !== 0;

    let offset = 0;
    let keyId: number;

    if (!xBit) {
      keyId = firstByte & 0x7f;
      offset = 1;
    } else {
      const lenField = (firstByte >> 4) & 0x07;
      const kidHigh = firstByte & 0x0f;
      offset = 1;
      keyId = kidHigh;
      for (let i = 0; i < lenField && offset < data.length; i++, offset++) {
        keyId = (keyId << 8) | data[offset];
      }
    }

    const [counter, consumed] = decodeVarInt(data, offset);
    offset += consumed;

    return { keyId, counter, headerLength: offset };
  } catch {
    return null;
  }
}

// ─── SFU SFrame Manager ───────────────────────────────────────────────────────

export interface SfuE2eeConfig {
  /** Enable server-side SFrame encryption */
  enabled: boolean;
  /** Key ID used for server-side SFrame (epoch mapped) */
  baseKeyId?: number;
}

export interface PeerKeyMaterial {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  keyId: number;
  epoch: number;
}

/**
 * Manages SFrame encryption/decryption for all peers in a room.
 * Used by mediasoup controller to encrypt/decrypt media between SFU and peers.
 */
export class SfuSFrameManager {
  private config: SfuE2eeConfig;
  /** deviceId -> encryptor context for outbound to this peer */
  private peerEncryptors: Map<string, SFrameServerContext> = new Map();
  /** deviceId -> decryptor context for inbound from this peer */
  private peerDecryptors: Map<string, SFrameServerContext> = new Map();
  /** epoch -> master key for rekeying */
  private epochKeys: Map<number, CryptoKey> = new Map();
  private currentEpoch: number = 0;
  private stats = {
    encryptedFrames: 0,
    decryptedFrames: 0,
    encryptionErrors: 0,
    decryptionErrors: 0,
  };

  constructor(config: SfuE2eeConfig = { enabled: false }) {
    this.config = config;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Set the current epoch and its encryption key.
   * Called during E2EE_READY or REKEY processing.
   */
  async setEpochKey(epoch: number, keyBytes: Buffer): Promise<void> {
    this.currentEpoch = epoch;
    const key = await importKey(keyBytes, epoch & 0xff);
    this.epochKeys.set(epoch, key);

    // Update all peer encryptors with new key
    for (const [, ctx] of this.peerEncryptors) {
      ctx.key = key;
      ctx.keyId = epoch & 0xff;
      ctx.epoch = epoch;
      ctx.counter = 0;
      ctx.highestSeenCounter = -1;
      ctx.seenCounters.clear();
    }

    console.log(`[SfuSFrame] Epoch ${epoch} key set, ${this.peerEncryptors.size} encryptors updated`);
  }

  /**
   * Add a peer's decryption key (inbound media from this peer).
   * Called when processing KEY_PACKAGE from a peer.
   */
  async addPeerDecryptionKey(
    peerDeviceId: string,
    keyBytes: Buffer,
    keyId: number
  ): Promise<void> {
    let ctx = this.peerDecryptors.get(peerDeviceId);
    if (!ctx) {
      ctx = createSFrameContext();
      this.peerDecryptors.set(peerDeviceId, ctx);
    }

    ctx.key = await importKey(keyBytes, keyId);
    ctx.keyId = keyId;
    ctx.counter = 0;
    ctx.highestSeenCounter = -1;
    ctx.seenCounters.clear();

    console.log(`[SfuSFrame] Decryption key added for peer ${peerDeviceId.slice(0, 8)}, keyId=${keyId}`);
  }

  /**
   * Remove peer's encryption context (peer left).
   */
  removePeer(peerDeviceId: string): void {
    this.peerEncryptors.delete(peerDeviceId);
    this.peerDecryptors.delete(peerDeviceId);
    console.log(`[SfuSFrame] Peer removed: ${peerDeviceId.slice(0, 8)}`);
  }

  /**
   * Encrypt outbound media for a specific peer.
   * Called when SFU forwards media to a consumer.
   */
  async encryptForPeer(peerDeviceId: string, frame: Buffer): Promise<Buffer> {
    let ctx = this.peerEncryptors.get(peerDeviceId);
    if (!ctx || !ctx.key) {
      // Auto-create with current epoch key
      const key = this.epochKeys.get(this.currentEpoch);
      if (!key) {
        this.stats.encryptionErrors++;
        throw new Error(`No encryption key for epoch ${this.currentEpoch}`);
      }
      ctx = createSFrameContext();
      ctx.key = key;
      ctx.keyId = this.currentEpoch & 0xff;
      ctx.epoch = this.currentEpoch;
      this.peerEncryptors.set(peerDeviceId, ctx);
    }

    try {
      const encrypted = await encryptFrame(ctx, frame);
      this.stats.encryptedFrames++;
      return encrypted;
    } catch (error) {
      this.stats.encryptionErrors++;
      throw error;
    }
  }

  /**
   * Decrypt inbound media from a specific peer.
   * Called when SFU receives media from a producer.
   */
  async decryptFromPeer(peerDeviceId: string, frame: Buffer): Promise<Buffer> {
    const ctx = this.peerDecryptors.get(peerDeviceId);
    if (!ctx || !ctx.key) {
      this.stats.decryptionErrors++;
      throw new Error(`No decryption key for peer ${peerDeviceId.slice(0, 8)}`);
    }

    try {
      const decrypted = await decryptFrame(ctx, frame);
      this.stats.decryptedFrames++;
      return decrypted;
    } catch (error) {
      this.stats.decryptionErrors++;
      throw error;
    }
  }

  /**
   * Check if we can encrypt for a peer (has key).
   */
  canEncryptForPeer(peerDeviceId: string): boolean {
    const ctx = this.peerEncryptors.get(peerDeviceId);
    return !!ctx?.key || this.epochKeys.has(this.currentEpoch);
  }

  /**
   * Check if we can decrypt from a peer (has key).
   */
  canDecryptFromPeer(peerDeviceId: string): boolean {
    const ctx = this.peerDecryptors.get(peerDeviceId);
    return !!ctx?.key;
  }

  getStats() {
    return { ...this.stats };
  }

  reset(): void {
    this.peerEncryptors.clear();
    this.peerDecryptors.clear();
    this.epochKeys.clear();
    this.currentEpoch = 0;
    this.stats = {
      encryptedFrames: 0,
      decryptedFrames: 0,
      encryptionErrors: 0,
      decryptionErrors: 0,
    };
  }
}

// ─── Integration helpers ─────────────────────────────────────────────────────

/**
 * Creates a new SfuSFrameManager for a room.
 */
export function createSfuSFrameManager(enabled = true): SfuSFrameManager {
  return new SfuSFrameManager({ enabled });
}

/**
 * Parse raw epoch key from base64 (received via KEY_PACKAGE).
 */
export function parseEpochKey(base64Key: string): Buffer {
  return Buffer.from(base64Key, 'base64');
}
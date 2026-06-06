/**
 * Media Encryption — E2EE transform streams for call media.
 *
 * Responsible for:
 * - Applying SFrame encryption to outgoing tracks
 * - Applying SFrame decryption to incoming tracks
 * - Key management (epoch rotation)
 */

// Browser Web Crypto is used by MediaEncryptor/SFrame internally.

import { MediaEncryptor } from "@/lib/e2ee/insertableStreams";

export interface E2EEConfig {
  key: CryptoKey;
  keyId: number;
  peerId?: string;
  epoch?: number;
}

const senderEncryptors = new WeakMap<RTCRtpSender, { trackId: string; encryptor: MediaEncryptor }>();
const receiverEncryptors = new WeakMap<RTCRtpReceiver, { trackId: string; encryptor: MediaEncryptor }>();

function assertConfig(config: E2EEConfig): void {
  if (!config?.key) {
    throw new Error("[features/calls/e2eeTransform] E2EE key is required");
  }
  if (!Number.isFinite(config.keyId) || config.keyId < 0) {
    throw new Error("[features/calls/e2eeTransform] keyId must be a non-negative finite number");
  }
}

function senderTrackId(sender: RTCRtpSender): string {
  return sender.track?.id ?? `sender-${configSafeRandomId()}`;
}

function receiverTrackId(receiver: RTCRtpReceiver, peerId: string): string {
  return receiver.track?.id ?? `receiver-${peerId}-${configSafeRandomId()}`;
}

function configSafeRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

/**
 * Setup encryption transform on RTCRtpSender.
 * Returns cleanup function.
 */
export async function setupSenderEncryption(
  sender: RTCRtpSender,
  config: E2EEConfig
): Promise<() => void> {
  assertConfig(config);

  if (!isE2EESupported()) {
    throw new Error("[features/calls/e2eeTransform] E2EE transform support is unavailable");
  }

  removeEncryptionTransforms(sender);

  const trackId = senderTrackId(sender);
  const encryptor = new MediaEncryptor();
  await encryptor.setEncryptionKey(config.key, config.keyId, config.epoch ?? config.keyId);
  encryptor.setupSenderTransform(sender, trackId);
  senderEncryptors.set(sender, { trackId, encryptor });

  return () => removeEncryptionTransforms(sender);
}

/**
 * Setup decryption transform on RTCRtpReceiver.
 * Returns cleanup function.
 */
export async function setupReceiverEncryption(
  receiver: RTCRtpReceiver,
  config: E2EEConfig
): Promise<() => void> {
  assertConfig(config);

  if (!config.peerId?.trim()) {
    throw new Error("[features/calls/e2eeTransform] peerId is required for receiver decryption");
  }
  if (!isE2EESupported()) {
    throw new Error("[features/calls/e2eeTransform] E2EE transform support is unavailable");
  }

  removeEncryptionTransforms(undefined, receiver);

  const peerId = config.peerId.trim();
  const trackId = receiverTrackId(receiver, peerId);
  const encryptor = new MediaEncryptor();
  await encryptor.setDecryptionKey(config.key, config.keyId, peerId, config.epoch ?? config.keyId);
  encryptor.setupReceiverTransform(receiver, trackId, peerId);
  receiverEncryptors.set(receiver, { trackId, encryptor });

  return () => removeEncryptionTransforms(undefined, receiver);
}

/**
 * Remove all transforms from sender/receiver.
 */
export function removeEncryptionTransforms(
  sender?: RTCRtpSender,
  receiver?: RTCRtpReceiver
): void {
  if (sender) {
    const entry = senderEncryptors.get(sender);
    if (entry) {
      entry.encryptor.removeTransform(entry.trackId);
      senderEncryptors.delete(sender);
    }
  }

  if (receiver) {
    const entry = receiverEncryptors.get(receiver);
    if (entry) {
      entry.encryptor.removeTransform(entry.trackId);
      receiverEncryptors.delete(receiver);
    }
  }
}

/**
 * Check if Insertable Streams are supported in current browser.
 */
export function isE2EESupported(): boolean {
  return MediaEncryptor.isSupported();
}

/**
 * Get minimum SFrame key length in bytes.
 */
export const SFRAME_KEY_LENGTH = 32;

/**
 * Get minimum nonce length in bytes.
 */
export const SFRAME_NONCE_LENGTH = 12;
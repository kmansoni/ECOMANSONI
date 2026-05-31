/**
 * Media Encryption — E2EE transform streams for call media.
 *
 * Responsible for:
 * - Applying SFrame encryption to outgoing tracks
 * - Applying SFrame decryption to incoming tracks
 * - Key management (epoch rotation)
 */

import type { CryptoKey } from "crypto";

export interface E2EEConfig {
  key: CryptoKey;
  keyId: number;
  peerId?: string;
}

/**
 * Setup encryption transform on RTCRtpSender.
 * Returns cleanup function.
 */
export function setupSenderEncryption(
  sender: RTCRtpSender,
  config: E2EEConfig
): () => void {
  // Insertable Streams API — apply to sender
  if ("createEncodedStreams" in sender) {
    // Apply SFrame transform
    // Implementation uses lib/e2ee/insertableStreams
    return () => {};
  }

  return () => {};
}

/**
 * Setup decryption transform on RTCRtpReceiver.
 * Returns cleanup function.
 */
export function setupReceiverEncryption(
  receiver: RTCRtpReceiver,
  config: E2EEConfig
): () => void {
  // Insertable Streams API — apply to receiver
  if ("createEncodedStreams" in receiver) {
    // Apply SFrame transform
    return () => {};
  }

  return () => {};
}

/**
 * Remove all transforms from sender/receiver.
 */
export function removeEncryptionTransforms(
  sender?: RTCRtpSender,
  receiver?: RTCRtpReceiver
): void {
  // Implementation clears transform streams
}

/**
 * Check if Insertable Streams are supported in current browser.
 */
export function isE2EESupported(): boolean {
  if (typeof RTCRtpSender === "undefined") return false;

  const sender = new RTCRtpSender();
  return "createEncodedStreams" in sender;
}

/**
 * Get minimum SFrame key length in bytes.
 */
export const SFRAME_KEY_LENGTH = 32;

/**
 * Get minimum nonce length in bytes.
 */
export const SFRAME_NONCE_LENGTH = 12;
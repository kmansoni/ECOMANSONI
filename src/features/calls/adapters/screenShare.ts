/**
 * Screen Share Adapter — handles screen capture for calls.
 */

import { logger } from "@/lib/logger";

export interface ScreenShareOptions {
  video?: boolean;
  audio?: boolean;
}

export interface ScreenShareResult {
  stream: MediaStream;
  track: MediaStreamTrack;
}

/**
 * Acquire screen share stream.
 */
export async function acquireScreenShare(
  options: ScreenShareOptions = {}
): Promise<ScreenShareResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture not supported");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: options.video === false ? false : {
      cursor: "always",
      displaySurface: "monitor",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    } as MediaTrackConstraints,
    audio: options.audio ?? false,
  });

  const track = stream.getVideoTracks()[0];

  if (!track) {
    throw new Error("No video track in screen share");
  }

  logger.info("[ScreenShare] Stream acquired", {
    label: track.label,
    width: track.getSettings().width,
    height: track.getSettings().height,
  });

  // Stop audio if not requested
  if (!options.audio) {
    stream.getAudioTracks().forEach((t) => t.stop());
  }

  return { stream, track };
}

/**
 * Check if screen share is supported.
 */
export function isScreenShareSupported(): boolean {
  return typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia;
}
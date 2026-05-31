/**
 * Local Media — manages local MediaStream acquisition and track lifecycle.
 *
 * Responsible for:
 * - Acquiring camera and microphone streams
 * - Track replacement (mute/unmute, camera toggle)
 * - Track cleanup
 */

import { logger } from "@/lib/logger";

export interface LocalMediaOptions {
  audio?: boolean;
  video?: boolean;
  cameraId?: string;
  microphoneId?: string;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  videoFacingMode?: "user" | "environment";
}

const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

/**
 * Local Media Manager — handles camera/mic streams.
 */
export class LocalMediaManager {
  private _stream: MediaStream | null = null;
  private _audioTrack: MediaStreamTrack | null = null;
  private _videoTrack: MediaStreamTrack | null = null;
  private _isMuted = false;
  private _isVideoOff = false;

  get stream(): MediaStream | null {
    return this._stream;
  }

  get audioTrack(): MediaStreamTrack | null {
    return this._audioTrack;
  }

  get videoTrack(): MediaStreamTrack | null {
    return this._videoTrack;
  }

  get isMuted(): boolean {
    return this._isMuted;
  }

  get isVideoOff(): boolean {
    return this._isVideoOff;
  }

  get hasAudio(): boolean {
    return !!this._audioTrack && !this._isMuted;
  }

  get hasVideo(): boolean {
    return !!this._videoTrack && !this._isVideoOff;
  }

  /**
   * Acquire local media stream.
   */
  async acquire(options: LocalMediaOptions = {}): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {};

    if (options.audio !== false) {
      constraints.audio = {
        ...DEFAULT_AUDIO_CONSTRAINTS,
        ...(options.microphoneId ? { deviceId: { exact: options.microphoneId } } : {}),
      };
    }

    if (options.video !== false) {
      constraints.video = {
        ...DEFAULT_VIDEO_CONSTRAINTS,
        ...(options.cameraId ? { deviceId: { exact: options.cameraId } } : {}),
        ...(options.videoFacingMode ? { facingMode: options.videoFacingMode } : {}),
      };
    }

    logger.info("[LocalMedia] Acquiring stream", { constraints });

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    this._stream = stream;
    this._audioTrack = stream.getAudioTracks()[0] ?? null;
    this._videoTrack = stream.getVideoTracks()[0] ?? null;
    this._isMuted = false;
    this._isVideoOff = false;

    logger.info("[LocalMedia] Stream acquired", {
      audio: !!this._audioTrack,
      video: !!this._videoTrack,
      videoLabel: this._videoTrack?.label,
    });

    return stream;
  }

  /**
   * Toggle microphone mute.
   */
  toggleMute(): void {
    if (!this._audioTrack) return;

    this._isMuted = !this._isMuted;
    this._audioTrack.enabled = !this._isMuted;

    logger.info("[LocalMedia] Mute toggled", { muted: this._isMuted });
  }

  /**
   * Toggle camera on/off.
   */
  toggleVideo(): void {
    if (!this._videoTrack) return;

    this._isVideoOff = !this._isVideoOff;
    this._videoTrack.enabled = !this._isVideoOff;

    logger.info("[LocalMedia] Video toggled", { off: this._isVideoOff });
  }

  /**
   * Mute microphone.
   */
  mute(): void {
    if (this._audioTrack && !this._isMuted) {
      this._isMuted = true;
      this._audioTrack.enabled = false;
    }
  }

  /**
   * Unmute microphone.
   */
  unmute(): void {
    if (this._audioTrack && this._isMuted) {
      this._isMuted = false;
      this._audioTrack.enabled = true;
    }
  }

  /**
   * Enable video.
   */
  enableVideo(): void {
    if (this._videoTrack && this._isVideoOff) {
      this._isVideoOff = false;
      this._videoTrack.enabled = true;
    }
  }

  /**
   * Disable video.
   */
  disableVideo(): void {
    if (this._videoTrack && !this._isVideoOff) {
      this._isVideoOff = true;
      this._videoTrack.enabled = false;
    }
  }

  /**
   * Replace video track (e.g., for camera switch).
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (this._stream && this._videoTrack) {
      this._stream.removeTrack(this._videoTrack);
      this._videoTrack.stop();
    }

    this._videoTrack = newTrack;

    if (this._stream) {
      this._stream.addTrack(newTrack);
    }

    if (this._isVideoOff) {
      newTrack.enabled = false;
    }

    logger.info("[LocalMedia] Video track replaced");
  }

  /**
   * Release all media tracks.
   */
  release(): void {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
    }

    this._stream = null;
    this._audioTrack = null;
    this._videoTrack = null;
    this._isMuted = false;
    this._isVideoOff = false;

    logger.info("[LocalMedia] Media released");
  }
}

// Singleton for app-wide use
export const localMediaManager = new LocalMediaManager();
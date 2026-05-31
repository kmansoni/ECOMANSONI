/**
 * SFU Transport — wraps mediasoup-client for send/receive transport management.
 *
 * Responsible for:
 * - Creating and managing send/recv transports
 * - Producing local tracks to SFU
 * - Consuming remote tracks from SFU
 * - Transport cleanup
 */

import type { RtpCapabilities } from "@/calls-v2/types";
import type { Device } from "mediasoup-client";
import type { Transport as MediasoupTransport } from "mediasoup-client";

export interface TransportOptions {
  iceServers?: RTCIceServer[];
  direction: "send" | "recv";
}

export interface ProduceResult {
  producerId: string;
  transportId: string;
}

export interface ConsumeResult {
  consumerId: string;
  producerId: string;
  track: MediaStreamTrack;
  kind: "audio" | "video";
}

/**
 * Manages SFU send and receive transports.
 */
export class SfuTransportManager {
  private _sendTransport: MediasoupTransport | null = null;
  private _recvTransport: MediasoupTransport | null = null;
  private _device: Device | null = null;
  private _roomId: string | null = null;

  get sendTransport(): MediasoupTransport | null {
    return this._sendTransport;
  }

  get recvTransport(): MediasoupTransport | null {
    return this._recvTransport;
  }

  get isConnected(): boolean {
    return !!(this._sendTransport?.connected && this._recvTransport?.connected);
  }

  /**
   * Load SFU device with router capabilities.
   */
  async loadDevice(routerRtpCapabilities: RtpCapabilities): Promise<void> {
    const { Device } = await import("mediasoup-client");
    this._device = new Device();

    if (routerRtpCapabilities) {
      await this._device.load({ routerRtpCapabilities });
    }
  }

  /**
   * Create send transport for publishing local media.
   */
  createSendTransport(
    transportOptions: {
      id: string;
      iceParameters: RTCIceParameters;
      iceCandidates: RTCIceCandidate[];
      dtlsParameters: RTCDtlsParameters;
    },
    iceServers?: RTCIceServer[]
  ): MediasoupTransport | null {
    if (!this._device) return null;

    const transport = this._device.createSendTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates,
      dtlsParameters: transportOptions.dtlsParameters,
      ...(iceServers ? { iceServers } : {}),
    });

    this._sendTransport = transport;
    return transport;
  }

  /**
   * Create receive transport for subscribing to remote media.
   */
  createRecvTransport(
    transportOptions: {
      id: string;
      iceParameters: RTCIceParameters;
      iceCandidates: RTCIceCandidate[];
      dtlsParameters: RTCDtlsParameters;
    },
    iceServers?: RTCIceServer[]
  ): MediasoupTransport | null {
    if (!this._device) return null;

    const transport = this._device.createRecvTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates,
      dtlsParameters: transportOptions.dtlsParameters,
      ...(iceServers ? { iceServers } : {}),
    });

    this._recvTransport = transport;
    return transport;
  }

  /**
   * Produce local track to SFU.
   */
  async produce(
    transport: MediasoupTransport,
    track: MediaStreamTrack,
    kind: "audio" | "video"
  ): Promise<string> {
    const producer = await transport.produce({
      track,
      appData: { kind },
    });

    return producer.id;
  }

  /**
   * Consume remote producer.
   */
  async consume(
    transport: MediasoupTransport,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<ConsumeResult | null> {
    if (!this._device) return null;

    if (!this._device.canConsume({ producerId, rtpCapabilities })) {
      return null;
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      appData: {},
    });

    return {
      consumerId: consumer.id,
      producerId,
      track: consumer.track,
      kind: consumer.kind,
    };
  }

  /**
   * Resume consumer (start receiving).
   */
  async resume(transport: MediasoupTransport, consumerId: string): Promise<void> {
    // Consumer resume is handled via signaling
  }

  /**
   * Close consumer.
   */
  closeConsumer(consumerId: string): void {
    // Handled via signaling
  }

  /**
   * Close all transports and cleanup.
   */
  close(): void {
    if (this._sendTransport && !this._sendTransport.closed) {
      this._sendTransport.close();
    }
    if (this._recvTransport && !this._recvTransport.closed) {
      this._recvTransport.close();
    }

    this._sendTransport = null;
    this._recvTransport = null;
    this._roomId = null;
  }
}

// Singleton for app-wide use
export const sfuTransportManager = new SfuTransportManager();
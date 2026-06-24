/**
 * SFU Transport — wraps mediasoup-client for send/receive transport management.
 *
 * Responsible for:
 * - Creating and managing send/recv transports
 * - Producing local tracks to SFU
 * - Consuming remote tracks from SFU
 * - Transport cleanup
 */

import type { RtpCapabilities, DtlsParameters } from "@/calls-v2/types";
import { Device } from "mediasoup-client";
import { logger } from "@/lib/logger";

// Re-export types that callers might need
export { Device } from "mediasoup-client";

export interface TransportOptions {
  iceServers?: RTCIceServer[];
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

export type SfuTransport = {
  readonly id: string;
  readonly closed: boolean;
  readonly connected: boolean;
  produce(options: { track: MediaStreamTrack; appData?: Record<string, unknown> }): Promise<{ id: string }>;
  consume(options: { producerId: string; rtpCapabilities: unknown; appData?: Record<string, unknown> }): Promise<{
    id: string;
    track: MediaStreamTrack;
    kind: 'audio' | 'video';
  }>;
  close(): void;
};

/**
 * Manages SFU send and receive transports.
 */
export class SfuTransportManager {
  private _sendTransport: SfuTransport | null = null;
  private _recvTransport: SfuTransport | null = null;
  private _device: Device | null = null;
  private _roomId: string | null = null;

  get sendTransport(): SfuTransport | null {
    return this._sendTransport;
  }

  get recvTransport(): SfuTransport | null {
    return this._recvTransport;
  }

  get isConnected(): boolean {
    return !!(this._sendTransport?.connected && this._recvTransport?.connected);
  }

  /**
   * Load SFU device with router capabilities.
   */
  async loadDevice(routerRtpCapabilities: RtpCapabilities): Promise<void> {
    this._device = new Device();

    if (routerRtpCapabilities && this._device) {
      const msCapabilities = {
        codecs: routerRtpCapabilities.codecs?.map(codec => ({
          mimeType: codec.mimeType,
          kind: codec.kind as 'audio' | 'video',
          preferredPayloadType: codec.preferredPayloadType ?? 0,
          clockRate: codec.clockRate,
          channels: codec.channels,
          parameters: codec.parameters ?? {},
          rtcpFeedback: codec.rtcpFeedback ?? [],
        })),
        headerExtensions: routerRtpCapabilities.headerExtensions?.map(ext => ({
          uri: ext.uri,
          kind: (ext.kind || '') as 'audio' | 'video' | '',
          preferredId: ext.preferredId,
          preferredEncrypt: ext.preferredEncrypt,
          direction: (ext.direction || 'sendrecv') as 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive',
        })),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._device.load as any)({ routerRtpCapabilities: msCapabilities });
    }
  }

  /**
   * Create send transport for publishing local media.
   */
  createSendTransport(
    transportOptions: {
      id: string;
      iceParameters: {
        usernameFragment: string;
        password: string;
        iceLite?: boolean;
      };
      iceCandidates: Array<{
        foundation: string;
        priority: number;
        address: string;
        protocol: 'udp' | 'tcp';
        port: number;
        type: 'host' | 'srflx' | 'prflx' | 'relay';
        tcpType?: 'active' | 'passive' | 'so';
      }>;
      dtlsParameters: {
        role?: 'auto' | 'client' | 'server';
        fingerprints: Array<{
          algorithm: string;
          value: string;
        }>;
      };
    },
    iceServers?: RTCIceServer[]
  ): SfuTransport | null {
    if (!this._device) return null;

    const transport = this._device.createSendTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates as unknown as Array<Record<string, unknown>>,
      dtlsParameters: transportOptions.dtlsParameters as unknown,
      ...(iceServers ? { iceServers } : {}),
    } as Parameters<Device['createSendTransport']>[0]) as unknown as SfuTransport;

    this._sendTransport = transport;
    return transport;
  }

  /**
   * Create receive transport for subscribing to remote media.
   */
  createRecvTransport(
    transportOptions: {
      id: string;
      iceParameters: {
        usernameFragment: string;
        password: string;
        iceLite?: boolean;
      };
      iceCandidates: Array<{
        foundation: string;
        priority: number;
        address: string;
        protocol: 'udp' | 'tcp';
        port: number;
        type: 'host' | 'srflx' | 'prflx' | 'relay';
        tcpType?: 'active' | 'passive' | 'so';
      }>;
      dtlsParameters: {
        role?: 'auto' | 'client' | 'server';
        fingerprints: Array<{
          algorithm: string;
          value: string;
        }>;
      };
    },
    iceServers?: RTCIceServer[]
  ): SfuTransport | null {
    if (!this._device) return null;

    const transport = this._device.createRecvTransport({
      id: transportOptions.id,
      iceParameters: transportOptions.iceParameters,
      iceCandidates: transportOptions.iceCandidates as unknown as Array<Record<string, unknown>>,
      dtlsParameters: transportOptions.dtlsParameters as unknown,
      ...(iceServers ? { iceServers } : {}),
    } as Parameters<Device['createRecvTransport']>[0]) as unknown as SfuTransport;

    this._recvTransport = transport;
    return transport;
  }

  /**
   * Produce local track to SFU.
   */
  async produce(
    transport: SfuTransport,
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
    transport: SfuTransport,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<{ consumerId: string; producerId: string; track: MediaStreamTrack; kind: "audio" | "video" } | null> {
    try {
      const msRtpCapabilities = {
        codecs: rtpCapabilities.codecs?.map(codec => ({
          mimeType: codec.mimeType,
          kind: codec.kind as 'audio' | 'video',
          preferredPayloadType: codec.preferredPayloadType ?? 0,
          clockRate: codec.clockRate,
          channels: codec.channels,
          parameters: codec.parameters ?? {},
          rtcpFeedback: codec.rtcpFeedback ?? [],
        })),
        headerExtensions: rtpCapabilities.headerExtensions?.map(ext => ({
          uri: ext.uri,
          kind: (ext.kind || '') as 'audio' | 'video' | '',
          preferredId: ext.preferredId,
          preferredEncrypt: ext.preferredEncrypt,
          direction: (ext.direction || 'sendrecv') as 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive',
        })),
      };

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities: msRtpCapabilities,
        appData: {},
      });

      return {
        consumerId: consumer.id,
        producerId,
        track: consumer.track,
        kind: consumer.kind,
      };
    } catch (err) {
      logger.warn("[sfuTransport] consume failed", {
        producerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Resume consumer (start receiving).
   */
  async resume(transport: SfuTransport, consumerId: string): Promise<void> {
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
    this._device = null;
    this._roomId = null;
  }
}

// Singleton for app-wide use
export const sfuTransportManager = new SfuTransportManager();
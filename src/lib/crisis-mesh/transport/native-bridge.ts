/**
 * Нативный транспорт через Capacitor-плагин @mansoni/capacitor-mesh-transport.
 * Работает на Android (Nearby Connections) и iOS (MultipeerConnectivity).
 */

import type { PluginListenerHandle } from '@capacitor/core';

import { asPeerId, type PeerId } from '../types';

import type { MeshTransportBridge, TransportListener } from './bridge';

// Тип плагина повторяет определения из packages/capacitor-mesh-transport/src/definitions.ts.
// Мы не импортируем их напрямую, чтобы не тянуть peer-пакет в tsconfig.app.
interface MeshTransportPluginShape {
  isAvailable(): Promise<{ available: boolean; platform: string; reason?: string }>;
  start(options: { serviceId: string; advertiseName: string; strategy?: string }): Promise<void>;
  stop(): Promise<void>;
  send(options: { endpointId: string; data: string }): Promise<void>;
  broadcast(options: { data: string }): Promise<void>;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

interface PeerFoundPayload {
  peerId: string;
  endpointId: string;
  displayName: string;
  deviceType: string;
  rssi: number | null;
}

interface PeerLostPayload {
  peerId: string;
  endpointId: string;
}

interface ConnectionStatePayload {
  peerId: string;
  endpointId: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
  error?: string;
}

interface PayloadReceivedPayload {
  from: string;
  endpointId: string;
  data: string;
}

interface TransportErrorPayload {
  error: string;
}

export class NativeBridgeTransport implements MeshTransportBridge {
  private plugin: MeshTransportPluginShape;
  private listeners = new Set<TransportListener>();
  private handles: PluginListenerHandle[] = [];
  private endpointToPeer = new Map<string, PeerId>();

  constructor(plugin: MeshTransportPluginShape) {
    this.plugin = plugin;
  }

  async isAvailable(): Promise<boolean> {
    const res = await this.plugin.isAvailable();
    return res.available;
  }

  async start(opts: { serviceId?: string; advertiseName: string }): Promise<void> {
    await this.plugin.start({
      serviceId: opts.serviceId ?? 'app.mansoni.mesh',
      advertiseName: opts.advertiseName,
      strategy: 'P2P_CLUSTER',
    });
    await this.wireEvents();
  }

  async stop(): Promise<void> {
    for (const h of this.handles) {
      try {
        await h.remove();
      } catch {
        /* ignore */
      }
    }
    this.handles = [];
    await this.plugin.stop();
    this.endpointToPeer.clear();
  }

  async send(to: PeerId, data: Uint8Array): Promise<void> {
    const endpointId = this.findEndpointFor(to);
    if (!endpointId) throw new Error(`unknown peer: ${to}`);
    await this.plugin.send({ endpointId, data: base64Encode(data) });
  }

  async broadcast(data: Uint8Array): Promise<void> {
    await this.plugin.broadcast({ data: base64Encode(data) });
  }

  on(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: Parameters<TransportListener>[0]): void {
    for (const l of this.listeners) l(ev);
  }

  private findEndpointFor(peerId: PeerId): string | null {
    for (const [endpoint, id] of this.endpointToPeer) {
      if (id === peerId) return endpoint;
    }
    return null;
  }

  private async wireEvents(): Promise<void> {
    this.handles.push(
      await this.plugin.addListener('peerFound', (event) => {
        const ev = event as PeerFoundPayload;
        const peerId = asPeerId(ev.peerId);
        this.endpointToPeer.set(ev.endpointId, peerId);
        this.emit({
          type: 'peer-found',
          peerId,
          displayName: ev.displayName,
          deviceType: normalizeDeviceType(ev.deviceType),
          rssi: ev.rssi ?? null,
        });
      }),
      await this.plugin.addListener('peerLost', (event) => {
        const ev = event as PeerLostPayload;
        const peerId = this.endpointToPeer.get(ev.endpointId);
        this.endpointToPeer.delete(ev.endpointId);
        if (peerId) this.emit({ type: 'peer-lost', peerId });
      }),
      await this.plugin.addListener('connectionState', (event) => {
        const ev = event as ConnectionStatePayload;
        const peerId = this.endpointToPeer.get(ev.endpointId) ?? asPeerId(ev.peerId);
        this.emit({
          type: 'connection-state',
          peerId,
          state: ev.state,
          error: ev.error,
        });
      }),
      await this.plugin.addListener('payloadReceived', (event) => {
        const ev = event as PayloadReceivedPayload;
        const peerId = this.endpointToPeer.get(ev.endpointId) ?? asPeerId(ev.from);
        this.emit({
          type: 'payload-received',
          from: peerId,
          data: base64Decode(ev.data),
        });
      }),
      await this.plugin.addListener('transportError', (event) => {
        const ev = event as TransportErrorPayload;
        this.emit({ type: 'transport-error', error: ev.error });
      }),
    );
  }
}

function normalizeDeviceType(raw: string): 'android' | 'ios' | 'web' | 'unknown' {
  if (raw === 'android' || raw === 'ios' || raw === 'web') return raw;
  return 'unknown';
}

function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

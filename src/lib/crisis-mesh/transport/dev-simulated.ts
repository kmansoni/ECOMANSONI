/**
 * Dev-транспорт для разработки UI в вебе без нативной сборки.
 *
 * Не пытается прикидываться реальным mesh — это явный DevSimulatedTransport,
 * который эмулирует сеть из нескольких пиров в одном браузере через
 * BroadcastChannel (работает между вкладками одного origin). Полезен для
 * локальной отладки UI и router'а.
 *
 * Не используется в production — активируется только при VITE_MESH_DEV=1.
 */

import { asPeerId, type PeerId } from '../types';

import type { MeshTransportBridge, TransportListener } from './bridge';

interface DevMessage {
  kind: 'peer-found' | 'peer-lost' | 'payload';
  from: PeerId;
  to?: PeerId;
  displayName?: string;
  data?: string;
}

const CHANNEL = 'crisis-mesh-dev';

export class DevSimulatedTransport implements MeshTransportBridge {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<TransportListener>();
  private selfId: PeerId;
  private displayName = '';

  constructor() {
    // selfId генерируем стабильный в рамках вкладки
    const id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    this.selfId = asPeerId(id);
  }

  async isAvailable(): Promise<boolean> {
    return typeof BroadcastChannel !== 'undefined';
  }

  async start(opts: { advertiseName: string }): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('BroadcastChannel недоступен в этом окружении');
    }
    this.displayName = opts.advertiseName;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (ev) => this.handleIncoming(ev.data as DevMessage);

    // Объявляем себя соседям
    this.channel.postMessage({
      kind: 'peer-found',
      from: this.selfId,
      displayName: opts.advertiseName,
    } satisfies DevMessage);
  }

  async stop(): Promise<void> {
    if (this.channel) {
      this.channel.postMessage({ kind: 'peer-lost', from: this.selfId } satisfies DevMessage);
      this.channel.close();
      this.channel = null;
    }
  }

  async send(to: PeerId, data: Uint8Array): Promise<void> {
    if (!this.channel) throw new Error('not started');
    this.channel.postMessage({
      kind: 'payload',
      from: this.selfId,
      to,
      data: base64Encode(data),
    } satisfies DevMessage);
  }

  async broadcast(data: Uint8Array): Promise<void> {
    if (!this.channel) throw new Error('not started');
    this.channel.postMessage({
      kind: 'payload',
      from: this.selfId,
      data: base64Encode(data),
    } satisfies DevMessage);
  }

  on(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSelfId(): PeerId {
    return this.selfId;
  }

  private handleIncoming(msg: DevMessage): void {
    if (msg.from === this.selfId) return;

    if (msg.kind === 'peer-found') {
      for (const l of this.listeners) {
        l({
          type: 'peer-found',
          peerId: msg.from,
          displayName: msg.displayName ?? 'unknown',
          deviceType: 'web',
          rssi: null,
        });
      }
      // Ответная презентация, чтобы новый пир узнал о нас
      this.channel?.postMessage({
        kind: 'peer-found',
        from: this.selfId,
        displayName: this.displayName,
      } satisfies DevMessage);
      return;
    }

    if (msg.kind === 'peer-lost') {
      for (const l of this.listeners) {
        l({ type: 'peer-lost', peerId: msg.from });
      }
      return;
    }

    if (msg.kind === 'payload') {
      if (msg.to && msg.to !== this.selfId) return;
      if (!msg.data) return;
      const bytes = base64Decode(msg.data);
      for (const l of this.listeners) {
        l({ type: 'payload-received', from: msg.from, data: bytes });
      }
    }
  }
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

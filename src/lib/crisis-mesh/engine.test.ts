import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrisisMeshEngine, type EngineEvent } from './engine';
import { generateIdentityKeyPair, computePeerId } from './crypto/identity';
import { destroyDatabase } from './storage/mesh-db';
import {
  asPeerId,
  type LocalIdentity,
  type PeerId,
  type TransportEvent,
} from './types';
import type { MeshTransportBridge, TransportListener } from './transport/bridge';

/**
 * In-memory loopback-транспорт: два инстанса связаны напрямую через общий bus.
 * Позволяет проверить сквозной путь envelope → sign → transport → verify → deliver.
 */
class LoopbackBus {
  private endpoints = new Map<PeerId, LoopbackTransport>();

  register(t: LoopbackTransport): void {
    this.endpoints.set(t.selfId, t);
    // Уведомляем всех о новом пире
    for (const other of this.endpoints.values()) {
      if (other === t) continue;
      other.emit({
        type: 'peer-found',
        peerId: t.selfId,
        displayName: t.displayName,
        deviceType: 'web',
        rssi: null,
      });
      t.emit({
        type: 'peer-found',
        peerId: other.selfId,
        displayName: other.displayName,
        deviceType: 'web',
        rssi: null,
      });
    }
  }

  unregister(t: LoopbackTransport): void {
    this.endpoints.delete(t.selfId);
    for (const other of this.endpoints.values()) {
      other.emit({ type: 'peer-lost', peerId: t.selfId });
    }
  }

  deliver(from: PeerId, to: PeerId | 'broadcast', data: Uint8Array): void {
    for (const [id, ep] of this.endpoints) {
      if (id === from) continue;
      if (to !== 'broadcast' && to !== id) continue;
      ep.emit({ type: 'payload-received', from, data });
    }
  }
}

class LoopbackTransport implements MeshTransportBridge {
  readonly selfId: PeerId;
  readonly displayName: string;
  private listeners = new Set<TransportListener>();
  private started = false;

  constructor(
    private bus: LoopbackBus,
    selfId: PeerId,
    displayName: string,
  ) {
    this.selfId = selfId;
    this.displayName = displayName;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async start(): Promise<void> {
    this.started = true;
    this.bus.register(this);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.bus.unregister(this);
  }

  async send(to: PeerId, data: Uint8Array): Promise<void> {
    this.bus.deliver(this.selfId, to, data);
  }

  async broadcast(data: Uint8Array): Promise<void> {
    this.bus.deliver(this.selfId, 'broadcast', data);
  }

  on(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: TransportEvent): void {
    for (const l of this.listeners) l(event);
  }
}

async function makeEngine(bus: LoopbackBus, displayName: string): Promise<{
  engine: CrisisMeshEngine;
  identity: LocalIdentity;
  events: EngineEvent[];
}> {
  const { publicKey, privateKey } = await generateIdentityKeyPair();
  const peerId = await computePeerId(publicKey);
  const identity: LocalIdentity = {
    peerId,
    displayName,
    publicKey,
    createdAt: Date.now(),
  };
  const transport = new LoopbackTransport(bus, peerId, displayName);
  const engine = new CrisisMeshEngine({ identity, privateKey, transport });
  const events: EngineEvent[] = [];
  engine.on((ev) => events.push(ev));
  return { engine, identity, events };
}

/**
 * Имитирует handshake: записывает publicKey контрагента в storage обеих сторон.
 * В production это делается через X3DH handshake сообщения, но для loopback-тестов
 * достаточно напрямую обновить peer.publicKey в общей IDB.
 */
async function exchangePublicKeys(
  a: { identity: LocalIdentity },
  b: { identity: LocalIdentity },
): Promise<void> {
  const { upsertIdentity } = await import('./storage/mesh-db');
  const now = Date.now();
  await upsertIdentity({
    id: a.identity.peerId,
    displayName: a.identity.displayName,
    deviceType: 'web',
    publicKey: a.identity.publicKey,
    status: 'online',
    firstSeenAt: now,
    lastSeenAt: now,
    signalStrength: null,
    hopDistance: 0,
    trustLevel: 'unknown',
  });
  await upsertIdentity({
    id: b.identity.peerId,
    displayName: b.identity.displayName,
    deviceType: 'web',
    publicKey: b.identity.publicKey,
    status: 'online',
    firstSeenAt: now,
    lastSeenAt: now,
    signalStrength: null,
    hopDistance: 0,
    trustLevel: 'unknown',
  });
}

function waitForEvent<T extends EngineEvent['type']>(
  events: EngineEvent[],
  type: T,
  timeoutMs = 2_000,
): Promise<Extract<EngineEvent, { type: T }>> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = events.find((e) => e.type === type);
      if (found) return resolve(found as Extract<EngineEvent, { type: T }>);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`timeout waiting for ${type}`));
      }
      setTimeout(check, 10);
    };
    check();
  });
}

describe('CrisisMeshEngine (loopback)', () => {
  beforeEach(async () => {
    await destroyDatabase();
  });

  it('broadcast text: A отправил → B получил message-received', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    const b = await makeEngine(bus, 'Bob');

    await exchangePublicKeys(a, b);
    await a.engine.start();
    await b.engine.start();

    await a.engine.sendText('broadcast', 'hello from alice');

    const received = await waitForEvent(b.events, 'message-received');
    expect(received.message.plaintext).toContain('hello from alice');
    expect(received.message.header.senderId).toBe(a.identity.peerId);

    await a.engine.stop();
    await b.engine.stop();
  }, 10_000);

  it('sos → sos-received на получателе', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    const b = await makeEngine(bus, 'Bob');

    await exchangePublicKeys(a, b);
    await a.engine.start();
    await b.engine.start();

    await a.engine.sendSos({
      type: 'medical',
      level: 'urgent',
      message: 'Нужна помощь',
      coordinates: { latitude: 55.75, longitude: 37.61, accuracyM: 10 },
    });

    const sos = await waitForEvent(b.events, 'sos-received');
    expect(sos.signal.type).toBe('medical');
    expect(sos.signal.level).toBe('urgent');
    expect(sos.signal.senderId).toBe(a.identity.peerId);
    expect(sos.signal.coordinates?.latitude).toBe(55.75);

    await a.engine.stop();
    await b.engine.stop();
  }, 10_000);

  it('дубликат envelope не доставляется дважды', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    const b = await makeEngine(bus, 'Bob');

    await exchangePublicKeys(a, b);

    const sendSpy = vi.spyOn((a.engine as unknown as { transport: MeshTransportBridge }).transport, 'broadcast');

    await a.engine.start();
    await b.engine.start();

    await a.engine.sendText('broadcast', 'once');

    // Ждём первой доставки
    await waitForEvent(b.events, 'message-received');
    const firstCall = sendSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const data = firstCall![0] as Uint8Array;

    // Повторная доставка того же envelope напрямую в B — должна быть отброшена dedup
    bus.deliver(a.identity.peerId, 'broadcast', data);
    bus.deliver(a.identity.peerId, 'broadcast', data);
    await new Promise((r) => setTimeout(r, 100));

    const received = b.events.filter((e) => e.type === 'message-received');
    expect(received).toHaveLength(1);

    await a.engine.stop();
    await b.engine.stop();
  }, 10_000);

  it('peer-update эмитится при обнаружении пира', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    const b = await makeEngine(bus, 'Bob');

    await a.engine.start();
    await b.engine.start();

    await new Promise((r) => setTimeout(r, 50));

    const peerEvents = a.events.filter((e) => e.type === 'peer-update');
    expect(peerEvents.length).toBeGreaterThan(0);

    await a.engine.stop();
    await b.engine.stop();
  }, 10_000);
});

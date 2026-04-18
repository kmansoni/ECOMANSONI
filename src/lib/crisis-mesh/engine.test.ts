import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CrisisMeshEngine, type EngineEvent } from './engine';
import {
  bootstrapIdentity,
  deleteIdentity,
  type LoadedIdentity,
} from './crypto/identity';
import { destroyDatabase } from './storage/mesh-db';
import { type PeerId, type TransportEvent } from './types';
import type { MeshTransportBridge, TransportListener } from './transport/bridge';

class LoopbackBus {
  private endpoints = new Map<PeerId, LoopbackTransport>();
  register(t: LoopbackTransport): void {
    this.endpoints.set(t.selfId, t);
    for (const other of this.endpoints.values()) {
      if (other === t) continue;
      other.emit({ type: 'peer-found', peerId: t.selfId, displayName: t.displayName, deviceType: 'web', rssi: null });
      t.emit({ type: 'peer-found', peerId: other.selfId, displayName: other.displayName, deviceType: 'web', rssi: null });
    }
  }
  unregister(t: LoopbackTransport): void {
    this.endpoints.delete(t.selfId);
    for (const other of this.endpoints.values()) other.emit({ type: 'peer-lost', peerId: t.selfId });
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
  constructor(private bus: LoopbackBus, selfId: PeerId, displayName: string) {
    this.selfId = selfId;
    this.displayName = displayName;
  }
  async isAvailable(): Promise<boolean> { return true; }
  async start(): Promise<void> { this.started = true; this.bus.register(this); }
  async stop(): Promise<void> { if (!this.started) return; this.started = false; this.bus.unregister(this); }
  async send(to: PeerId, data: Uint8Array): Promise<void> { this.bus.deliver(this.selfId, to, data); }
  async broadcast(data: Uint8Array): Promise<void> { this.bus.deliver(this.selfId, 'broadcast', data); }
  on(listener: TransportListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event: TransportEvent): void { for (const l of this.listeners) l(event); }
}

interface Participant {
  engine: CrisisMeshEngine;
  identity: LoadedIdentity['identity'];
  events: EngineEvent[];
}

async function makeEngine(bus: LoopbackBus, displayName: string): Promise<Participant> {
  const loaded = await bootstrapIdentity(displayName);
  const transport = new LoopbackTransport(bus, loaded.identity.peerId, displayName);
  const engine = new CrisisMeshEngine({
    identity: loaded.identity,
    privateKey: loaded.ed25519PrivateKey,
    ecdhPrivateKey: loaded.ecdhPrivateKey,
    transport,
    config: { pow: { bitsFirstContact: 4, bitsSos: 4 } },
  });
  const events: EngineEvent[] = [];
  engine.on((ev: EngineEvent) => events.push(ev));
  return { engine, identity: loaded.identity, events };
}

function waitForEvent<T extends EngineEvent['type']>(
  events: EngineEvent[],
  type: T,
  predicate?: (ev: Extract<EngineEvent, { type: T }>) => boolean,
  timeoutMs = 3_000,
): Promise<Extract<EngineEvent, { type: T }>> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = events.find((e) => e.type === type && (!predicate || predicate(e as Extract<EngineEvent, { type: T }>)));
      if (found) return resolve(found as Extract<EngineEvent, { type: T }>);
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for ${type}`));
      setTimeout(check, 10);
    };
    check();
  });
}

async function resetAll(): Promise<void> {
  await deleteIdentity().catch(() => {});
  await destroyDatabase().catch(() => {});
}

describe('CrisisMeshEngine (loopback, real handshake)', () => {
  beforeEach(async () => { await resetAll(); });

  it('broadcast text после handshake доставляется', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    await resetAll();
    const b = await makeEngine(bus, 'Bob');
    await a.engine.start();
    await b.engine.start();
    await waitForEvent(a.events, 'handshake-completed');
    await waitForEvent(b.events, 'handshake-completed');
    await a.engine.sendText('broadcast', 'hello from alice');
    const received = await waitForEvent(b.events, 'message-received', (ev) => ev.message.header.kind === 'text');
    expect(received.message.plaintext).toBe('hello from alice');
    expect(received.message.header.senderId).toBe(a.identity.peerId);
    await a.engine.stop();
    await b.engine.stop();
  }, 15_000);

  it('DM через Double Ratchet после handshake', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    await resetAll();
    const b = await makeEngine(bus, 'Bob');
    await a.engine.start();
    await b.engine.start();
    await waitForEvent(a.events, 'handshake-completed');
    await waitForEvent(b.events, 'handshake-completed');
    expect(a.engine.hasSession(b.identity.peerId)).toBe(true);
    expect(b.engine.hasSession(a.identity.peerId)).toBe(true);
    const aliceIsInitiator = a.identity.peerId < b.identity.peerId;
    const initiator = aliceIsInitiator ? a : b;
    const responder = aliceIsInitiator ? b : a;
    await initiator.engine.sendText(responder.identity.peerId, 'секретное DM');
    const got = await waitForEvent(responder.events, 'message-received',
      (ev) => ev.message.header.kind === 'text' && ev.message.header.recipientId !== 'broadcast');
    expect(got.message.plaintext).toBe('секретное DM');
    expect(got.message.header.senderId).toBe(initiator.identity.peerId);
    await a.engine.stop();
    await b.engine.stop();
  }, 20_000);

  it('SOS broadcast с PoW → sos-received', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    await resetAll();
    const b = await makeEngine(bus, 'Bob');
    await a.engine.start();
    await b.engine.start();
    await waitForEvent(a.events, 'handshake-completed');
    await waitForEvent(b.events, 'handshake-completed');
    await a.engine.sendSos({ type: 'medical', level: 'urgent', message: 'Нужна помощь', coordinates: { latitude: 55.75, longitude: 37.61, accuracyM: 10 } });
    const sos = await waitForEvent(b.events, 'sos-received');
    expect(sos.signal.type).toBe('medical');
    expect(sos.signal.senderId).toBe(a.identity.peerId);
    await a.engine.stop();
    await b.engine.stop();
  }, 15_000);

  it('peer-update эмитится при обнаружении пира', async () => {
    const bus = new LoopbackBus();
    const a = await makeEngine(bus, 'Alice');
    await resetAll();
    const b = await makeEngine(bus, 'Bob');
    await a.engine.start();
    await b.engine.start();
    await new Promise((r) => setTimeout(r, 100));
    const peerEvents = a.events.filter((e) => e.type === 'peer-update');
    expect(peerEvents.length).toBeGreaterThan(0);
    await a.engine.stop();
    await b.engine.stop();
  }, 10_000);
});
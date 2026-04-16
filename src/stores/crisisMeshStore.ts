/**
 * Crisis Mesh — Zustand store.
 * Держит единственный экземпляр движка и реактивное состояние для UI.
 */

import { create } from 'zustand';

import { CrisisMeshEngine, type EngineEvent, type EngineState } from '@/lib/crisis-mesh/engine';
import { bootstrapIdentity } from '@/lib/crisis-mesh/crypto/identity';
import { createMeshTransport } from '@/lib/crisis-mesh/transport';
import {
  listActiveSos,
  listRecentMessages,
} from '@/lib/crisis-mesh/storage/mesh-db';
import type {
  DecryptedMeshMessage,
  EmergencyLevel,
  EmergencySignal,
  LocalIdentity,
  MeshMessageId,
  Peer,
  PeerId,
  SignalType,
} from '@/lib/crisis-mesh/types';

interface InitOptions {
  displayName: string;
  devMode?: boolean;
}

interface CrisisMeshStore {
  engine: CrisisMeshEngine | null;
  identity: LocalIdentity | null;
  state: EngineState;
  transportAvailable: boolean | null;
  lastError: string | null;

  peers: Peer[];
  messages: DecryptedMeshMessage[];
  sosSignals: EmergencySignal[];

  init: (opts: InitOptions) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendText: (to: PeerId | 'broadcast', text: string) => Promise<MeshMessageId>;
  sendSos: (signal: {
    type: SignalType;
    level: EmergencyLevel;
    message: string;
    coordinates?: EmergencySignal['coordinates'];
  }) => Promise<MeshMessageId>;
}

export const useCrisisMeshStore = create<CrisisMeshStore>((set, get) => ({
  engine: null,
  identity: null,
  state: 'idle',
  transportAvailable: null,
  lastError: null,
  peers: [],
  messages: [],
  sosSignals: [],

  async init({ displayName, devMode = false }) {
    if (get().engine) return;

    const transport = createMeshTransport({ devMode });
    if (!transport) {
      set({
        transportAvailable: false,
        lastError:
          'Mesh-транспорт недоступен в этом окружении. Установите мобильное приложение или запустите в dev-режиме.',
      });
      return;
    }

    const available = await transport.isAvailable();
    set({ transportAvailable: available });
    if (!available) {
      set({ lastError: 'Транспортный уровень сообщил, что mesh недоступен.' });
      return;
    }

    const { identity, privateKey } = await bootstrapIdentity(displayName);
    const engine = new CrisisMeshEngine({ identity, privateKey, transport });

    engine.on((ev) => handleEngineEvent(set, get, ev));
    set({ engine, identity });

    const [msgs, sos] = await Promise.all([
      listRecentMessages(200),
      listActiveSos(),
    ]);
    set({
      messages: msgs,
      sosSignals: sos,
      peers: engine.getPeers(),
    });
  },

  async start() {
    const { engine } = get();
    if (!engine) throw new Error('engine not initialized — call init() first');
    await engine.start();
    set({ state: engine.getState(), peers: engine.getPeers() });
  },

  async stop() {
    const { engine } = get();
    if (!engine) return;
    await engine.stop();
    set({ state: engine.getState() });
  },

  async sendText(to, text) {
    const { engine } = get();
    if (!engine) throw new Error('engine not initialized');
    return engine.sendText(to, text);
  },

  async sendSos(signal) {
    const { engine } = get();
    if (!engine) throw new Error('engine not initialized');
    return engine.sendSos(signal);
  },
}));

function handleEngineEvent(
  set: (partial: Partial<CrisisMeshStore>) => void,
  get: () => CrisisMeshStore,
  ev: EngineEvent,
): void {
  switch (ev.type) {
    case 'state-change':
      set({ state: ev.state });
      break;

    case 'peer-update': {
      const peers = [...get().peers];
      const idx = peers.findIndex((p) => p.id === ev.peer.id);
      if (idx >= 0) peers[idx] = ev.peer;
      else peers.push(ev.peer);
      set({ peers });
      break;
    }

    case 'peer-lost': {
      const peers = get().peers.map((p) =>
        p.id === ev.peerId ? { ...p, status: 'offline' as const } : p,
      );
      set({ peers });
      break;
    }

    case 'message-received': {
      const messages = [ev.message, ...get().messages].slice(0, 500);
      set({ messages });
      break;
    }

    case 'sos-received': {
      const existing = get().sosSignals.filter((s) => s.id !== ev.signal.id);
      set({ sosSignals: [ev.signal, ...existing] });
      break;
    }

    case 'transport-error':
      set({ lastError: ev.error });
      break;

    case 'message-dropped':
    case 'message-sent':
      break;
  }
}

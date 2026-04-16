/**
 * Единый интерфейс транспорта для Crisis Mesh.
 *
 * Реализации:
 *   - NativeBridge — обёртка над Capacitor-плагином @mansoni/capacitor-mesh-transport
 *     (Android Nearby Connections + iOS MultipeerConnectivity)
 *   - DevSimulatedTransport — имитация через BroadcastChannel для разработки в вебе
 */

import type { PeerId, TransportEvent } from '../types';

export type TransportListener = (event: TransportEvent) => void;

export interface MeshTransportBridge {
  isAvailable(): Promise<boolean>;
  start(opts: { serviceId?: string; advertiseName: string }): Promise<void>;
  stop(): Promise<void>;
  send(to: PeerId, data: Uint8Array): Promise<void>;
  broadcast(data: Uint8Array): Promise<void>;
  on(listener: TransportListener): () => void;
}

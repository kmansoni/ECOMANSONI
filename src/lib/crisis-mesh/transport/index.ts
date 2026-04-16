/**
 * Factory для Crisis Mesh транспорта.
 *
 * Алгоритм выбора:
 *   1. На Android/iOS (Capacitor) — NativeBridgeTransport через плагин MeshTransport
 *   2. В dev-сборке веба (VITE_MESH_DEV=1) — DevSimulatedTransport через BroadcastChannel
 *   3. Иначе — null (mesh недоступен, UI должен показать соответствующее сообщение)
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

import { DevSimulatedTransport } from './dev-simulated';
import { NativeBridgeTransport } from './native-bridge';

import type { MeshTransportBridge } from './bridge';

export type { MeshTransportBridge, TransportListener } from './bridge';
export { NativeBridgeTransport } from './native-bridge';
export { DevSimulatedTransport } from './dev-simulated';

const MeshTransportPlugin = registerPlugin<{
  isAvailable(): Promise<{ available: boolean; platform: string; reason?: string }>;
  start(options: { serviceId: string; advertiseName: string; strategy?: string }): Promise<void>;
  stop(): Promise<void>;
  send(options: { endpointId: string; data: string }): Promise<void>;
  broadcast(options: { data: string }): Promise<void>;
  addListener(eventName: string, listener: (event: unknown) => void): Promise<import('@capacitor/core').PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}>('MeshTransport');

export function createMeshTransport(opts: { devMode?: boolean } = {}): MeshTransportBridge | null {
  const platform = Capacitor.getPlatform();

  if (platform === 'android' || platform === 'ios') {
    return new NativeBridgeTransport(MeshTransportPlugin);
  }

  if (opts.devMode) {
    return new DevSimulatedTransport();
  }

  return null;
}

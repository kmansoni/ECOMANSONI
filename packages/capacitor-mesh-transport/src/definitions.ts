/**
 * Capacitor Mesh Transport — публичные TypeScript определения.
 *
 * Контракт между нашим JS-кодом и нативными реализациями
 * (Android: Nearby Connections, iOS: MultipeerConnectivity).
 */

import type { PluginListenerHandle } from '@capacitor/core';

export interface MeshTransportPermissionStatus {
  /** Разрешения на Bluetooth (сканирование, advertise, connect) */
  bluetooth: 'granted' | 'denied' | 'prompt' | 'limited';
  /** Разрешения на Wi-Fi / сеть (Android Nearby требует) */
  network: 'granted' | 'denied' | 'prompt' | 'limited';
  /** Location (Android BLE scanning < API 31 требует fine-location) */
  location: 'granted' | 'denied' | 'prompt' | 'not-required';
  /** Local network (iOS 14+) */
  localNetwork: 'granted' | 'denied' | 'prompt' | 'not-required';
}

export interface StartOptions {
  /** Уникальный serviceId, должен совпадать у всех устройств. */
  serviceId: string;
  /** Отображаемое имя пира (displayName). */
  advertiseName: string;
  /** P2P стратегия (Android Nearby): cluster — всех-со-всеми, star — один хаб. */
  strategy?: 'P2P_CLUSTER' | 'P2P_STAR' | 'P2P_POINT_TO_POINT';
}

export interface PeerFoundEvent {
  peerId: string;
  endpointId: string;
  displayName: string;
  deviceType: 'android' | 'ios' | 'web' | 'unknown';
  rssi: number | null;
}

export interface PeerLostEvent {
  peerId: string;
  endpointId: string;
}

export interface ConnectionStateEvent {
  peerId: string;
  endpointId: string;
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
  error?: string;
}

export interface PayloadReceivedEvent {
  from: string;
  endpointId: string;
  /** base64 (для JSON-bridge совместимости) */
  data: string;
}

export interface TransportErrorEvent {
  error: string;
}

export type MeshTransportEventMap = {
  peerFound: PeerFoundEvent;
  peerLost: PeerLostEvent;
  connectionState: ConnectionStateEvent;
  payloadReceived: PayloadReceivedEvent;
  transportError: TransportErrorEvent;
};

export interface MeshTransportPlugin {
  isAvailable(): Promise<{ available: boolean; platform: string; reason?: string }>;

  checkPermissions(): Promise<MeshTransportPermissionStatus>;
  requestPermissions(): Promise<MeshTransportPermissionStatus>;

  start(options: StartOptions): Promise<void>;
  stop(): Promise<void>;

  connect(options: { endpointId: string }): Promise<void>;
  disconnect(options: { endpointId: string }): Promise<void>;

  /** Отправить payload конкретному endpointId. data — base64. */
  send(options: { endpointId: string; data: string }): Promise<void>;

  /** Broadcast — отправить всем подключённым endpoint'ам. */
  broadcast(options: { data: string }): Promise<void>;

  addListener<E extends keyof MeshTransportEventMap>(
    eventName: E,
    listener: (event: MeshTransportEventMap[E]) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

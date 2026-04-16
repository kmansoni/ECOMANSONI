import { WebPlugin } from '@capacitor/core';

import type {
  MeshTransportPlugin,
  MeshTransportPermissionStatus,
  StartOptions,
} from './definitions';

/**
 * Web fallback.
 *
 * В браузере настоящий BLE/Wi-Fi Direct mesh недоступен: Web Bluetooth работает
 * в режиме центральная-периферия и не даёт ad-hoc multi-peer сети, а mDNS/
 * Nearby для web нет. Поэтому в вебе транспорт честно сообщает `available: false`.
 *
 * Для разработки и тестов UI используется `DevSimulatedTransport` (см.
 * src/lib/crisis-mesh/transport/dev-simulated.ts) — он живёт вне плагина и
 * инжектируется явно при включении флага. Это не мокинг production-пути —
 * это отдельный dev-транспорт с прозрачным именем.
 */
export class MeshTransportWeb extends WebPlugin implements MeshTransportPlugin {
  async isAvailable(): Promise<{ available: boolean; platform: string; reason?: string }> {
    return {
      available: false,
      platform: 'web',
      reason:
        'Web Bluetooth и Web NFC не поддерживают ad-hoc multi-peer mesh. Используйте нативную сборку (Android/iOS).',
    };
  }

  async checkPermissions(): Promise<MeshTransportPermissionStatus> {
    return {
      bluetooth: 'denied',
      network: 'granted',
      location: 'not-required',
      localNetwork: 'not-required',
    };
  }

  async requestPermissions(): Promise<MeshTransportPermissionStatus> {
    return this.checkPermissions();
  }

  async start(_options: StartOptions): Promise<void> {
    this.notifyListeners('transportError', {
      error: 'mesh transport unavailable on web',
    });
    throw this.unavailable('mesh transport unavailable on web');
  }

  async stop(): Promise<void> {
    // no-op
  }

  async connect(_options: { endpointId: string }): Promise<void> {
    throw this.unavailable('connect() недоступен на web');
  }

  async disconnect(_options: { endpointId: string }): Promise<void> {
    // no-op
  }

  async send(_options: { endpointId: string; data: string }): Promise<void> {
    throw this.unavailable('send() недоступен на web');
  }

  async broadcast(_options: { data: string }): Promise<void> {
    throw this.unavailable('broadcast() недоступен на web');
  }
}

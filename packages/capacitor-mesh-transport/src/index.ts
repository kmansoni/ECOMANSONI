import { registerPlugin } from '@capacitor/core';

import type { MeshTransportPlugin } from './definitions';

/**
 * Web fallback лежит в `./web` и подгружается лениво.
 * Нативные реализации: Android (Nearby Connections) + iOS (MultipeerConnectivity).
 */
export const MeshTransport = registerPlugin<MeshTransportPlugin>('MeshTransport', {
  web: () => import('./web').then((m) => new m.MeshTransportWeb()),
});

export * from './definitions';

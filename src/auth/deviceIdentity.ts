export type DeviceIdentity = {
  device_uid: string;
  device_secret: string;
};

const DEVICE_KEY = "mansoni_device_identity_v1";

function randBase64Url(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const raw = localStorage.getItem(DEVICE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed?.device_uid && parsed?.device_secret) {
        return parsed;
      }
    } catch {
      // ignore invalid cache
    }
  }

  const next: DeviceIdentity = {
    device_uid: crypto.randomUUID(),
    device_secret: randBase64Url(32),
  };

  localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  return next;
}

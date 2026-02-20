export const GUEST_MODE_KEY = "guest_mode";

export function setGuestMode(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(GUEST_MODE_KEY, "1");
    else localStorage.removeItem(GUEST_MODE_KEY);
  } catch {
    // ignore
  }
}

export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

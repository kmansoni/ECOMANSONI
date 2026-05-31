/**
 * Demo mode — utility for demo/testing environments.
 * Allows running the app in a simulated mode with mock data.
 */

let _guestMode = false;

export function setGuestMode(enabled: boolean): void {
  _guestMode = enabled;
  if (enabled) {
    localStorage.setItem("demo_guest_mode", "true");
  } else {
    localStorage.removeItem("demo_guest_mode");
  }
}

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return _guestMode || localStorage.getItem("demo_guest_mode") === "true";
}
import { loadOrCreateDeviceIdentity } from "@/auth/deviceIdentity";
import { getActiveAccount, loadSessions, setActiveAccount } from "@/auth/sessionStore";

type SwitchAccountResponse = {
  ok: boolean;
};

export async function switchAccount(accountId: string): Promise<void> {
  const sessions = loadSessions();
  const target = sessions[accountId];
  if (!target) {
    throw new Error("NO_LOCAL_SESSION_FOR_ACCOUNT");
  }

  const device = loadOrCreateDeviceIdentity();

  const res = await fetch("/v1/device/switch-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uid: device.device_uid,
      device_secret: device.device_secret,
      account_id: accountId,
    }),
  });

  if (!res.ok) {
    let reason = "SWITCH_FAILED";
    try {
      const body = (await res.json()) as { error?: string };
      reason = body.error || reason;
    } catch {
      // ignore malformed body
    }
    throw new Error(reason);
  }

  const payload = (await res.json()) as SwitchAccountResponse;
  if (!payload.ok) {
    throw new Error("SWITCH_REJECTED");
  }

  setActiveAccount(accountId);
}

export function getCurrentAccountSession() {
  const sessions = loadSessions();
  const active = getActiveAccount();
  return active ? sessions[active] ?? null : null;
}

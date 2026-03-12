/**
 * BiometricUnlock
 *
 * WebAuthn-based biometric prompt helper with passphrase fallback.
 */

export interface BiometricAuthOptions {
  timeoutMs?: number;
  userVerification?: UserVerificationRequirement;
}

export interface BiometricAuthResult {
  ok: boolean;
  assertion?: PublicKeyCredential;
  usedFallback?: boolean;
}

function randomChallenge(size = 32): ArrayBuffer {
  const challenge = new Uint8Array(size);
  crypto.getRandomValues(challenge);
  return challenge.buffer as ArrayBuffer;
}

export function isBiometricAvailable(): boolean {
  return typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof PublicKeyCredential !== 'undefined';
}

export async function authenticateWithBiometric(
  credentialId?: ArrayBuffer,
  options: BiometricAuthOptions = {},
): Promise<BiometricAuthResult> {
  if (!isBiometricAvailable()) {
    return { ok: false, usedFallback: true };
  }

  const timeout = options.timeoutMs ?? 30_000;
  const userVerification = options.userVerification ?? 'preferred';

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: randomChallenge(),
    timeout,
    userVerification,
    allowCredentials: credentialId
      ? [{ type: 'public-key', id: credentialId }]
      : undefined,
  };

  const assertion = await navigator.credentials.get({ publicKey })
    .catch(() => null);

  if (!assertion) {
    return { ok: false };
  }

  return { ok: true, assertion: assertion as PublicKeyCredential };
}

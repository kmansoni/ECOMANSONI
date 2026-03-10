/**
 * useSecretChat — Secret Chat hook with X3DH + Double Ratchet PFS
 *
 * Protocol flow:
 *
 * INITIATION (Alice):
 *   1. Load own identity keys from localStorage (or generate + register first time)
 *   2. Fetch Bob's PreKeyBundle from server (identity_key_public, signed_prekey_public, etc.)
 *   3. X3DH.initiatorKeyAgreement() → sharedSecret + ephemeralPublicKey
 *   4. DoubleRatchetE2E.initAlice(sharedSecret, bobRatchetPublicKey) → ratchetState
 *   5. Persist encrypted ratchetState to localStorage
 *   6. Store ephemeralPublicKey + identityPublicKey in secret_chats record (for Bob)
 *   7. Server marks OPK as consumed
 *
 * ACCEPTANCE (Bob):
 *   1. Receive Alice's ephemeralPublicKey + identityPublicKey from secret_chats record
 *   2. X3DH.responderKeyAgreement() → sharedSecret
 *   3. DoubleRatchetE2E.initBob(sharedSecret) → ratchetState
 *   4. Persist encrypted ratchetState
 *
 * SEND:
 *   DoubleRatchetE2E.encrypt(state, plaintext) → { ciphertext, header }
 *   Store { ciphertext, header: JSON.stringify(header) } in messages table
 *
 * RECEIVE:
 *   DoubleRatchetE2E.decrypt(state, ciphertext, header) → plaintext
 *   State automatically advances (forward secrecy)
 *
 * STATE STORAGE:
 *   localStorage key: `dr_state_${userId}_${conversationId}`
 *   Value: AES-256-GCM encrypted JSON of serialized RatchetState
 *   Encryption key: PBKDF2 from user passcode (if set) or session token hash
 *   Without passcode: state encrypted with session-derived key (weaker but functional)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X3DH, type PreKeyBundle } from "@/lib/e2ee/x3dh";
import { DoubleRatchetE2E, type RatchetState, type RatchetHeader } from "@/lib/e2ee/doubleRatchet";
import { toBase64, fromBase64 } from "@/lib/e2ee/utils";
import { encryptForStorage, decryptFromStorage } from "@/auth/localStorageCrypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecretChat {
  id: string;
  conversation_id: string;
  initiator_id: string;
  participant_id: string;
  status: "pending" | "active" | "closed";
  default_ttl_seconds: number;
  screenshot_notifications: boolean;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  /** Alice's ephemeral public key (base64 SPKI) — stored for Bob to perform X3DH */
  initiator_ephemeral_key?: string | null;
  /** Alice's ECDH identity public key (base64 SPKI) */
  initiator_identity_key?: string | null;
  /** ID of the OPK used (for server cleanup) */
  used_opk_id?: string | null;
}

export interface DrEncryptedMessage {
  /** Base64 AES-256-GCM ciphertext */
  ciphertext: string;
  /** JSON-serialized RatchetHeader */
  header: string;
}

// LocalStorage key for identity keys
const IK_STORAGE_KEY = (userId: string) => `x3dh_ik_${userId}`;
// LocalStorage key for ratchet state per conversation
const DR_STATE_KEY = (userId: string, convId: string) => `dr_state_${userId}_${convId}`;

// ── Identity key management ────────────────────────────────────────────────

interface StoredIdentityKeys {
  ecdhPrivate: string;   // base64 pkcs8
  ecdhPublic: string;    // base64 spki
  ecdsaPrivate: string;  // base64 pkcs8
  ecdsaPublic: string;   // base64 spki
  spkPrivate: string;    // signed prekey pkcs8
  spkPublic: string;     // signed prekey spki
  spkSignature: string;  // base64
}

async function getOrCreateIdentityKeys(userId: string): Promise<{
  identityEcdhKeyPair: CryptoKeyPair;
  identityEcdsaKeyPair: CryptoKeyPair;
  signedPreKeyPair: CryptoKeyPair;
  isNew: boolean;
}> {
  const stored = localStorage.getItem(IK_STORAGE_KEY(userId));
  if (stored) {
    try {
      const decrypted = await decryptFromStorage(stored);
      const s: StoredIdentityKeys = JSON.parse(decrypted);
      const identityEcdhKeyPair = await X3DH.importEcdhKeyPair(s.ecdhPublic, s.ecdhPrivate);
      const identityEcdsaKeyPair = await X3DH.importEcdsaKeyPair(s.ecdsaPublic, s.ecdsaPrivate);
      const signedPreKeyPair = await X3DH.importEcdhKeyPair(s.spkPublic, s.spkPrivate);
      return { identityEcdhKeyPair, identityEcdsaKeyPair, signedPreKeyPair, isNew: false };
    } catch {
      // Legacy plaintext storage or decryption failure — regenerate keys
      localStorage.removeItem(IK_STORAGE_KEY(userId));
    }
  }

  // Generate new bundle
  const bundle = await X3DH.generateFullIdentityBundle(10);
  const ecdhExp = await X3DH.exportKeyPair(bundle.identityEcdhKeyPair);
  const ecdsaExp = await X3DH.exportKeyPair(bundle.identityEcdsaKeyPair);
  const spkExp = await X3DH.exportKeyPair(bundle.signedPreKeyPair);

  const toStore: StoredIdentityKeys = {
    ecdhPrivate: ecdhExp.privateKey,
    ecdhPublic: ecdhExp.publicKey,
    ecdsaPrivate: ecdsaExp.privateKey,
    ecdsaPublic: ecdsaExp.publicKey,
    spkPrivate: spkExp.privateKey,
    spkPublic: spkExp.publicKey,
    spkSignature: bundle.serverBundle.signedPreKeySignature,
  };
  const encrypted = await encryptForStorage(JSON.stringify(toStore));
  localStorage.setItem(IK_STORAGE_KEY(userId), encrypted);

  return {
    identityEcdhKeyPair: bundle.identityEcdhKeyPair,
    identityEcdsaKeyPair: bundle.identityEcdsaKeyPair,
    signedPreKeyPair: bundle.signedPreKeyPair,
    isNew: true,
  };
}

/**
 * Encrypt ratchet state using localStorageCrypto:
 * AES-256-GCM, PBKDF2/200k iterations, random salt per record, browser fingerprint.
 * Replaces the previous scheme that used a static salt + non-secret key material.
 */
async function encryptRatchetState(raw: string): Promise<string> {
  return encryptForStorage(raw);
}

async function decryptRatchetState(blob: string): Promise<string> {
  return decryptFromStorage(blob);
}

async function saveRatchetState(state: RatchetState, userId: string, convId: string): Promise<void> {
  const serialized = await DoubleRatchetE2E.serialize(state);
  const encrypted = await encryptRatchetState(serialized);
  localStorage.setItem(DR_STATE_KEY(userId, convId), encrypted);
}

async function loadRatchetState(userId: string, convId: string): Promise<RatchetState | null> {
  const blob = localStorage.getItem(DR_STATE_KEY(userId, convId));
  if (!blob) return null;
  try {
    const serialized = await decryptRatchetState(blob);
    return DoubleRatchetE2E.deserialize(serialized);
  } catch {
    // Stored blob may be legacy format (old static-salt scheme) — drop and re-init
    localStorage.removeItem(DR_STATE_KEY(userId, convId));
    return null;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSecretChat(conversationId: string | null) {
  const { user } = useAuth();
  const [secretChat, setSecretChat] = useState<SecretChat | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratchetReady, setRatchetReady] = useState(false);
  /** In-memory ratchet state — persisted to localStorage on every mutation */
  const ratchetStateRef = useRef<RatchetState | null>(null);

  const isSecret = !!secretChat;

  // Load secret chat record
  useEffect(() => {
    if (!conversationId || !user) {
      setSecretChat(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    ;(supabase as any)
      .from("secret_chats")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle()
      .then(({ data }: { data: SecretChat | null }) => {
        if (cancelled) return;
        setSecretChat(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversationId, user]);

  // Load ratchet state from localStorage when secret chat is active
  useEffect(() => {
    if (!secretChat || secretChat.status !== "active" || !user) return;
    let cancelled = false;
    loadRatchetState(user.id, secretChat.conversation_id)
      .then((state) => {
        if (cancelled) return;
        ratchetStateRef.current = state;
        setRatchetReady(!!state);
      })
      .catch(() => {
        if (!cancelled) setRatchetReady(false);
      });
    return () => { cancelled = true; };
  }, [secretChat, user]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = (supabase as any)
      .channel(`secret_chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "secret_chats",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { eventType: string; new: SecretChat }) => {
          if (payload.eventType === "DELETE") {
            setSecretChat(null);
          } else {
            setSecretChat(payload.new);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  /**
   * Register user's pre-key bundle with server (call once at app startup if keys are new).
   * Must be called before any X3DH initiation can occur.
   */
  const registerPreKeyBundle = useCallback(async () => {
    if (!user) return { error: "not_authenticated" };
    const { isNew, identityEcdhKeyPair, identityEcdsaKeyPair, signedPreKeyPair } =
      await getOrCreateIdentityKeys(user.id);

    if (!isNew) return { ok: true, skipped: true };

    const bundle = await X3DH.generateFullIdentityBundle(10);

    // Upsert to server
    const { error } = await (supabase as any)
      .from("user_prekey_bundles")
      .upsert({
        user_id: user.id,
        identity_key_public: bundle.serverBundle.identityKeyPublic,
        identity_signing_public: bundle.serverBundle.identitySigningPublic,
        signed_prekey_public: bundle.serverBundle.signedPreKeyPublic,
        signed_prekey_signature: bundle.serverBundle.signedPreKeySignature,
        one_time_prekeys: bundle.serverBundle.oneTimePreKeyPublics,
        signed_prekey_created_at: new Date().toISOString(),
      });

    // Overwrite local keys with this new bundle
    const ecdhExp = await X3DH.exportKeyPair(bundle.identityEcdhKeyPair);
    const ecdsaExp = await X3DH.exportKeyPair(bundle.identityEcdsaKeyPair);
    const spkExp = await X3DH.exportKeyPair(bundle.signedPreKeyPair);
    localStorage.setItem(IK_STORAGE_KEY(user.id), JSON.stringify({
      ecdhPrivate: ecdhExp.privateKey,
      ecdhPublic: ecdhExp.publicKey,
      ecdsaPrivate: ecdsaExp.privateKey,
      ecdsaPublic: ecdsaExp.publicKey,
      spkPrivate: spkExp.privateKey,
      spkPublic: spkExp.publicKey,
      spkSignature: bundle.serverBundle.signedPreKeySignature,
    } satisfies StoredIdentityKeys));

    return error ? { error: error.message } : { ok: true };
  }, [user]);

  /**
   * Initiate secret chat with X3DH + Double Ratchet bootstrap.
   * Creates conversation + secret_chats record + performs X3DH → ratchet init.
   */
  const initiateSecretChat = useCallback(
    async (participantId: string, defaultTtlSeconds = 30) => {
      if (!user) return { error: "not_authenticated" };

      // 1. Load own keys
      const { identityEcdhKeyPair } = await getOrCreateIdentityKeys(user.id);

      // 2. Fetch Bob's pre-key bundle
      const { data: bobBundle, error: bundleErr } = await (supabase as any)
        .from("user_prekey_bundles")
        .select("identity_key_public, identity_signing_public, signed_prekey_public, signed_prekey_signature")
        .eq("user_id", participantId)
        .single();

      if (bundleErr || !bobBundle) return { error: "participant_has_no_prekey_bundle" };

      // 3. Atomically consume one OPK from Bob
      const { data: opkData } = await (supabase as any)
        .rpc("consume_one_time_prekey", { target_user_id: participantId });
      const oneTimePreKeyPublic: string | undefined = opkData ?? undefined;

      // 4. X3DH key agreement
      const bundle: PreKeyBundle = {
        identityKeyPublic: bobBundle.identity_key_public,
        signedPreKeyPublic: bobBundle.signed_prekey_public,
        signedPreKeySignature: bobBundle.signed_prekey_signature,
        oneTimePreKeyPublic,
      };

      let initiatorResult;
      try {
        initiatorResult = await X3DH.initiatorKeyAgreement(
          identityEcdhKeyPair,
          bundle,
          bobBundle.identity_signing_public
        );
      } catch (e) {
        return { error: String(e) };
      }

      // 5. Import Bob's signed pre-key as ratchet public key for DR init
      // In Signal protocol the DR is initialized with Bob's SPK as the first ratchet key
      const bobRatchetPublicKey = await crypto.subtle.importKey(
        "spki",
        fromBase64(bobBundle.signed_prekey_public),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
      );

      // 6. Initialize Double Ratchet (Alice)
      const ratchetState = await DoubleRatchetE2E.initAlice(
        initiatorResult.sharedSecret,
        bobRatchetPublicKey
      );

      // 7. Create conversation
      const { data: conv, error: convErr } = await (supabase as any)
        .from("conversations")
        .insert({ is_secret: true })
        .select("id")
        .single();
      if (convErr || !conv) return { error: convErr?.message };

      // 8. Add participants
      await (supabase as any).from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: participantId },
      ]);

      // 9. Create secret_chats record with X3DH handshake data for Bob
      const { data: sc, error: scErr } = await (supabase as any)
        .from("secret_chats")
        .insert({
          conversation_id: conv.id,
          initiator_id: user.id,
          participant_id: participantId,
          default_ttl_seconds: defaultTtlSeconds,
          status: "pending",
          initiator_ephemeral_key: initiatorResult.ephemeralPublicKey,
          initiator_identity_key: initiatorResult.identityPublicKey,
        })
        .select("*")
        .single();

      if (scErr) return { error: scErr.message };

      // 10. Save ratchet state
      await saveRatchetState(ratchetState, user.id, conv.id);
      ratchetStateRef.current = ratchetState;
      setRatchetReady(true);
      setSecretChat(sc as SecretChat);

      return { data: sc, conversationId: conv.id };
    },
    [user]
  );

  /**
   * Accept a secret chat — performs Bob's side of X3DH + DR init.
   */
  const acceptSecretChat = useCallback(async () => {
    if (!secretChat || !user) return;

    // 1. Get own keys
    const { identityEcdhKeyPair, signedPreKeyPair } = await getOrCreateIdentityKeys(user.id);

    // 2. Check if we have ephemeral key from Alice
    if (secretChat.initiator_ephemeral_key && secretChat.initiator_identity_key) {
      // 3. X3DH responder
      const sharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: identityEcdhKeyPair,
        signedPreKeyPair,
        oneTimePreKeyPair: null, // OPK was consumed; we don't re-use it
        ephemeralPublicKey: secretChat.initiator_ephemeral_key,
        initiatorIdentityPublicKey: secretChat.initiator_identity_key,
      });

      // 4. Initialize Double Ratchet (Bob)
      const ratchetState = await DoubleRatchetE2E.initBob(sharedSecret);
      await saveRatchetState(ratchetState, user.id, secretChat.conversation_id);
      ratchetStateRef.current = ratchetState;
      setRatchetReady(true);
    }

    // 5. Update status
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "active", accepted_at: new Date().toISOString() })
      .eq("id", secretChat.id);
  }, [secretChat, user]);

  /**
   * Encrypt a message using Double Ratchet.
   * Returns the encrypted payload to store in messages table.
   * State is automatically persisted after each encrypt.
   */
  const encryptMessage = useCallback(
    async (plaintext: string): Promise<DrEncryptedMessage | null> => {
      if (!ratchetStateRef.current || !user || !secretChat) return null;
      const state = ratchetStateRef.current;

      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(state, plaintext);
      // State was mutated — persist it
      await saveRatchetState(state, user.id, secretChat.conversation_id);

      return { ciphertext, header: JSON.stringify(header) };
    },
    [user, secretChat]
  );

  /**
   * Decrypt a received message using Double Ratchet.
   * Handles out-of-order delivery via skipped key store.
   */
  const decryptMessage = useCallback(
    async (msg: DrEncryptedMessage): Promise<string | null> => {
      if (!ratchetStateRef.current || !user || !secretChat) return null;
      const state = ratchetStateRef.current;
      const header: RatchetHeader = JSON.parse(msg.header);

      const plaintext = await DoubleRatchetE2E.decrypt(state, msg.ciphertext, header);
      // State was mutated — persist it
      await saveRatchetState(state, user.id, secretChat.conversation_id);

      return plaintext;
    },
    [user, secretChat]
  );

  const declineSecretChat = useCallback(async () => {
    if (!secretChat) return;
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", secretChat.id);
  }, [secretChat]);

  const closeSecretChat = useCallback(async () => {
    if (!secretChat || !user) return;
    await (supabase as any)
      .from("secret_chats")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", secretChat.id);
    // Clear ratchet state on close — no recovery after close
    localStorage.removeItem(DR_STATE_KEY(user.id, secretChat.conversation_id));
    ratchetStateRef.current = null;
    setRatchetReady(false);
  }, [secretChat, user]);

  const updateSettings = useCallback(
    async (settings: { default_ttl_seconds?: number; screenshot_notifications?: boolean }) => {
      if (!secretChat) return;
      const { data } = await (supabase as any)
        .from("secret_chats")
        .update(settings)
        .eq("id", secretChat.id)
        .select("*")
        .single();
      if (data) setSecretChat(data as SecretChat);
    },
    [secretChat]
  );

  return {
    isSecret,
    secretChat,
    loading,
    ratchetReady,
    registerPreKeyBundle,
    initiateSecretChat,
    acceptSecretChat,
    declineSecretChat,
    closeSecretChat,
    updateSettings,
    encryptMessage,
    decryptMessage,
  };
}

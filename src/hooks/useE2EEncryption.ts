import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  generateEncryptionKey,
  exportKey,
  importKey,
  encryptMessage,
  decryptMessage,
  encryptKeyForUser,
  decryptKeyForUser,
  deriveKeyFromPassphrase,
} from "@/lib/chat/e2ee";

// ─── Константы ────────────────────────────────────────────────────────────────

/** Ключ localStorage, где хранится мастер-ключ текущей сессии (base64) */
const MASTER_KEY_STORAGE_PREFIX = "e2ee.masterKey.v1.";
/** Соль для деривации мастер-ключа (генерируется один раз и хранится в localStorage) */
const MASTER_SALT_STORAGE_PREFIX = "e2ee.masterSalt.v1.";

// ─── Тип хука ─────────────────────────────────────────────────────────────────

export interface UseE2EEncryptionReturn {
  encryptionEnabled: boolean;
  currentKeyVersion: number;
  isReady: boolean;
  enableEncryption: () => Promise<void>;
  disableEncryption: () => Promise<void>;
  rotateKey: () => Promise<void>;
  encryptContent: (plaintext: string) => Promise<{ ciphertext: string; iv: string; keyVersion: number } | null>;
  decryptContent: (ciphertext: string, iv: string, keyVersion: number) => Promise<string | null>;
}

// ─── Утилиты: мастер-ключ пользователя ───────────────────────────────────────

async function getOrCreateMasterKey(userId: string): Promise<CryptoKey> {
  const saltKey = MASTER_SALT_STORAGE_PREFIX + userId;
  const keyKey = MASTER_KEY_STORAGE_PREFIX + userId;

  let masterKeyB64 = sessionStorage.getItem(keyKey);
  if (masterKeyB64) {
    return importKey(masterKeyB64);
  }

  // Деривируем из случайной "passphrase" — в первый раз генерируем её
  let salt = localStorage.getItem(saltKey);
  // Генерируем случайную passphrase для этого устройства (хранится в localStoage)
  const passphraseKey = "e2ee.passphrase.v1." + userId;
  let passphrase = localStorage.getItem(passphraseKey);
  if (!passphrase) {
    const rand = crypto.getRandomValues(new Uint8Array(32));
    passphrase = btoa(String.fromCharCode(...rand));
    localStorage.setItem(passphraseKey, passphrase);
  }

  const { key, salt: newSalt } = await deriveKeyFromPassphrase(passphrase, salt ?? undefined);
  if (!salt) {
    localStorage.setItem(saltKey, newSalt);
  }

  masterKeyB64 = await exportKey(key);
  sessionStorage.setItem(keyKey, masterKeyB64);
  return key;
}

// ─── Основной хук ─────────────────────────────────────────────────────────────

export function useE2EEncryption(conversationId: string | null): UseE2EEncryptionReturn {
  const { user } = useAuth();
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [currentKeyVersion, setCurrentKeyVersion] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Кеш расшифрованных групповых ключей: version → CryptoKey
  const groupKeyCacheRef = useRef<Map<number, CryptoKey>>(new Map());

  // ─── Загрузка статуса шифрования ─────────────────────────────────────────

  useEffect(() => {
    if (!conversationId) {
      setEncryptionEnabled(false);
      setCurrentKeyVersion(0);
      setIsReady(false);
      groupKeyCacheRef.current.clear();
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const { data, error } = await (supabase as any)
          .from("conversations")
          .select("encryption_enabled")
          .eq("id", conversationId)
          .single();

        if (cancelled) return;
        if (error || !data) {
          setEncryptionEnabled(false);
        } else {
          setEncryptionEnabled(!!data.encryption_enabled);
        }

        if (data?.encryption_enabled) {
          // Загружаем последнюю версию ключа
          const { data: keyData } = await (supabase as any)
            .from("chat_encryption_keys")
            .select("key_version")
            .eq("conversation_id", conversationId)
            .is("revoked_at", null)
            .order("key_version", { ascending: false })
            .limit(1)
            .single();

          if (!cancelled && keyData) {
            setCurrentKeyVersion(keyData.key_version);
          }
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationId]);

  // ─── Получение расшифрованного группового ключа ───────────────────────────

  const getGroupKey = useCallback(
    async (keyVersion: number): Promise<CryptoKey | null> => {
      if (!conversationId || !user?.id) return null;

      if (groupKeyCacheRef.current.has(keyVersion)) {
        return groupKeyCacheRef.current.get(keyVersion)!;
      }

      try {
        const { data, error } = await (supabase as any)
          .from("user_encryption_keys")
          .select("encrypted_group_key")
          .eq("user_id", user.id)
          .eq("conversation_id", conversationId)
          .eq("key_version", keyVersion)
          .single();

        if (error || !data) return null;

        const masterKey = await getOrCreateMasterKey(user.id);
        const groupKey = await decryptKeyForUser(data.encrypted_group_key, masterKey);
        groupKeyCacheRef.current.set(keyVersion, groupKey);
        return groupKey;
      } catch (e) {
        console.error("[useE2EEncryption] getGroupKey error:", e);
        return null;
      }
    },
    [conversationId, user?.id],
  );

  // ─── Включение шифрования ─────────────────────────────────────────────────

  const enableEncryption = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    try {
      // Генерируем новый групповой ключ
      const groupKey = await generateEncryptionKey();
      const masterKey = await getOrCreateMasterKey(user.id);
      const encryptedGroupKey = await encryptKeyForUser(groupKey, masterKey);
      const newVersion = 1;

      // Сохраняем в БД
      await (supabase as any).from("chat_encryption_keys").insert({
        conversation_id: conversationId,
        key_version: newVersion,
        encrypted_key: encryptedGroupKey,
        algorithm: "AES-256-GCM",
        created_by: user.id,
      });

      await (supabase as any).from("user_encryption_keys").insert({
        user_id: user.id,
        conversation_id: conversationId,
        key_version: newVersion,
        encrypted_group_key: encryptedGroupKey,
      });

      // Включаем шифрование в беседе
      await (supabase as any)
        .from("conversations")
        .update({ encryption_enabled: true })
        .eq("id", conversationId);

      groupKeyCacheRef.current.set(newVersion, groupKey);
      setCurrentKeyVersion(newVersion);
      setEncryptionEnabled(true);
    } catch (e) {
      console.error("[useE2EEncryption] enableEncryption error:", e);
      throw e;
    }
  }, [conversationId, user?.id]);

  // ─── Отключение шифрования ────────────────────────────────────────────────

  const disableEncryption = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    await (supabase as any)
      .from("conversations")
      .update({ encryption_enabled: false })
      .eq("id", conversationId);

    groupKeyCacheRef.current.clear();
    setEncryptionEnabled(false);
  }, [conversationId, user?.id]);

  // ─── Ротация ключа ────────────────────────────────────────────────────────

  const rotateKey = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    const newVersion = currentKeyVersion + 1;
    const groupKey = await generateEncryptionKey();
    const masterKey = await getOrCreateMasterKey(user.id);
    const encryptedGroupKey = await encryptKeyForUser(groupKey, masterKey);

    // Отзываем старый ключ
    await (supabase as any)
      .from("chat_encryption_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("key_version", currentKeyVersion);

    await (supabase as any).from("chat_encryption_keys").insert({
      conversation_id: conversationId,
      key_version: newVersion,
      encrypted_key: encryptedGroupKey,
      algorithm: "AES-256-GCM",
      created_by: user.id,
    });

    await (supabase as any).from("user_encryption_keys").insert({
      user_id: user.id,
      conversation_id: conversationId,
      key_version: newVersion,
      encrypted_group_key: encryptedGroupKey,
    });

    groupKeyCacheRef.current.set(newVersion, groupKey);
    setCurrentKeyVersion(newVersion);
  }, [conversationId, user?.id, currentKeyVersion]);

  // ─── Шифрование контента ─────────────────────────────────────────────────

  const encryptContent = useCallback(
    async (plaintext: string) => {
      if (!encryptionEnabled || currentKeyVersion === 0) return null;
      const groupKey = await getGroupKey(currentKeyVersion);
      if (!groupKey) return null;

      const { ciphertext, iv } = await encryptMessage(plaintext, groupKey);
      return { ciphertext, iv, keyVersion: currentKeyVersion };
    },
    [encryptionEnabled, currentKeyVersion, getGroupKey],
  );

  // ─── Дешифрование контента ────────────────────────────────────────────────

  const decryptContent = useCallback(
    async (ciphertext: string, iv: string, keyVersion: number): Promise<string | null> => {
      try {
        const groupKey = await getGroupKey(keyVersion);
        if (!groupKey) return null;
        return await decryptMessage(ciphertext, iv, groupKey);
      } catch (e) {
        console.error("[useE2EEncryption] decryptContent error:", e);
        return null;
      }
    },
    [getGroupKey],
  );

  return {
    encryptionEnabled,
    currentKeyVersion,
    isReady,
    enableEncryption,
    disableEncryption,
    rotateKey,
    encryptContent,
    decryptContent,
  };
}

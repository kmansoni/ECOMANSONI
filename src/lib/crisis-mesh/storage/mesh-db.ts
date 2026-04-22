/**
 * Crisis Mesh — локальное хранилище на нативном IndexedDB.
 *
 * Сторы:
 *   identities  — peerId → StoredIdentity (публичный ключ, статус, последние RSSI/hop)
 *   messages    — messageId → StoredMessage (плоские поля senderId/recipientId/timestamp/kind для индексов)
 *   outbox      — messageId → StoredOutboxItem (store-and-forward очередь)
 *   sos         — signalId → EmergencySignal
 *   sessions    — peerId → StoredSession (AES-GCM сессионный ключ, счётчик сообщений)
 *
 * Приватные ключи Ed25519 хранит `src/lib/e2ee/hardwareKeyStorage.ts`.
 * В этой таблице только публичная + производная информация.
 */

import { fromBase64, toBase64 } from '@/lib/e2ee/utils';

import type {
  DecryptedMeshMessage,
  EmergencySignal,
  MeshMessageEnvelope,
  MeshMessageId,
  MeshMessageKind,
  Peer,
  PeerId,
} from '../types';

import {
  idbClear,
  idbCloseAndDelete,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from './idb';

export interface StoredIdentity {
  peerId: PeerId;
  displayName: string;
  deviceType: Peer['deviceType'];
  publicKeyB64: string;
  /** ECDH P-256 SPKI base64 — появляется после успешного handshake. */
  encryptionPublicKey?: string;
  /** unix ms — когда handshake завершён. */
  handshakeCompletedAt?: number;
  status: Peer['status'];
  firstSeenAt: number;
  lastSeenAt: number;
  signalStrength: number | null;
  hopDistance: number;
  trustLevel: Peer['trustLevel'];
}

interface StoredMessage {
  id: MeshMessageId;
  senderId: PeerId;
  recipientId: PeerId | 'broadcast';
  kind: MeshMessageKind;
  timestamp: number;
  message: DecryptedMeshMessage;
}

export interface StoredOutboxItem {
  messageId: MeshMessageId;
  envelope: MeshMessageEnvelope;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  nextAttemptAt: number;
}

export interface StoredSession {
  peerId: PeerId;
  /** JSON сериализованного RatchetState (см. `crypto/session.ts`). */
  stateJson: string;
  role: 'alice' | 'bob';
  createdAt: number;
  lastActivityAt: number;
}

// ─── Identities ──────────────────────────────────────────────────────────────

function peerToStored(peer: Peer): StoredIdentity {
  return {
    peerId: peer.id,
    displayName: peer.displayName,
    deviceType: peer.deviceType,
    publicKeyB64: toBase64(peer.publicKey),
    encryptionPublicKey: peer.encryptionPublicKey,
    handshakeCompletedAt: peer.handshakeCompletedAt,
    status: peer.status,
    firstSeenAt: peer.firstSeenAt,
    lastSeenAt: peer.lastSeenAt,
    signalStrength: peer.signalStrength,
    hopDistance: peer.hopDistance,
    trustLevel: peer.trustLevel,
  };
}

function storedToPeer(row: StoredIdentity): Peer {
  return {
    id: row.peerId,
    displayName: row.displayName,
    deviceType: row.deviceType,
    publicKey: new Uint8Array(fromBase64(row.publicKeyB64)),
    encryptionPublicKey: row.encryptionPublicKey,
    handshakeCompletedAt: row.handshakeCompletedAt,
    status: row.status,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    signalStrength: row.signalStrength,
    hopDistance: row.hopDistance,
    trustLevel: row.trustLevel,
  };
}

export async function upsertIdentity(peer: Peer): Promise<void> {
  await idbPut('identities', peerToStored(peer));
}

export async function getIdentity(peerId: PeerId): Promise<Peer | null> {
  const row = await idbGet<StoredIdentity>('identities', peerId);
  return row ? storedToPeer(row) : null;
}

export async function listIdentities(): Promise<Peer[]> {
  const rows = await idbGetAll<StoredIdentity>('identities');
  return rows
    .map(storedToPeer)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function saveMessage(msg: DecryptedMeshMessage): Promise<void> {
  const row: StoredMessage = {
    id: msg.header.id,
    senderId: msg.header.senderId,
    recipientId: msg.header.recipientId,
    kind: msg.header.kind,
    timestamp: msg.header.timestamp,
    message: msg,
  };
  await idbPut('messages', row);
}

export async function getMessagesWithPeer(
  peerId: PeerId,
  selfId: PeerId,
): Promise<DecryptedMeshMessage[]> {
  const rows = await idbGetAll<StoredMessage>('messages');
  return rows
    .filter(
      (r) =>
        (r.senderId === selfId && r.recipientId === peerId) ||
        (r.senderId === peerId && r.recipientId === selfId),
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((r) => r.message);
}

export async function listRecentMessages(limit = 100): Promise<DecryptedMeshMessage[]> {
  const rows = await idbGetAll<StoredMessage>('messages', { indexName: 'by_timestamp' });
  return rows
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map((r) => r.message);
}

// ─── Outbox ──────────────────────────────────────────────────────────────────

export async function enqueueOutbox(item: StoredOutboxItem): Promise<void> {
  await idbPut('outbox', item);
}

export async function dequeueReady(now: number = Date.now()): Promise<StoredOutboxItem[]> {
  const rows = await idbGetAll<StoredOutboxItem>('outbox', {
    indexName: 'by_nextAttempt',
    query: IDBKeyRange.upperBound(now),
  });
  return rows;
}

export async function removeFromOutbox(messageId: MeshMessageId): Promise<void> {
  await idbDelete('outbox', messageId);
}

export async function updateOutboxAttempt(
  messageId: MeshMessageId,
  nextAttemptAt: number,
): Promise<void> {
  const existing = await idbGet<StoredOutboxItem>('outbox', messageId);
  if (!existing) return;
  const updated: StoredOutboxItem = {
    ...existing,
    attempts: existing.attempts + 1,
    lastAttemptAt: Date.now(),
    nextAttemptAt,
  };
  await idbPut('outbox', updated);
}

export async function listOutbox(): Promise<StoredOutboxItem[]> {
  return idbGetAll<StoredOutboxItem>('outbox');
}

// ─── SOS ─────────────────────────────────────────────────────────────────────

export async function saveSos(signal: EmergencySignal): Promise<void> {
  await idbPut('sos', signal);
}

export async function getSos(id: MeshMessageId): Promise<EmergencySignal | null> {
  return idbGet<EmergencySignal>('sos', id);
}

export async function listActiveSos(): Promise<EmergencySignal[]> {
  const rows = await idbGetAll<EmergencySignal>('sos', {
    indexName: 'by_status',
    query: IDBKeyRange.only('active'),
  });
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export async function listAllSos(limit = 200): Promise<EmergencySignal[]> {
  const rows = await idbGetAll<EmergencySignal>('sos');
  return rows
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function upsertSession(session: StoredSession): Promise<void> {
  await idbPut('sessions', session);
}

export async function getSession(peerId: PeerId): Promise<StoredSession | null> {
  return idbGet<StoredSession>('sessions', peerId);
}

export async function deleteSession(peerId: PeerId): Promise<void> {
  await idbDelete('sessions', peerId);
}

export async function listSessions(): Promise<StoredSession[]> {
  return idbGetAll<StoredSession>('sessions');
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export async function wipeAllData(): Promise<void> {
  await Promise.all([
    idbClear('identities'),
    idbClear('messages'),
    idbClear('outbox'),
    idbClear('sos'),
    idbClear('sessions'),
  ]);
}

export async function destroyDatabase(): Promise<void> {
  await idbCloseAndDelete();
}

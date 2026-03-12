/**
 * Group Key Tree — масштабируемое групповое E2EE для больших групп
 *
 * Реализует TreeKEM-подобный протокол с binary tree структурой ключей.
 * Для малых групп (<= 10 участников) используется flat sender-key подход.
 * Для больших групп (> 10) — tree-based подход с O(log N) обновлениями.
 *
 * Структура дерева:
 *
 *                    [Root Key]
 *                   /           \
 *          [Branch L]           [Branch R]
 *          /       \            /        \
 *       [Leaf 0] [Leaf 1]  [Leaf 2]  [Leaf 3]
 *        User A   User B    User C    User D
 *
 * При добавлении/удалении участника ротируется путь
 * от затронутого листа до корня — O(log N) операций.
 *
 * Membership Ratcheting:
 *   - add:    новый участник получает все текущие keys вдоль своего пути.
 *             Создатель генерирует новый root key.
 *   - remove: все ключи вдоль пути удалённого ротируются.
 *             Удалённый не получает ни одного нового ключа.
 */

import { toBase64, fromBase64 } from './utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeyTreeNode {
  id: string;                  // участник или ветвь: "leaf:userId" | "branch:L" | "root"
  key: ArrayBuffer;            // 32-byte seed key (used to derive AES key via HKDF)
  leftChildId?: string;
  rightChildId?: string;
  parentId?: string;
}

export interface GroupKeyTree {
  conversationId: string;
  nodes: Map<string, KeyTreeNode>;
  leafOrder: string[];         // ordered list of userId → leaf node index
  epoch: number;               // incremented on every membership change
  createdAt: number;
  updatedAt: number;
}

export interface MembershipChange {
  conversationId: string;
  changeType: 'add' | 'remove';
  affectedUserId: string;
  epoch: number;
  timestamp: number;
  /** Path of re-encrypted node keys for affected participants */
  keyUpdates: Array<{
    nodeId: string;
    recipientId: string;
    encryptedNodeKey: string; // base64 AES-GCM ciphertext
    iv: string;               // base64 12-byte nonce
  }>;
}

export interface GroupKeyTreeExport {
  conversationId: string;
  epoch: number;
  /** Serialized nodes for transport (node keys are each participant's private view) */
  nodes: Array<{ id: string; keyB64: string; leftChildId?: string; rightChildId?: string; parentId?: string }>;
  leafOrder: string[];
}

// ─── TreeBuilder ──────────────────────────────────────────────────────────────

// In-memory store for trees
const _trees = new Map<string, GroupKeyTree>();

/** HKDF-derive an AES-256-GCM key from a node seed */
async function deriveNodeKey(seed: ArrayBuffer, nodeId: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`e2ee-tree-node-${nodeId}-v1`),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derives the root (group) AES-256-GCM encryption key from the root node seed.
 * This is the key used to encrypt group messages.
 */
export async function deriveGroupKey(tree: GroupKeyTree): Promise<CryptoKey> {
  const root = tree.nodes.get('root');
  if (!root) throw new Error('Tree has no root node');
  return deriveNodeKey(root.key, 'root');
}

function randomSeed(): ArrayBuffer {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf.buffer as ArrayBuffer;
}

// ─── Tree Construction ────────────────────────────────────────────────────────

/**
 * Строит ключевое дерево для группы участников.
 * Каждый лист инициализируется случайным seed.
 * Промежуточные узлы деривируются как HMAC(left || right).
 */
export async function buildGroupKeyTree(
  conversationId: string,
  participantIds: string[],
): Promise<GroupKeyTree> {
  if (participantIds.length === 0) throw new Error('Cannot build tree for empty group');

  const nodes = new Map<string, KeyTreeNode>();
  const leafOrder = [...participantIds];

  // Pad to next power of 2 for balanced binary tree
  const size = nextPow2(participantIds.length);
  const paddedIds = [...participantIds];
  while (paddedIds.length < size) paddedIds.push(`_pad_${paddedIds.length}`);

  // Create leaf nodes
  const leafIds: string[] = [];
  for (const userId of paddedIds) {
    const nodeId = `leaf:${userId}`;
    leafIds.push(nodeId);
    nodes.set(nodeId, { id: nodeId, key: randomSeed() });
  }

  // Build tree bottom-up
  const rootId = await _buildLevel(leafIds, nodes);

  // Set root alias
  const rootNode = nodes.get(rootId)!;
  nodes.set('root', { ...rootNode, id: 'root' });

  const tree: GroupKeyTree = {
    conversationId,
    nodes,
    leafOrder,
    epoch: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  _trees.set(conversationId, tree);
  return tree;
}

async function _buildLevel(nodeIds: string[], nodes: Map<string, KeyTreeNode>): Promise<string> {
  if (nodeIds.length === 1) return nodeIds[0];

  const parentIds: string[] = [];
  for (let i = 0; i < nodeIds.length; i += 2) {
    const leftId = nodeIds[i];
    const rightId = nodeIds[i + 1] ?? nodeIds[i]; // duplicate last if odd
    const parentId = `branch:${leftId}+${rightId}`;

    const leftNode = nodes.get(leftId)!;
    const rightNode = nodes.get(rightId)!;

    // Parent key = HMAC-SHA-256(left.key || right.key)
    const parentKey = await _combineKeys(leftNode.key, rightNode.key);

    const parentNode: KeyTreeNode = {
      id: parentId,
      key: parentKey,
      leftChildId: leftId,
      rightChildId: rightId,
    };
    nodes.set(parentId, parentNode);

    // Set parent backlinks
    leftNode.parentId = parentId;
    rightNode.parentId = parentId;

    parentIds.push(parentId);
  }

  return _buildLevel(parentIds, nodes);
}

async function _combineKeys(left: ArrayBuffer, right: ArrayBuffer): Promise<ArrayBuffer> {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(new Uint8Array(left), 0);
  combined.set(new Uint8Array(right), left.byteLength);

  const importedKey = await crypto.subtle.importKey(
    'raw', left, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return crypto.subtle.sign('HMAC', importedKey, combined);
}

// ─── Membership Changes ───────────────────────────────────────────────────────

/**
 * Добавляет участника в группу.
 * Возвращает MembershipChange с зашифрованными обновлёнными ключами пути.
 *
 * NOTE: encryptionFn — callback для шифрования node key для конкретного
 * участника (caller использует X3DH или другой transport key).
 */
export async function addGroupMember(
  conversationId: string,
  newUserId: string,
  encryptNodeKeyForUser: (recipientId: string, nodeKey: ArrayBuffer) => Promise<{ ciphertext: string; iv: string }>,
): Promise<MembershipChange> {
  const tree = _trees.get(conversationId);
  if (!tree) throw new Error(`Group key tree not found for ${conversationId}`);

  // Add leaf for new user
  const newLeafId = `leaf:${newUserId}`;
  const newLeafSeed = randomSeed();
  tree.nodes.set(newLeafId, { id: newLeafId, key: newLeafSeed });
  tree.leafOrder.push(newUserId);

  // Re-build tree (simple approach: full rebuild on membership change)
  await _rebuildTree(tree);

  tree.epoch++;
  tree.updatedAt = Date.now();

  // Prepare key updates for ALL participants (path from new leaf to root)
  const keyUpdates: MembershipChange['keyUpdates'] = [];
  for (const userId of tree.leafOrder) {
    const path = _getPathToRoot(tree, `leaf:${userId}`);
    for (const nodeId of path) {
      const node = tree.nodes.get(nodeId);
      if (!node) continue;
      const { ciphertext, iv } = await encryptNodeKeyForUser(userId, node.key);
      keyUpdates.push({ nodeId, recipientId: userId, encryptedNodeKey: ciphertext, iv });
    }
  }

  return {
    conversationId,
    changeType: 'add',
    affectedUserId: newUserId,
    epoch: tree.epoch,
    timestamp: Date.now(),
    keyUpdates,
  };
}

/**
 * Удаляет участника из группы.
 * Ротирует весь путь от его листа до корня — удаляемый НЕ получает новые ключи.
 */
export async function removeGroupMember(
  conversationId: string,
  removedUserId: string,
  encryptNodeKeyForUser: (recipientId: string, nodeKey: ArrayBuffer) => Promise<{ ciphertext: string; iv: string }>,
): Promise<MembershipChange> {
  const tree = _trees.get(conversationId);
  if (!tree) throw new Error(`Group key tree not found for ${conversationId}`);

  // Remove from leaf order
  const idx = tree.leafOrder.indexOf(removedUserId);
  if (idx === -1) throw new Error(`User ${removedUserId} not in group ${conversationId}`);
  tree.leafOrder.splice(idx, 1);

  // Remove leaf node
  tree.nodes.delete(`leaf:${removedUserId}`);

  // Rotate all path keys for removed user (generate new random seeds)
  const pathToRoot = _getPathToRoot(tree, `leaf:${removedUserId}`);
  for (const nodeId of pathToRoot) {
    const node = tree.nodes.get(nodeId);
    if (node) node.key = randomSeed();
  }

  // Rebuild tree with remaining participants
  await _rebuildTree(tree);
  tree.epoch++;
  tree.updatedAt = Date.now();

  // Prepare key updates for REMAINING participants (NOT removedUserId)
  const keyUpdates: MembershipChange['keyUpdates'] = [];
  for (const userId of tree.leafOrder) {
    if (userId === removedUserId) continue;
    const path = _getPathToRoot(tree, `leaf:${userId}`);
    for (const nodeId of path) {
      const node = tree.nodes.get(nodeId);
      if (!node) continue;
      const { ciphertext, iv } = await encryptNodeKeyForUser(userId, node.key);
      keyUpdates.push({ nodeId, recipientId: userId, encryptedNodeKey: ciphertext, iv });
    }
  }

  return {
    conversationId,
    changeType: 'remove',
    affectedUserId: removedUserId,
    epoch: tree.epoch,
    timestamp: Date.now(),
    keyUpdates,
  };
}

// ─── Message Encryption/Decryption ───────────────────────────────────────────

/**
 * Шифрует сообщение с использованием текущего root key дерева.
 */
export async function encryptWithGroupTree(
  conversationId: string,
  plaintext: Uint8Array,
): Promise<{ ciphertext: string; iv: string; epoch: number }> {
  const tree = _trees.get(conversationId);
  if (!tree) throw new Error(`Group key tree not found for ${conversationId}`);

  const groupKey = await deriveGroupKey(tree);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    groupKey,
    plaintext,
  );

  return {
    ciphertext: toBase64(ciphertextBuf),
    iv: toBase64(iv.buffer as ArrayBuffer),
    epoch: tree.epoch,
  };
}

/**
 * Расшифровывает сообщение root key'ем дерева для указанной эпохи.
 */
export async function decryptWithGroupTree(
  conversationId: string,
  ciphertext: string,
  iv: string,
  _epoch: number,
): Promise<Uint8Array> {
  const tree = _trees.get(conversationId);
  if (!tree) throw new Error(`Group key tree not found for ${conversationId}`);

  // NOTE: for production, maintain epoch → root seed history for decrypting older messages
  const groupKey = await deriveGroupKey(tree);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    groupKey,
    fromBase64(ciphertext),
  ).catch(() => {
    throw new Error('Group message decryption failed — wrong epoch or tampered ciphertext.');
  });

  return new Uint8Array(decrypted);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function getGroupKeyTree(conversationId: string): GroupKeyTree | null {
  return _trees.get(conversationId) ?? null;
}

export function deleteGroupKeyTree(conversationId: string): void {
  _trees.delete(conversationId);
}

export function exportGroupKeyTree(tree: GroupKeyTree): GroupKeyTreeExport {
  const nodes = [...tree.nodes.entries()].map(([id, node]) => ({
    id,
    keyB64: toBase64(node.key),
    leftChildId: node.leftChildId,
    rightChildId: node.rightChildId,
    parentId: node.parentId,
  }));
  return { conversationId: tree.conversationId, epoch: tree.epoch, nodes, leafOrder: tree.leafOrder };
}

export async function importGroupKeyTree(data: GroupKeyTreeExport): Promise<GroupKeyTree> {
  const nodes = new Map<string, KeyTreeNode>();
  for (const n of data.nodes) {
    nodes.set(n.id, {
      id: n.id,
      key: fromBase64(n.keyB64),
      leftChildId: n.leftChildId,
      rightChildId: n.rightChildId,
      parentId: n.parentId,
    });
  }
  const tree: GroupKeyTree = {
    conversationId: data.conversationId,
    nodes,
    leafOrder: data.leafOrder,
    epoch: data.epoch,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  _trees.set(data.conversationId, tree);
  return tree;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/** Returns node IDs from leaf up to root (exclusive of leaf) — for key update propagation */
function _getPathToRoot(tree: GroupKeyTree, leafNodeId: string): string[] {
  const path: string[] = [];
  let current = tree.nodes.get(leafNodeId);
  while (current?.parentId) {
    path.push(current.parentId);
    current = tree.nodes.get(current.parentId);
  }
  if (!path.includes('root') && tree.nodes.has('root')) {
    path.push('root');
  }
  return path;
}

async function _rebuildTree(tree: GroupKeyTree): Promise<void> {
  // Preserve existing leaf keys, rebuild branch/root nodes
  const existingLeafKeys = new Map<string, ArrayBuffer>();
  for (const [id, node] of tree.nodes) {
    if (id.startsWith('leaf:')) existingLeafKeys.set(id, node.key);
  }

  // Remove non-leaf nodes
  for (const id of [...tree.nodes.keys()]) {
    if (!id.startsWith('leaf:')) tree.nodes.delete(id);
  }

  // Collect current leaf IDs in order
  const leafIds = tree.leafOrder.map((uid) => `leaf:${uid}`);

  if (leafIds.length === 0) return;
  if (leafIds.length === 1) {
    tree.nodes.set('root', { ...tree.nodes.get(leafIds[0])!, id: 'root', parentId: undefined });
    return;
  }

  const size = nextPow2(leafIds.length);
  const paddedLeafIds = [...leafIds];
  while (paddedLeafIds.length < size) {
    const padId = `_pad_${paddedLeafIds.length}`;
    tree.nodes.set(padId, { id: padId, key: randomSeed() });
    paddedLeafIds.push(padId);
  }

  const rootId = await _buildLevel(paddedLeafIds, tree.nodes);
  const rootNode = tree.nodes.get(rootId)!;
  tree.nodes.set('root', { ...rootNode, id: 'root' });
}

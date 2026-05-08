# Skill: Real-time Replication & CRDT

**Domain:** Offline sync, multi-device, conflict resolution, collaborative editing  
**Files:** `src/lib/sync/`, `src/lib/crdt/`, `src/hooks/useSync/`  
**When to apply:** Offline-first features, multi-device, collaborative editing (notes, lists)

---

## Knowledge

### Conflict Resolution Strategies
- **LWW (Last-Write-Wins)**: timestamp-based, simple but loses concurrent edits
- **LWW-Element**: каждое поле отдельно (лучше для документов)
- **OT** (Operational Transformation): Google Docs style, complex server
- **CRDT** (Conflict-Free Replicated Data Types): математически converge
  - **G-Counter** (Grow-only Counter)
  - **PN-Counter** (Positive-Negative Counter)
  - **G-Set** (Grow-only Set)
  - **OR-Set** (Observed-Remove Set)
  - **LWW-Register**: register with tombstone
  - **RGA** (Replicated Growable Array): for text (Yjs)
  - **Treedoc**: for rich text (Automerge)

### Vector Clocks & Causality
- **Vector clock**: [node:counter] — векторы всех участников
- **Causal consistency**: no cycles, monotonic grows
- **Dotted version vectors**: efficient RGA
- **Rollback snapshots**: undo conflict resolution

### Sync Protocols
- **Delta state**: send только changes (compressed)
- **State vector**: sync pointer (vclock) exchange
- **Anti-entropy**: background reconciliation
- **Merkle trees**: efficient diff large datasets
- **Two-phase commit**: transactional multi-row updates

### Metadata Overhead
- **Version vector size**: O(n) per document (n = devices)
- **CRDT metadata**: ~2–3× payload size (for small edits)
- **Clock skew tolerance**: NTP sync requirement

---

## Quality Gates

1. **Convergence**: identical state after all sync < 5s
2. **Metadata overhead**: < 50% of total payload
3. **Compression ratio**: > 50% for delta sync
4. **Conflict resolution time**: < 200ms per document
5. **Offline queue**: < 1000 ops before hitting limits
6. **Storage growth rate**: < 10KB per user per day

---

## When to Apply

- Offline message queue (outbox)
- Multi-device message sync
- Collaborative notes/editors
- Shared cart (shop)
- Playlist collaboration (music)
- Document co-editing

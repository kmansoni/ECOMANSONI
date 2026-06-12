# E2EE Threat Model: SFU Call System

> **Version:** 1.0 — Phase F  
> **Owner:** Security / Engineering  
> **Last updated:** 2026-03-04  
> **Scope:** End-to-end encryption for SFU-based video/audio calls  
> **Classification:** Internal

---

## Table of Contents

1. [Assets](#1-assets)
2. [Trust Boundaries](#2-trust-boundaries)
3. [Threats & Mitigations](#3-threats--mitigations)
4. [Key Lifecycle](#4-key-lifecycle)
5. [Open Items](#5-open-items)
6. [Appendix: Cryptographic Primitives](#6-appendix-cryptographic-primitives)

---

## 1. Assets

| Asset | Sensitivity | Description |
|-------|-------------|-------------|
| **Epoch Key** | Critical | AES-128-GCM symmetric key used for SFrame media encryption. Compromise = full call interception. |
| **ECDH Ephemeral Key Pair** | Critical | P-256 key pair generated per session for key exchange. Private key never leaves client memory. |
| **Media Frames** | High | Raw audio/video content. Protected by SFrame E2EE at all times. |
| **Signaling Messages** | Medium | WebSocket messages (JOIN, PRODUCE, CONSUME, KEY_PACKAGE). Authenticated but not secret. |
| **Identity Binding** | High | `userId + deviceId + sessionId` triple in KEY_PACKAGE. Compromise = ghost participant attack. |
| **Epoch State** | High | Current epoch number and EpochGuard state. Compromise = replay/rollback attack. |
| **DTLS Fingerprint** | Medium | TLS fingerprint for transport security. Mismatch detection prevents MITM on transport layer. |

---

## 2. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRUSTED ZONE                            │
│                                                                 │
│   Client A (browser)              Client B (browser)           │
│   ┌─────────────────┐             ┌─────────────────┐          │
│   │ CallKeyExchange │             │ CallKeyExchange │          │
│   │ EpochGuard      │             │ EpochGuard      │          │
│   │ RekeyStateMach. │             │ RekeyStateMach. │          │
│   │ SFrame encrypt  │             │ SFrame decrypt  │          │
│   └────────┬────────┘             └────────┬────────┘          │
│            │                               │                    │
└────────────┼───────────────────────────────┼────────────────────┘
             │                               │
             │         WEBRTC / WEBSOCKET    │
             │                               │
┌────────────▼───────────────────────────────▼────────────────────┐
│                       UNTRUSTED ZONE                            │
│                                                                 │
│   SFU Server (calls-ws + mediasoup)                            │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Sees:    Encrypted RTP (SFrame ciphertext)           │     │
│   │ Sees:    Signaling messages (KEY_PACKAGE envelope)   │     │
│   │ Cannot:  Derive epoch key (no ECDH private key)      │     │
│   │ Cannot:  Decrypt media frames                        │     │
│   └──────────────────────────────────────────────────────┘     │
│                                                                 │
│   TURN Server (coturn)                                         │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Sees:    Encrypted UDP/TCP datagrams (DTLS+SRTP)     │     │
│   │ Cannot:  Decrypt SFrame-protected media              │     │
│   └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘

KEY EXCHANGE BOUNDARY:
  Client A ←─── KEY_PACKAGE relay via SFU ───→ Client B
  (ECDH public keys exchanged, SFU is relay only, cannot derive shared secret)
```

### Trust Boundary Rules

| Boundary | What Crosses | What Does Not Cross |
|----------|-------------|---------------------|
| Client → SFU | Encrypted RTP, Signaling envelopes, DTLS (transport) | Epoch key, ECDH private keys, plaintext media |
| Client → Client (via relay) | ECDH public keys, KEY_ACK, identity binding | ECDH private keys directly |
| Client → TURN | DTLS-encrypted UDP datagrams | Any application-layer data in cleartext |
| SFU → SFU workers | Encrypted SFrame RTP | Decrypted media (SFU workers are also untrusted) |

---

## 3. Threats & Mitigations

| # | Threat | Impact | Likelihood | Mitigation | Status |
|---|--------|--------|------------|------------|--------|
| T1 | **SFU reads media content** | High | High (without E2EE) | SFrame E2EE: SFU receives only AES-128-GCM ciphertext. SFU cannot derive epoch key. | ✅ Implemented |
| T2 | **Key replay attack** | High | Medium | Anti-replay: TTL-based `messageId` deduplication (seen-set with TTL). Monotonic epoch prevents epoch reuse. | ✅ Implemented |
| T3 | **Epoch rollback attack** | High | Medium | `EpochGuard` enforces monotonic epoch: epoch numbers only increase. Any frame with epoch ≤ current is rejected. | ✅ Implemented |
| T4 | **Ghost participant** | High | Low | Identity binding in KEY_PACKAGE: `userId + deviceId + sessionId`. All signatories cryptographically identified. | ✅ Implemented |
| T5 | **MITM on key exchange** | Critical | Low | ECDH ephemeral P-256 key pair per session + ECDSA signing of KEY_PACKAGE. Prevents SFU from substituting public keys. | ✅ Implemented |
| T6 | **Plaintext media fallback** | Critical | Low (design risk) | `EpochGuard` is fail-closed: no media frames pass without active epoch. `SFU_E2EE_REQUIRED=1` rejects non-SFrame connections. | ✅ Implemented |
| T7 | **Rekey flood (DoS)** | Medium | Medium | `RekeyStateMachine` enforces min 30s cooldown between rekeys. Rate limiting in server. REKEY_ABORT after 15s timeout. | ✅ Implemented |
| T8 | **Stale key usage** | Medium | Medium | Epoch gating: each frame header includes epoch. Max 3 epochs retained (`CallMediaEncryption`). Old epoch keys destroyed. | ✅ Implemented |
| T9 | **Side-channel timing attack** | Low | Low | SFrame operations use WebCrypto API (browser-native). Variable-time operations possible. | ⚠️ Partial |
| T10 | **Compromised device** | High | Low | Per-session ephemeral keys: no long-term key storage. On call end, `rawKeyBytes.fill(0)`. No key persistence to disk. | ✅ Implemented |
| T11 | **WebSocket hijacking** | Medium | Low | WSS (TLS) transport required. `calls-ws` validates session token on WS upgrade. | ✅ Implemented |
| T12 | **DTLS fingerprint MITM** | High | Very Low | DTLS fingerprint verified: `TRANSPORT_CONNECT` includes client fingerprint, server verifies against negotiated cert. | ✅ Implemented |
| T13 | **Participant impersonation** | High | Low | ECDSA-signed KEY_PACKAGE: forging requires access to sender's private key. Identity validated on KEY_ACK. | ✅ Implemented |
| T14 | **Denial of Service on SFU workers** | Medium | Medium | Worker isolation in mediasoup: each Worker is independent process. Worker failure → only its rooms affected. | ✅ Implemented |
| T15 | **Key exfiltration via memory** | High | Very Low | Keys live in ArrayBuffer in JS heap. No long-term storage. `fill(0)` on destroy. Browser sandbox limits memory access. | ✅ Implemented |

### Threat Risk Matrix

```
Impact
  │
C │         T5  T6
r │     T4          T12
i │  T10     T1  T3
t │       T2    T11
i │           T13
c │    T7  T8
a │               T14
l │         T9
  │
  └────────────────────── Likelihood
     VeryLow  Low  Medium  High
```

---

## 4. Key Lifecycle

### 4.1 Key Generation

```
crypto.getRandomValues(new Uint8Array(16))
  → AES-128-GCM symmetric key (epoch key)
  → Wrapped with AES-256-KW (derived from ECDH shared secret)
  → Transmitted in KEY_PACKAGE to all participants
```

### 4.2 Key Exchange Protocol

```
Participant A                                    Participant B
─────────────                                    ─────────────
1. Generate ECDH P-256 ephemeral keypair
   (privateKeyA, publicKeyA)

2. Sign(ECDSA, {publicKeyA, userId, deviceId, sessionId})
   → KEY_PACKAGE_A

3. Send KEY_PACKAGE_A via SFU relay ─────────────────────────>

                                           4. Verify ECDSA signature
                                           5. Generate ECDH P-256 keypair
                                              (privateKeyB, publicKeyB)
                                           6. Derive shared secret:
                                              ECDH(privateKeyB, publicKeyA)
                                              → HKDF-SHA256(sharedSecret, salt)
                                              → wrapKey (AES-256-KW)
                                           7. Generate epoch key
                                              AES-128-GCM key (16 bytes)
                                           8. Wrap epoch key with wrapKey
                                           9. Send KEY_PACKAGE_B <────────

10. Verify ECDSA signature
11. Derive shared secret:
    ECDH(privateKeyA, publicKeyB)
    → HKDF-SHA256(sharedSecret, salt)
    → wrapKey (AES-256-KW)
12. Unwrap epoch key using wrapKey
13. Install in SFrame encoder/decoder
    EpochGuard.setEpoch(epochKey, epochNumber)

14. Send KEY_ACK ──────────────────────────────────────────────>
                                           15. Receive KEY_ACK
                                               All participants ACK'd
                                               → begin media
```

### 4.3 Key Rotation (Rekey)

Triggered by:
- Participant join/leave event
- Scheduled rotation (configurable, not default)
- Manual trigger (admin)

`RekeyStateMachine` states:
```
IDLE → REKEY_PENDING → COLLECTING_ACKS → COMMITTED → IDLE
              │                              │
              └── timeout 15s ──────────────> REKEY_ABORT → IDLE
```

Quorum requirement: all current participants must ACK new epoch before old epoch is retired.

### 4.4 Key Destruction

```javascript
// On call end or participant leave:
epochKey.rawKeyBytes.fill(0);      // zero-fill key material
previousEpochKeys.forEach(k => k.fill(0));  // clean all retained epochs
// Max 3 epochs retained during transition
// ECDH private key: destroyed after shared secret derived
ecdhPrivateKey = null;             // GC eligible immediately
```

---

## 5. Open Items

### 5.1 Formal Verification

| Item | Priority | Owner | Status |
|------|----------|-------|--------|
| Formal verification of ECDH + HKDF key exchange protocol | High | Security team | 📋 Planned |
| Model check of RekeyStateMachine state transitions | Medium | Engineering | 📋 Planned |
| Verify anti-replay TTL correctness under clock skew | Medium | Security team | 📋 Planned |

### 5.2 Third-Party Security Audit

**Scope for audit:**
- `CallKeyExchange` — ECDH implementation correctness
- `CallMediaEncryption` — SFrame transform implementation
- `RekeyStateMachine` — timing attacks on quorum collection
- `EpochGuard` — fail-closed enforcement completeness

**Target timeline:** Before Stage 5 (full rollout) at scale  
**Audit firm:** TBD

### 5.3 Side-Channel Analysis

**T9 — Partial mitigation:**

WebCrypto API uses browser-native implementations which may have variable timing in:
- AES-128-GCM encryption/decryption (SFrame)
- ECDH shared secret derivation
- HKDF key derivation

**Recommended actions:**
1. Measure timing variance empirically in target browsers (Chrome, Firefox, Safari)
2. If significant variance found: add artificial noise padding (at latency cost)
3. Document accepted risk with formal sign-off if variance is within browser implementation tolerance

### 5.4 Other Open Security Items

| Item | Priority | Notes |
|------|----------|-------|
| Key package size DoS (large participant lists) | Low | Max participants per room = 50 (current config). Review for large groups. |
| Clock skew handling for anti-replay TTL | Medium | TTL = 30s. Clock drift > 15s could cause false replay rejections. NTP sync required on server. |
| Forward secrecy guarantee documentation | Medium | Per-session keys provide session-level FS. No cross-session protection if device key leaked. |

---

## 6. Appendix: Cryptographic Primitives

| Primitive | Usage | Standard |
|-----------|-------|----------|
| **ECDH P-256** | Key exchange (ephemeral per session) | NIST SP 800-56A |
| **ECDSA P-256** | KEY_PACKAGE signature (identity binding) | NIST FIPS 186-4 |
| **HKDF-SHA256** | KDF from ECDH shared secret | RFC 5869 |
| **AES-256-KW** | Epoch key wrapping/unwrapping | RFC 3394 |
| **AES-128-GCM** | Media frame encryption (SFrame) | RFC 5116 |
| **SFrame** | Media E2EE transform (Insertable Streams) | draft-ietf-sframe |
| **WebCrypto API** | All cryptographic operations (browser-native) | W3C WebCrypto |

### Why AES-128-GCM for media (not AES-256)?

- SFrame header overhead is per-frame — minimizing key size reduces overhead
- AES-128-GCM is considered secure for media encryption (NIST approved)
- WebCrypto AES-128-GCM is universally supported across all target browsers
- AES-256-KW used for key wrapping where overhead is not per-frame

### Nonce Construction (SFrame)

```
SFrame nonce = epoch_number (variable length) || frame_counter (64-bit)
```
- Counter is per-sender, per-epoch
- Nonce reuse would break AES-GCM confidentiality — frame counter must be monotonic
- `EpochGuard` enforces this: frame counter rollback → frame rejected

---

*Document reviewed by: [Security reviewer name] on [date]. Next review: [date + 6 months].*

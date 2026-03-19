# SFU Requirements (v1)

This document defines baseline production requirements for the SFU path.

## Capacity

- Max participants: 50 per room

## Media

- Required media types: audio and video

## E2EE

- Frame encryption: SFrame
- Cipher suite: AES-128-GCM
- Key exchange: ECDH P-256
- Identity signing: ECDSA (P-256)

## SLO

- Success rate: >= 99%
- End-to-end join latency p95: <= 5s
- Rekey abort ratio: < 0.5%

## Notes

- The metrics above are release-gate targets for production telemetry.
- For CI smoke runs with small sample sizes, use this spec as target values, not as strict statistical proof.

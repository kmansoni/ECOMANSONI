# Calls SFU Runtime Checklist (systemd/docker)

## 1. Process identity and binary

- Verify that sfu public hosts route to the SFU runtime, not gateway-only calls-ws runtime.
- Confirm service command starts server/sfu/index.mjs.
- Confirm only one active deployment unit answers each endpoint.

## 2. Required environment (fail-closed)

- SFU_ENABLE_MEDIASOUP=1
- SFU_REQUIRE_MEDIASOUP=1
- SFU_REQUIRE_SFRAME=1
- SFU_E2EE_REQUIRED=1
- NODE_ENV=production

If SFU_REQUIRE_MEDIASOUP=1 and mediasoup is unavailable, startup must fail.

## 3. Dependency/runtime integrity

- Confirm mediasoup native module is installed in runtime image/host.
- Confirm UDP range is open for RTC media (for example 40000-49999/udp).
- Confirm TURN endpoint is reachable from SFU nodes and clients.

## 4. Public endpoint contract checks

Run:

- CALLS_SMOKE_ACCESS_TOKEN=<valid_user_access_token> npm run calls:sfu:ws:smoke

Expected for each endpoint:

- AUTH ACK ok
- ROOM_CREATE ACK ok
- ROOM_JOIN_OK contains non-empty mediasoup.routerRtpCapabilities.codecs
- TRANSPORT_CREATE ACK ok
- TRANSPORT_CREATED received

## 5. Health and metrics

- GET /health returns node metadata and wsReady=true.
- GET /metrics must be enabled and reachable from monitoring plane.
- Verify media plane mode is mediasoup in metrics payload.

## 6. Routing and reverse proxy

- Ensure /ws upgrade is forwarded to the same SFU runtime that handles media events.
- Prevent split-brain where /health points to one process and /ws to another.
- Confirm consistent region mapping (sfu-ru, sfu-tr, sfu-ae).

## 7. Post-deploy smoke and rollback gate

- Run calls:sfu:ws:smoke before traffic shift.
- Abort rollout if any region lacks RTP capabilities or transport creation.
- Keep previous image/service unit ready for immediate rollback.

## 8. Incident signals for this failure mode

- Client logs repeated media-bootstrap failed with missing rtpCapabilities.
- UI stuck in connecting or rapidly flips without remote tracks.
- ROOM_JOIN_OK payload has empty mediasoup capabilities.

# Skill: WebRTC & SFU Mastery

**Domain:** Calls, video conferencing, P2P data channels  
**Files:** `src/calls-v2/`, `src/lib/webrtc/`, `server/sfu/`, `src/lib/signaling/`  
**When to apply:** Any change to calls, video/audio chatting, SFU architecture

---

## Knowledge

### Core Protocols
- **ICE** (RFC 5245): Interactive Connectivity Establishment, candidate gathering, connectivity checks
- **STUN** (RFC 5389): Session Traversal Utilities for NAT, public IP discovery
- **TURN** (RFC 5766): Traversal Using Relays around NAT, relay fallback
- **DTLS** (RFC 6347): Datagram Transport Layer Security, fingerprint verification
- **SRTP**/SRTCP (RFC 3711): Secure RTP, media encryption
- **SDP** (RFC 8866): Session Description Protocol, m= sections, BUNDLE, RTCP-mux

### Congestion Control
- **GCC** (Google Congestion Control): delay-based + loss-based
- **REMB** (Receiver Estimated Maximum Bitrate): receiver-driven bitrate adjustment
- **Transport-CC** (Transport-wide CC): per-packet feedback
- **NACK/PLI** (Negative ACK / Picture Loss Indication): loss recovery
- **RTX** (Retransmission): packet-level redundancy

### Media Codecs
- **Opus**: bitrate 6–510 kbps, variable frame size, FEC, DTX
- **VP8/VP9**: Google video codecs, hardware acceleration, simulcast
- **H.264/AVC**: baseline/main/high profiles, hardware (VA-API, VideoToolbox)
- **AV1**: next-gen (future-proof)
- **RTP payload types** dynamic assignment

### SFU Architecture
- **Selective Forwarding**: receive all, send only needed
- **Simulcast**: multiple spatial layers (low/med/high)
- **SVC** (Scalable Video Coding): temporal + spatial scalability
- **Layered encoding**: 3 layers (base/enhancement)
- **Bitrate allocation**: fairness between participants (RAIDEN-style)
- **Subscriber patterns**: mesh (1:1), selective (group), audio-only fallback

### Mediasoup/Kurento Specifics
- **Mediasoup transport**: WebRtcTransport, PlainRtpTransport
- **Producer/Consumer**: tracks, sources
- **Pipe**: direct passthrough (no transcode)
- **SimulcastConsumer**: layers selection
- **ActiveSpeakerObserver**: voice activity detection
- **DataProducer/DataConsumer**: SCTP data channels

---

## Quality Gates

1. **ICE gathering** completes in < 5s (WiFi), < 15s (cellular)
2. **Bitrate adaptation** converges in < 2s after network change
3. **SFU CPU** < 70% at 50 participants (720p)
4. **E2EE** (DTLS-SRTP) handshake < 2s
5. **Reconnection** (ICE restart) < 5s
6. **Packet loss concealment** quality > 4/5 MOS
7. **Jitter buffer** auto-sizing (target: 20–60ms)

---

## When to Apply

- Adding/changing video/audio call features
- SFU scaling decisions (max participants per server)
- Codec selection logic (hardware fallback)
- Bitrate adaptation heuristics
- TURN server configuration (relay only when necessary)
- Packet loss tolerance tuning
- Screen sharing implementation (getDisplayMedia)
- Screen share → video fallback (simulcast)

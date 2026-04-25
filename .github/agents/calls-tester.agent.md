# Calls & SFU Tester Agent

## Role
Specialized agent for testing voice/video calls, SFU infrastructure, and media streaming services.

## Scope of Testing

### 1. Video Calls (1:1)
- [ ] Call initiation and signaling
- [ ] ICE candidate exchange
- [ ] DTLS/SRTP handshake
- [ ] Media stream establishment
- [ ] Video quality adaptation
- [ ] Audio/video sync
- [ ] Network switching (WiFi → Cellular)
- [ ] Call hold/resume
- [ ] Call transfer
- [ ] Screen sharing
- [ ] Recording controls
- [ ] Call duration tracking

### 2. Group Calls (3-50+ participants)
- [ ] SFU connection establishment
- [ ] Selective Forwarding Unit routing
- [ ] Scalability testing (50+ participants)
- [ ] Active speaker detection
- [ ] Video layout management
- [ ] Grid view vs speaker view
- [ ] Participant management (mute, kick)
- [ ] Join/leave handling
- [ ] Simulcast support
- [ ] SVC (Scalable Video Coding)
- [ ] Bandwidth estimation

### 3. SFU Infrastructure
- [ ] Media server deployment
- [ ] Load balancing across SFUs
- [ ] Horizontal scaling
- [ ] Media relay (TURN) fallback
- [ ] Region-based routing
- [ ] SFU failure recovery
- [ ] Media recording
- [ ] Transcoding support
- [ ] Codec negotiation (VP8, VP9, H.264, AV1)
- [ ] Audio codecs (Opus, G.722, G.711)

### 4. E2E Encryption
- [ ] DTLS key exchange
- [ ] SRTP encryption
- [ ] Insertable streams for E2EE
- [ ] Key rotation
- [ ] Perfect Forward Secrecy
- [ ] Media key distribution
- [ ] SFU compatibility with E2EE
- [ ] Key verification

### 5. Audio Features
- [ ] Noise suppression
- [ ] Echo cancellation
- [ ] Automatic gain control
- [ ] Voice activity detection
- [ ] Audio mixing (group calls)
- [ ] Stereo audio support
- [ ] Audio-only mode
- [ ] Push-to-talk

### 6. Video Features
- [ ] Resolution adaptation (180p-1080p)
- [ ] Frame rate adaptation
- [ ] Video filters and effects
- [ ] Background blur/replace
- [ ] Face detection
- [ ] Low light correction
- [ ] Camera switching
- [ ] Virtual backgrounds

### 7. Network Adaptation
- [ ] Bandwidth estimation
- [ ] Congestion control
- [ ] Packet loss concealment
- [ ] FEC (Forward Error Correction)
- [ ] NACK/RTX
- [ ] Jitter buffer management
- [ ] QoS prioritization
- [ ] Network type detection
- [ ] Adaptive bitrate streaming

### 8. Signaling
- [ ] WebRTC signaling (WebSocket/HTTP)
- [ ] Session management
- [ ] Room creation/joining
- [ ] Participant presence
- [ ] Chat alongside calls
- [ ] File sharing during calls
- [ ] Reaction system
- [ ] Raise hand feature

### 9. Recording and Playback
- [ ] Call recording (server-side)
- [ ] Client-side recording
- [ ] Recording controls (start/stop/pause)
- [ ] Storage management
- [ ] Playback interface
- [ ] Transcription integration
- [ ] Search in recordings
- [ ] Sharing recordings

### 10. Performance
- [ ] Latency (< 150ms end-to-end)
- [ ] Jitter (< 30ms)
- [ ] Packet loss tolerance (< 5%)
- [ ] CPU usage per participant
- [ ] Memory consumption
- [ ] Bandwidth usage per stream
- [ ] SFU capacity (streams per server)

### 11. Integration
- [ ] Calendar integration
- [ ] Meeting links
- [ ] Waiting rooms
- [ ] Lobby feature
- [ ] Breakout rooms
- [ ] Polling during calls
- [ ] Whiteboard collaboration
- [ ] Screen annotation

### 12. Quality Monitoring
- [ ] MOS (Mean Opinion Score)
- [ ] Quality metrics dashboard
- [ ] Real-time statistics
- [ ] Network quality indicators
- [ ] Participant quality indicators
- [ ] Automated quality alerts

## Test Environments

### Unit Tests
- WebRTC peer connections
- SFU message routing
- Media stream processing
- Encryption/decryption

### Integration Tests
- SFU cluster communication
- TURN server integration
- Signaling server integration
- Recording service integration

### E2E Tests
- Complete 1:1 call flow
- Group call scenarios
- Network condition variations
- Cross-browser compatibility

### Performance Tests
- 50+ participant group calls
- Media server load testing
- Network bandwidth variations
- CPU/memory profiling

### Stress Tests
- Concurrent call capacity
- SFU failover scenarios
- Peak hour simulation
- Media relay load

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Connection time | < 3s | TBD |
| End-to-end latency | < 150ms | TBD |
| Jitter | < 30ms | TBD |
| Packet loss tolerance | < 5% | TBD |
| CPU per participant | < 5% | TBD |
| SFU capacity | 1000+ streams | TBD |
| Recording quality | 720p/30fps | TBD |

## Automation

```bash
# Run calls tests
npm test -- calls

# WebRTC tests
npm test -- calls-webrtc.spec.ts

# SFU tests
npm test -- calls-sfu.spec.ts

# E2E tests
cypress run --spec calls

# Load tests
k6 run load/calls-group.js

# SFU capacity tests
artillery run tests/sfu-capacity.yaml
```

## Test Data

- WebRTC SDP samples
- ICE candidate scenarios
- Network condition profiles (3G, 4G, 5G, WiFi)
- Video/audio test patterns
- SFU load test scenarios
- Call duration scenarios

## Tools

- Puppeteer for browser automation
- Medooze/sfu for testing
- TestRTC for WebRTC monitoring
- Wireshark for packet analysis
- Chrome WebRTC internals
- FFmpeg for media processing

## Compliance

- WebRTC security standards
- DTLS/SRTP implementation
- Media recording consent
- Privacy regulations
- Data retention policies
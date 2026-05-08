# Skill: Crisis Mesh & Emergency Communication

**Domain:** Mesh networking, SMS fallback, emergency broadcast, battery saving  
**Files:** `src/lib/crisis-mesh/`, `src/components/emergency/`  
**When to apply:** Emergency features, SOS button, offline broadcast

---

## Knowledge

### Mesh Networking Protocols
- **B.A.T.M.A.N. (Better Approach To Mobile Ad-hoc Networking)**: proactive, OLD, OGM
- **OLSR (Optimized Link State Routing)**: MPR selection, TC messages
- **BMX7**: B.A.T.M.A.N. advanced, route metric (TQ +hops)
- **WireGuard mesh**: WireGuard in peer-to-peer mode (no server)

### Routing in Mesh
- **AODV** (Ad-hoc On-Demand Distance Vector): on-demand route discovery
- **DYMO**: successor to AODV
- **GPSR** (Greedy Perimeter Stateless Routing): geographic routing
- **Geocast**: broadcast by region (geo-fence)

### Fallback Hierarchies
1. **Wi-Fi Direct / Bluetooth Mesh** — direct P2P (no internet)
2. **SMS gateway** — когда есть cellular
3. **Satellite messengers** (future: Starlink API)

### Message Queuing
- **Store-and-forward**: intermediate nodes buffer messages
- **TTL**: time-to-live (avoid infinite loops)
- **Exponential backoff**: retry schedule
- **Receipt acknowledgment**: E2E delivery confirmation

### Battery Optimization
- **Radio duty cycling**: sleep/wake schedule (save 80% power)
- **Data compression**: Protocol Buffers, MessagePack (vs JSON 3× smaller)
- **Adaptive broadcast interval**: node density → frequency
- **Doze mode** (Android): defer sync while stationary

### Emergency Protocols
- **SOS button**: location + device status broadcast
- **Geo-fenced alerts**: broadcast within 5km radius
- **Government alert systems**: CMAS (US), EU-Alert, J-Alert (Japan)
- **Crisis mapping**: aggregate distress signals on map

---

## Quality Gates

1. **Discovery time** (peer find): < 10s (100 devices in range)
2. **Message delivery** (multi-hop): < 30s (up to 5 hops)
3. **Battery drain**: < 5% per hour (mesh active)
4. **SMS fallback**: < 60s end-to-end (cellular available)
5. **Offline queue**: survives app kill, SD card corruption

---

## When to Apply

- SOS emergency button
- Offline broadcast (location share without internet)
- Disaster recovery communication
- Protest / restricted internet scenarios
- Wilderness navigation (no cellular)
- Low-power beacon mode (Bluetooth LE advertisement)

---
name: "Chaos Engineering"
description: "Intentional failure injection for system resilience testing. Use when: validating fault tolerance, testing SLOs under stress, or preparing for incidents."
---

# Chaos Engineering

Proactive resilience testing through controlled experiments.

## Core Principle

> "Break things in production to prove they won't break."

## Chaos Experiments

### 1. Network Failure
```bash
# Inject latency
tc qdisc add dev eth0 root netem delay 100ms

# Packet loss
tc qdisc add dev eth0 root netem loss 5%
```

### 2. Resource Exhaustion
```bash
# CPU stress
stress-ng --cpu 2 --timeout 60s

# Memory pressure
stress-ng --vm 2 --vm-bytes 512M --timeout 60s
```

### 3. Service Failure
```bash
# Kill random pods
kubectl delete pod --all -n default --force
```

## Experiment Template

```yaml
experiment:
  name: "database-connection-failure"
  hypothesis: "API returns graceful error when DB is unavailable"
  method:
    - Inject: kill database connection pool
    - Measure: error response time < 500ms
    - Monitor: no data corruption
  rollback: restore connection pool
  blast_radius: limited to /api/users endpoint
```

## Safety Rules

- [ ] Define blast radius before experiment
- [ ] Always have rollback procedure
- [ ] Run during low-traffic windows
- [ ] Monitor continuously during experiment
- [ ] Document findings even if experiment passes

## For Mansoni Platform

Priority experiments:
1. Supabase connection failure
2. Edge Function timeout
3. WebSocket disconnect
4. Storage upload failure

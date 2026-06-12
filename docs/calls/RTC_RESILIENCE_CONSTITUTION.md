# RTC Resilience Constitution

This document defines the production resilience model for Mansoni Calls.
It is the governing layer above TURN, SFU, signaling, E2EE, recovery, telemetry, and operational governance.

## 1. Purpose

RTC resilience is not a single recovery mechanism.
It is a bounded system for preserving conversational continuity under hostile uncertainty without allowing hidden corruption, institutional drift, or metric theater.

The system must optimize for three goals at the same time:

- conversational continuity
- state integrity
- fleet stability

None of these may be maximized by destroying the others.

## 2. Constitutional structure

### 2.1 Hard core

The hard core contains invariants that must not be traded away for continuity:

- ownership uniqueness
- generation fencing
- cryptographic integrity
- monotonic causal ordering for committed transitions
- explicit identity binding for state changes
- bounded blast radius for recovery actions

The hard core may only change under extraordinary evidence and explicit review.

### 2.2 Mutable shell

The mutable shell contains operational doctrines that may adapt under bounded rollout:

- recovery heuristics
- escalation thresholds
- cooldown budgets
- fleet throttling
- retry and backoff policies
- observability thresholds used for runtime decisions

The mutable shell may bend quickly, but it may not live in permanent exception mode.

### 2.3 Tactical layer

The tactical layer contains short-lived hypotheses and local mitigations:

- current incident hypothesis
- temporary degradation policy
- local recovery choice
- reversible mitigation experiment

This layer may change quickly, but only with scope limits and expiration.

## 3. Failure envelopes

Every important principle must have a measurable failure envelope:

- break pressure
- detection delay
- containment delay
- return-to-core delay
- drift rate

These values must be measured, not assumed.

## 4. Decision model

Runtime decisions are probabilistic.
Postmortem attribution is strict.

The runtime controller must optimize expected damage under uncertainty, not perfect truth.

The controller must also account for:

- action reversibility
- cooldown state
- ownership generation
- context profile
- cascade risk
- correlated fleet actions
- trajectory cost of repeated interventions

## 5. Recovery policy

Recovery is not neutral.
Every recovery action may help or may generate a new fault.

Recovery policy therefore requires:

- anti-oscillation contracts
- recovery budgets per time window
- generation fences before ownership-sensitive actions
- correlated-action containment across the fleet
- hard limits on repeated soft recovery
- explicit escalation from soft to hard recovery

#### Recovery tiers

- L1: local runtime override, automatic, seconds to minutes, single call or session
- L2: regional recovery throttle change, on-call lead, 15 to 60 minutes, region or cluster
- L3: fleet-wide policy deviation, incident commander plus second approver, hours, limited action class
- L4: invariant exception, almost prohibited, minutes with manual audit, only if the alternative is worse

L4 must not become ordinary incident response.

## 6. Signal rights

Signals do not all have the same rights.

### 6.1 Signal tiers

- Display-only: UI hints, user-facing coarse status
- Soft hints: support triage and human attention
- Recovery-grade: may trigger bounded recovery
- Commit-grade: may commit a state transition
- Forensic-grade: immutable evidence trail

### 6.2 Trust tiers

- Raw physical observations: bytes, packets, decode output, playout timestamps
- Derived metrics: health scores, call quality estimates, network scores
- Semantic control-plane events: joined, connected, resumed, ready
- UI semantics: timer, green icons, tiles, banners

Higher abstraction means lower evidence strength during incidents.

### 6.3 Signal validity rules

Every signal must be evaluated for:

- temporal validity
- identity binding
- source independence
- causal strength
- misleading potential

## 7. Semantic honesty

Semantic honesty must be scoped by audience:

- Runtime honesty: exact state vector for machines and controllers
- User honesty: honest coarse message, not noisy technical detail
- Forensic honesty: lossless event trail
- Policy honesty: actual policy-as-executed, not policy-as-written

User-facing truth must be simple and honest.
Runtime truth must be precise.
Forensic truth must be complete.

## 8. Governance resilience

Governance is part of the attack surface.

The system must resist:

- institutional latency
- ritualized compliance
- legalized drift
- authority capture under urgency
- governance theater
- policy-as-written vs policy-as-executed drift

Required controls:

- signed deviation tokens
- TTL on every exception
- automatic expiry
- deviation debt tracking
- renewal penalties
- drift publication
- audit of recurring exceptions

Governance must be fast enough that shadow paths are not attractive.

## 9. Anti-ossification and renewal

The truth-maintenance machinery itself will decay.
The system must assume that its own checks, dashboards, and review rituals will become domesticated.

Required anti-ossification measures:

- rotating verification models
- red-team rotation
- external incident review
- unknown-unknown drills
- adversarial verification of the metrics themselves
- external reality anchors from actual user pain

## 10. Epistemic stability hierarchy

Not all knowledge should change at the same speed.

### 10.1 Deep invariants

Very slow drift only, extraordinary evidence required:

- ownership uniqueness
- generation fencing
- cryptographic integrity
- monotonic causal ordering

### 10.2 Operational doctrines

Medium drift, bounded rollout only:

- recovery heuristics
- escalation thresholds
- cooldown budgets
- fleet throttling

### 10.3 Tactical hypotheses

Fast drift, local and reversible:

- current cause hypothesis
- temporary mitigation strategy
- local degradation policy

The organization must preserve epistemic gravity while still allowing renewal.

## 11. Unknown failure containment

Unknown failure modes must not trigger improvisation.
They must trigger a predefined safe-plain mode with bounded behavior.

Safe containment must:

- protect core invariants
- reduce blast radius
- preserve enough continuity for diagnosis
- avoid silent drift

## 12. Structural safety rules

The system should make safe behavior cheaper than unsafe behavior.

This means:

- safe standard actions are operationally easier
- legal emergency deviation is cheaper than shadow bypass
- unsafe shortcuts are topologically hard
- stale generations cannot be reused without explicit rebuild

Architectural restrictions are preferred over pure policy whenever possible.

## 13. Metrics and validation

Resilience metrics are attack surfaces.

The system must validate metrics adversarially so that it does not optimize the measurement instead of reality.

Required checks:

- synthetic signal injection
- false-signal tests
- chaos engineering against runtime
- governance-chaos against process
- telemetry-chaos against observability
- KPI gaming tests

Metrics must be checked for:

- independence
- gameability
- causal validity
- real-world transfer

## 14. Operating principle

The system must be able to:

- keep stable truths stable
- suspect them when evidence changes
- renew itself without amnesia
- avoid ossification without liquidity collapse
- recover without normalizing corruption

The final aim is not perfect certainty.
The final aim is bounded-confidence continuity with hard core invariants, measurable limits, and controlled renewal.

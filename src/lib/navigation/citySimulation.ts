/**
 * Digital Twin — City Simulation Engine.
 *
 * Maintains a live simulation of the city's transport network.
 * Supports what-if scenario modeling, predictive traffic management,
 * and urban planning experiments.
 *
 * Uses discrete event simulation with agent-based modeling.
 */

import type { LatLng } from '@/types/taxi';
import type { TravelMode } from '@/types/navigation';
import type {
  SimulationAgent,
  SimulationAgentType,
  SimulationLink,
  SimulationSnapshot,
  CityMetrics,
  WhatIfScenario,
  ScenarioModification,
  ScenarioResult,
} from '@/types/quantum-transport';

// ══════════════════════════════════════════════════════════════════════════
// SIMULATION STATE
// ══════════════════════════════════════════════════════════════════════════

/** Simulation clock: discrete time steps in seconds */
interface SimulationClock {
  currentTime: Date;
  stepSize: number;              // seconds per step (default 15)
  totalSteps: number;
  running: boolean;
}

/** Internal link state (extends public SimulationLink) */
interface InternalLink extends SimulationLink {
  length: number;                // km
  lanes: number;
  maxSpeed: number;              // km/h
  agents: Set<string>;           // agent IDs on this link
}

class CitySimulation {
  private clock: SimulationClock;
  private agents: Map<string, SimulationAgent> = new Map();
  private links: Map<string, InternalLink> = new Map();
  private metrics: CityMetrics;
  private nextAgentId = 0;

  constructor() {
    this.clock = {
      currentTime: new Date(),
      stepSize: 15,
      totalSteps: 0,
      running: false,
    };
    this.metrics = this.defaultMetrics();
  }

  // ── Agent Management ───────────────────────────────────────────────

  /** Add a simulation agent */
  addAgent(
    type: SimulationAgentType,
    position: LatLng,
    destination?: LatLng,
    velocity = 30
  ): string {
    const id = `agent_${this.nextAgentId++}`;
    const agent: SimulationAgent = {
      id,
      type,
      position,
      velocity,
      bearing: destination ? this.computeBearing(position, destination) : 0,
      destination,
      state: 'moving',
    };
    this.agents.set(id, agent);
    return id;
  }

  /** Remove an agent (trip completed / cancelled) */
  removeAgent(id: string): void {
    this.agents.delete(id);
    // Remove from all links
    for (const [, link] of this.links) {
      link.agents.delete(id);
    }
  }

  // ── Link Management ────────────────────────────────────────────────

  /** Register a road/transit link in the simulation */
  addLink(
    id: string,
    from: LatLng,
    to: LatLng,
    lanes = 2,
    maxSpeed = 60
  ): void {
    const length = this.haversineKm(from, to);
    const capacity = lanes * 1800; // ~1800 vehicles/hour/lane at saturation

    const link: InternalLink = {
      id,
      from,
      to,
      capacity,
      currentFlow: 0,
      freeFlowSpeed: maxSpeed,
      currentSpeed: maxSpeed,
      incidents: [],
      length,
      lanes,
      maxSpeed,
      agents: new Set(),
    };
    this.links.set(id, link);
  }

  // ── Simulation Step ────────────────────────────────────────────────

  /**
   * Advance the simulation by one time step.
   * Moves all agents, updates link flows, recalculates speeds.
   */
  step(): void {
    this.clock.totalSteps++;
    this.clock.currentTime = new Date(
      this.clock.currentTime.getTime() + this.clock.stepSize * 1000
    );

    // 1. Move all agents
    for (const [, agent] of this.agents) {
      if (agent.state !== 'moving' || !agent.destination) continue;

      const distToDestKm = this.haversineKm(agent.position, agent.destination);
      if (distToDestKm < 0.05) {
        // Arrived
        agent.state = 'stopped';
        agent.velocity = 0;
        continue;
      }

      // Move towards destination
      const stepDistKm = (agent.velocity * this.clock.stepSize) / 3600;
      const fraction = Math.min(stepDistKm / distToDestKm, 1);

      agent.position = {
        lat: agent.position.lat + (agent.destination.lat - agent.position.lat) * fraction,
        lng: agent.position.lng + (agent.destination.lng - agent.position.lng) * fraction,
      };
      agent.bearing = this.computeBearing(agent.position, agent.destination);
    }

    // 2. Update link flows using BPR function
    for (const [, link] of this.links) {
      const flow = link.agents.size;
      link.currentFlow = flow;
      const loadFactor = flow / Math.max(link.capacity, 1);
      // BPR delay function
      link.currentSpeed = link.freeFlowSpeed / (1 + 0.15 * Math.pow(loadFactor, 4));
    }

    // 3. Recompute city metrics
    this.metrics = this.computeMetrics();
  }

  /**
   * Run the simulation for N steps (fast-forward).
   * Used for what-if scenario evaluation.
   */
  runSteps(n: number): void {
    for (let i = 0; i < n; i++) {
      this.step();
    }
  }

  // ── Snapshots ──────────────────────────────────────────────────────

  /** Get current simulation snapshot */
  getSnapshot(): SimulationSnapshot {
    return {
      timestamp: new Date(this.clock.currentTime),
      agents: Array.from(this.agents.values()),
      links: Array.from(this.links.values()).map(l => ({
        id: l.id,
        from: l.from,
        to: l.to,
        capacity: l.capacity,
        currentFlow: l.currentFlow,
        freeFlowSpeed: l.freeFlowSpeed,
        currentSpeed: l.currentSpeed,
        incidents: l.incidents,
      })),
      metrics: { ...this.metrics },
    };
  }

  /** Get current city metrics */
  getMetrics(): CityMetrics {
    return { ...this.metrics };
  }

  // ── What-If Scenarios ──────────────────────────────────────────────

  /**
   * Evaluate a what-if scenario by:
   * 1. Taking a snapshot of current state (baseline)
   * 2. Applying modifications
   * 3. Running simulation forward
   * 4. Comparing results with baseline
   * 5. Reverting to original state
   */
  evaluateScenario(scenario: WhatIfScenario, simulationMinutes = 60): ScenarioResult {
    // Save baseline
    const baseline = this.computeMetrics();
    const savedAgents = new Map(this.agents);
    const savedLinks = new Map(this.links);
    const savedClock = { ...this.clock };

    // Apply modifications
    for (const mod of scenario.modifications) {
      this.applyModification(mod);
    }

    // Run simulation
    const steps = Math.floor((simulationMinutes * 60) / this.clock.stepSize);
    this.runSteps(steps);

    // Compute projected metrics
    const projected = this.computeMetrics();

    // Calculate deltas
    const delta = {
      avgCommuteChange: projected.avgCommuteMinutes - baseline.avgCommuteMinutes,
      congestionChange: baseline.congestionIndex > 0
        ? ((projected.congestionIndex - baseline.congestionIndex) / baseline.congestionIndex) * 100
        : 0,
      co2Change: baseline.co2TonsPerHour > 0
        ? ((projected.co2TonsPerHour - baseline.co2TonsPerHour) / baseline.co2TonsPerHour) * 100
        : 0,
      transitLoadChange: baseline.publicTransitLoad > 0
        ? ((projected.publicTransitLoad - baseline.publicTransitLoad) / baseline.publicTransitLoad) * 100
        : 0,
      costBenefit: this.estimateCostBenefit(baseline, projected),
    };

    // Generate recommendation
    const recommendation = this.generateScenarioRecommendation(scenario, delta);

    // Compute confidence (decreases with longer simulation time)
    const confidence = Math.max(0.3, 1 - simulationMinutes / 360);

    // Restore original state
    this.agents = savedAgents;
    this.links = savedLinks;
    this.clock = savedClock;

    return {
      scenario,
      baseline,
      projected,
      delta,
      confidence,
      recommendation,
    };
  }

  // ── Scenario Modifications ─────────────────────────────────────────

  private applyModification(mod: ScenarioModification): void {
    switch (mod.type) {
      case 'close_road': {
        const link = this.links.get(mod.roadId);
        if (link) {
          link.capacity = 0;
          link.currentSpeed = 0;
        }
        break;
      }
      case 'add_capacity': {
        const link = this.links.get(mod.roadId);
        if (link) {
          link.lanes += mod.lanesAdded;
          link.capacity = link.lanes * 1800;
        }
        break;
      }
      case 'shift_demand': {
        // Shift X% of agents in a zone to depart later/earlier
        let shifted = 0;
        for (const [, agent] of this.agents) {
          if (agent.state !== 'moving') continue;
          if (Math.random() < mod.percentage / 100) {
            agent.state = 'waiting';
            shifted++;
          }
        }
        // Schedule them to resume after shift period
        // (simplified: just stop them temporarily)
        break;
      }
      case 'change_price':
      case 'add_transit_line':
        // These affect mode choice rather than physical network
        // In production, would re-route agents based on new costs
        break;
    }
  }

  // ── Metrics Computation ────────────────────────────────────────────

  private computeMetrics(): CityMetrics {
    const agentArray = Array.from(this.agents.values());
    const totalAgents = agentArray.length;
    const movingAgents = agentArray.filter(a => a.state === 'moving');
    const avgSpeed = movingAgents.length > 0
      ? movingAgents.reduce((s, a) => s + a.velocity, 0) / movingAgents.length
      : 0;

    // Congestion index: average load factor across all links
    let totalLoad = 0;
    let linkCount = 0;
    for (const [, link] of this.links) {
      if (link.capacity > 0) {
        totalLoad += link.currentFlow / link.capacity;
        linkCount++;
      }
    }
    const congestionIndex = linkCount > 0
      ? Math.min((totalLoad / linkCount) * 10, 10)
      : 0;

    // CO2: sum of all car agents
    const carAgents = agentArray.filter(a => a.type === 'car');
    const co2TonsPerHour = (carAgents.length * avgSpeed * 120) / 1_000_000;

    // Public transit load
    const transitAgents = agentArray.filter(a =>
      a.type === 'bus' || a.type === 'metro_train'
    );
    const publicTransitLoad = totalAgents > 0
      ? transitAgents.length / totalAgents
      : 0;

    // Average commute time: estimate from speed and average distance
    const avgDistance = 10; // km, Moscow average
    const avgCommuteMinutes = avgSpeed > 0 ? (avgDistance / avgSpeed) * 60 : 40;

    return {
      totalAgents,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      congestionIndex: Math.round(congestionIndex * 10) / 10,
      co2TonsPerHour: Math.round(co2TonsPerHour * 100) / 100,
      publicTransitLoad: Math.round(publicTransitLoad * 100) / 100,
      avgCommuteMinutes: Math.round(avgCommuteMinutes),
    };
  }

  private defaultMetrics(): CityMetrics {
    return {
      totalAgents: 0,
      avgSpeed: 30,
      congestionIndex: 0,
      co2TonsPerHour: 0,
      publicTransitLoad: 0.4,
      avgCommuteMinutes: 40,
    };
  }

  /** Estimate economic cost/benefit of scenario (rub/day) */
  private estimateCostBenefit(baseline: CityMetrics, projected: CityMetrics): number {
    const timeSavedMinutes = baseline.avgCommuteMinutes - projected.avgCommuteMinutes;
    const avgWagePerMinute = 10; // ~600 rub/hour average
    const dailyCommuters = Math.max(baseline.totalAgents, 100_000);

    // Value of time saved (or lost)
    const timeValue = timeSavedMinutes * avgWagePerMinute * dailyCommuters;

    // CO2 reduction value (social cost of carbon ~5000 rub/ton)
    const co2Diff = baseline.co2TonsPerHour - projected.co2TonsPerHour;
    const co2Value = co2Diff * 24 * 5000; // rub/day

    return Math.round(timeValue + co2Value);
  }

  /** Generate human-readable recommendation for a scenario */
  private generateScenarioRecommendation(
    scenario: WhatIfScenario,
    delta: ScenarioResult['delta']
  ): string {
    const parts: string[] = [`📊 Результаты моделирования: "${scenario.name}"`];

    if (delta.avgCommuteChange < -2) {
      parts.push(`✅ Среднее время поездки сократится на ${Math.abs(Math.round(delta.avgCommuteChange))} мин`);
    } else if (delta.avgCommuteChange > 2) {
      parts.push(`⚠️ Среднее время поездки увеличится на ${Math.round(delta.avgCommuteChange)} мин`);
    }

    if (delta.congestionChange < -5) {
      parts.push(`✅ Загруженность дорог снизится на ${Math.abs(Math.round(delta.congestionChange))}%`);
    } else if (delta.congestionChange > 5) {
      parts.push(`⚠️ Загруженность дорог вырастет на ${Math.round(delta.congestionChange)}%`);
    }

    if (delta.co2Change < -3) {
      parts.push(`🌱 Выбросы CO₂ снизятся на ${Math.abs(Math.round(delta.co2Change))}%`);
    }

    if (delta.costBenefit > 0) {
      const formatted = delta.costBenefit > 1_000_000
        ? `${(delta.costBenefit / 1_000_000).toFixed(1)} млн ₽/день`
        : `${Math.round(delta.costBenefit).toLocaleString('ru-RU')} ₽/день`;
      parts.push(`💰 Экономическая выгода: ${formatted}`);
    }

    const isPositive = delta.avgCommuteChange <= 0 && delta.congestionChange <= 0;
    parts.push(isPositive
      ? '✅ Рекомендуем к реализации'
      : '⚠️ Требует дополнительного анализа');

    return parts.join('\n');
  }

  // ── Utility ────────────────────────────────────────────────────────

  private haversineKm(a: LatLng, b: LatLng): number {
    const dlat = (a.lat - b.lat) * 111.32;
    const dlng = (a.lng - b.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180);
    return Math.sqrt(dlat * dlat + dlng * dlng);
  }

  private computeBearing(from: LatLng, to: LatLng): number {
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  /** Reset the simulation to clean state */
  reset(): void {
    this.agents.clear();
    this.links.clear();
    this.clock = {
      currentTime: new Date(),
      stepSize: 15,
      totalSteps: 0,
      running: false,
    };
    this.metrics = this.defaultMetrics();
    this.nextAgentId = 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ══════════════════════════════════════════════════════════════════════════

export const citySimulation = new CitySimulation();

/**
 * Initialize the simulation with a road network graph.
 * Should be called once when the app loads the OSM graph.
 */
export function initializeSimulationFromGraph(graph: {
  nodes: Record<string, { lat: number; lon: number }>;
  edges: Array<{ fromNode: string; toNode: string; distance: number; speed: number; highway: string }>;
}): void {
  citySimulation.reset();

  // Add a subset of links (every 10th edge for performance)
  const edges = graph.edges;
  for (let i = 0; i < edges.length; i += 10) {
    const edge = edges[i];
    const fromNode = graph.nodes[edge.fromNode];
    const toNode = graph.nodes[edge.toNode];
    if (!fromNode || !toNode) continue;

    const lanes = edge.highway === 'motorway' ? 4
      : edge.highway === 'trunk' ? 3
      : edge.highway === 'primary' ? 2
      : 1;

    citySimulation.addLink(
      `link_${i}`,
      { lat: fromNode.lat, lng: fromNode.lon },
      { lat: toNode.lat, lng: toNode.lon },
      lanes,
      edge.speed
    );
  }
}

/**
 * Create and evaluate a what-if scenario.
 * Convenience wrapper around citySimulation.evaluateScenario().
 */
export function simulateWhatIf(
  name: string,
  description: string,
  modifications: ScenarioModification[],
  simulationMinutes = 60
): ScenarioResult {
  const scenario: WhatIfScenario = {
    id: `scenario_${Date.now()}`,
    name,
    description,
    modifications,
  };
  return citySimulation.evaluateScenario(scenario, simulationMinutes);
}

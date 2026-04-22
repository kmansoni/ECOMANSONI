/**
 * Quantum Transport Intelligence — Master Type Definitions.
 * Система квантово-вдохновлённой оптимизации маршрутов,
 * роевого интеллекта города и цифровых двойников.
 */

import type { LatLng } from './taxi';
import type { TravelMode, NavRoute, MultiModalRoute, RouteSegment } from './navigation';
import type { RouteWeights, UserCluster, RouteScores } from '@/lib/navigation/routePreferenceLearner';

// ═══════════════════════════════════════════════════════════════════════════
// PART 1: QUANTUM-INSPIRED ROUTING
// ═══════════════════════════════════════════════════════════════════════════

/** Complex number representation for wave function amplitudes */
export interface ComplexNumber {
  real: number;
  imag: number;
}

/** Wave function evaluation for a route — amplitude encodes quality, phase encodes uncertainty */
export interface RouteWaveFunction {
  routeId: string;
  amplitude: number;           // |ψ| — quality magnitude [0..1]
  phase: number;               // arg(ψ) — uncertainty angle [0..2π]
  probability: number;         // |ψ|² — selection probability
  collapsed: boolean;          // true after user selects
}

/** Superposition state — all routes exist simultaneously until measurement */
export interface RouteSuperposition {
  waveFunctions: RouteWaveFunction[];
  totalProbability: number;     // should sum to ~1.0
  paretoFront: ParetoPoint[];
  dominatedCount: number;
  observedAt?: Date;            // collapse timestamp
}

/** Point on the Pareto frontier (multi-objective optimization) */
export interface ParetoPoint {
  routeId: string;
  objectives: RouteObjectives;
  dominates: string[];          // IDs of routes this one dominates
  rank: number;                 // 0 = optimal front
}

/** Multi-objective evaluation of a route */
export interface RouteObjectives {
  timeSeconds: number;
  costRub: number;
  co2Grams: number;
  safetyScore: number;          // 0..1
  comfortScore: number;         // 0..1
  reliabilityScore: number;     // 0..1 — probability of arriving on time
  transfers: number;
  walkingMeters: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: TRAFFIC ENTANGLEMENT — SECOND-ORDER EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

export type IncidentType = 'accident' | 'construction' | 'broken_signal' | 'weather' | 'event' | 'congestion';
export type TransportDomain = 'road' | 'metro' | 'bus' | 'tram' | 'taxi' | 'carsharing' | 'parking' | 'bike';

/** An incident that ripples through the transport network */
export interface TrafficIncident {
  id: string;
  type: IncidentType;
  location: LatLng;
  description: string;
  severity: number;             // 0..1
  startedAt: Date;
  estimatedDuration: number;    // seconds
  reportedBy: 'system' | 'crowd' | 'api';
}

/** Second-order effect — how an incident propagates to other domains */
export interface EntanglementEffect {
  sourceDomain: TransportDomain;
  targetDomain: TransportDomain;
  targetEntity: string;          // "Сокольническая линия", "Автобус №56"
  impactType: 'load_increase' | 'delay' | 'availability_decrease' | 'price_increase';
  magnitude: number;             // e.g., +40%, -30%
  confidence: number;            // 0..1
  delayMinutes: number;          // when effect starts
  durationMinutes: number;       // how long it lasts
}

/** Full entanglement map for an incident */
export interface TrafficEntanglementMap {
  incident: TrafficIncident;
  effects: EntanglementEffect[];
  propagationDepth: number;      // 1 = direct, 2 = second-order, etc.
  computedAt: Date;
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 3: SWARM INTELLIGENCE — COLLECTIVE OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

/** Anonymous travel intention (opt-in) */
export interface TravelIntention {
  anonymousId: string;
  fromZone: string;              // grid cell ID
  toZone: string;
  departureWindow: [number, number]; // [earliest, latest] epoch seconds
  preferredModes: TravelMode[];
  flexibilityMinutes: number;
}

/** Result of swarm optimization for an individual */
export interface SwarmRecommendation {
  originalMode: TravelMode;
  suggestedMode: TravelMode;
  suggestedDepartureShift: number; // minutes (negative = earlier)
  individualBenefit: {
    timeSavedSeconds: number;
    costSavedRub: number;
    co2SavedGrams: number;
  };
  collectiveBenefit: {
    trafficReductionPercent: number;
    totalTimeSavedHours: number;
    totalCO2SavedKg: number;
  };
  adoptionRate: number;          // estimated % of users who will follow
  nashEquilibrium: boolean;      // is this a stable equilibrium?
  gamificationReward?: GamificationReward;
}

export interface GamificationReward {
  type: 'eco_badge' | 'time_saver' | 'community_hero' | 'streak';
  title: string;
  description: string;
  points: number;
  icon: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 4: DIGITAL TWIN — CITY SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

/** Agent types in the city simulation */
export type SimulationAgentType = 'car' | 'pedestrian' | 'bus' | 'metro_train' | 'taxi' | 'bike' | 'scooter';

/** Individual agent in the simulation */
export interface SimulationAgent {
  id: string;
  type: SimulationAgentType;
  position: LatLng;
  velocity: number;              // km/h
  bearing: number;
  destination?: LatLng;
  routeId?: string;
  state: 'moving' | 'waiting' | 'stopped' | 'loading';
}

/** Road link in the simulation */
export interface SimulationLink {
  id: string;
  from: LatLng;
  to: LatLng;
  capacity: number;              // vehicles/hour
  currentFlow: number;
  freeFlowSpeed: number;         // km/h
  currentSpeed: number;
  incidents: TrafficIncident[];
}

/** Snapshot of the city simulation state */
export interface SimulationSnapshot {
  timestamp: Date;
  agents: SimulationAgent[];
  links: SimulationLink[];
  metrics: CityMetrics;
}

export interface CityMetrics {
  totalAgents: number;
  avgSpeed: number;
  congestionIndex: number;       // 0..10
  co2TonsPerHour: number;
  publicTransitLoad: number;     // 0..1
  avgCommuteMinutes: number;
}

/** What-if scenario definition */
export interface WhatIfScenario {
  id: string;
  name: string;
  description: string;
  modifications: ScenarioModification[];
}

export type ScenarioModification =
  | { type: 'close_road'; roadId: string; from: Date; to: Date }
  | { type: 'add_transit_line'; routeType: string; stops: LatLng[] }
  | { type: 'change_price'; domain: TransportDomain; multiplier: number }
  | { type: 'shift_demand'; zoneId: string; shiftMinutes: number; percentage: number }
  | { type: 'add_capacity'; roadId: string; lanesAdded: number };

/** Result of a what-if simulation */
export interface ScenarioResult {
  scenario: WhatIfScenario;
  baseline: CityMetrics;
  projected: CityMetrics;
  delta: {
    avgCommuteChange: number;    // minutes
    congestionChange: number;    // %
    co2Change: number;           // %
    transitLoadChange: number;   // %
    costBenefit: number;         // economic value per day, rub
  };
  confidence: number;
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 5: GENETIC ALGORITHM — EVOLUTIONARY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/** A route gene — represents a waypoint decision */
export interface RouteGene {
  nodeId: string;
  mode: TravelMode;
  departureOffset: number;       // seconds from trip start
}

/** A chromosome — complete route representation */
export interface RouteChromosome {
  id: string;
  genes: RouteGene[];
  fitness: number;               // calculated from objectives
  generation: number;
  parentIds: [string, string] | null;
  mutationHistory: string[];
}

/** Configuration for the genetic optimizer */
export interface GeneticConfig {
  populationSize: number;        // default 100
  elitismRate: number;           // 0.10 = top 10% survive
  crossoverRate: number;         // 0.70
  mutationRate: number;          // 0.15
  maxGenerations: number;        // 50
  convergenceThreshold: number;  // stop if improvement < this
  fitnessWeights: RouteWeights;
}

/** Population state after evolution */
export interface EvolutionResult {
  bestChromosome: RouteChromosome;
  paretoFront: RouteChromosome[];
  generationsRun: number;
  fitnessHistory: number[];      // best fitness per generation
  diversity: number;             // population genetic diversity 0..1
  converged: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 6: MULTI-AGENT NEGOTIATION
// ═══════════════════════════════════════════════════════════════════════════

/** Resource that can be negotiated for */
export type NegotiableResource = 'road_slot' | 'parking_spot' | 'carpool_seat' | 'priority_lane' | 'charging_station';

/** A bid in the resource negotiation */
export interface ResourceBid {
  agentId: string;
  resource: NegotiableResource;
  value: number;                 // willingness to pay / priority score
  constraints: BidConstraint[];
  flexibility: number;           // 0..1
}

export interface BidConstraint {
  type: 'time_window' | 'max_price' | 'min_comfort' | 'max_walk';
  value: number;
}

/** Negotiation outcome */
export interface NegotiationOutcome {
  winnerId: string;
  resource: NegotiableResource;
  allocatedPrice: number;
  alternatives: NegotiationAlternative[];
  socialWelfare: number;         // total utility for all agents
}

export interface NegotiationAlternative {
  description: string;
  savings: number;               // rub
  timeDelta: number;             // seconds (positive = longer)
  icon: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 7: USER DIGITAL TWIN
// ═══════════════════════════════════════════════════════════════════════════

/** Behavioral model of the user */
export interface UserBehaviorModel {
  userId: string;
  responseToStress: 'reroute_immediately' | 'wait_and_see' | 'abort_trip';
  riskTolerance: number;         // 0..1 (0 = risk-averse, 1 = risk-seeking)
  timeFlexibility: number;       // 0..1
  ecoConsciousness: number;      // 0..1
  explorationWillingness: number; // 0..1 (try new routes)
  costSensitivity: number;       // 0..1
  comfortPreference: number;     // 0..1
  routineStrength: number;       // 0..1 (stick to known routes)
}

/** Predicted state of the user at a future point */
export interface PredictedUserState {
  energy: number;                // 0..1
  stress: number;                // 0..1
  satisfaction: number;          // 0..1
  factors: StateInfluence[];
}

export interface StateInfluence {
  factor: string;                // "weather", "trip_duration", "crowding"
  impact: number;                // -1..+1
  description: string;
}

/** Digital twin simulation of a trip for the user */
export interface TwinSimulationResult {
  routeId: string;
  completionProbability: number; // chance user completes this route as planned
  predictedState: PredictedUserState;
  abandonmentRisk: number;       // 0..1 — chance user gives up mid-trip
  abandonmentPoint?: LatLng;     // where twin gave up
  warnings: string[];
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 8: KNOWLEDGE GRAPH
// ═══════════════════════════════════════════════════════════════════════════

export type KGNodeType = 'stop' | 'road' | 'poi' | 'person' | 'event' | 'zone' | 'route' | 'vehicle';
export type KGEdgeType =
  | 'connected_by' | 'located_at' | 'visits_regularly' | 'affects'
  | 'part_of' | 'serves' | 'avoids' | 'prefers' | 'similar_to';

export interface KGNode {
  id: string;
  type: KGNodeType;
  label: string;
  attributes: Record<string, unknown>;
}

export interface KGEdge {
  from: string;
  to: string;
  type: KGEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphQuery {
  startNodeId: string;
  edgeTypes?: KGEdgeType[];
  maxDepth: number;
  limit: number;
}

export interface KnowledgeGraphResult {
  nodes: KGNode[];
  edges: KGEdge[];
  paths: string[][];
  insights: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 9: META-COGNITION & SELF-IMPROVEMENT
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemSelfReport {
  period: { from: Date; to: Date };
  stats: {
    routesBuilt: number;
    avgLatencyMs: number;
    errors: Record<string, number>;
    userFeedback: Record<string, number>;
  };
  rootCauses: RootCauseAnalysis[];
  remediations: AutoRemediation[];
  selfImprovementPlan: string[];
}

export interface RootCauseAnalysis {
  symptom: string;
  rootCause: string;
  evidence: string[];
  confidence: number;
}

export interface AutoRemediation {
  action: string;
  status: 'proposed' | 'testing' | 'deployed' | 'reverted';
  impact: string;
  deployedAt?: Date;
}

/** Abductive reasoning result */
export interface AbductiveHypothesis {
  observation: string;
  hypotheses: Array<{
    hypothesis: string;
    confidence: number;
    evidence: string[];
    contradictions: string[];
  }>;
  bestHypothesis: string;
  conclusion: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 10: TIME BANKING
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeAccount {
  userId: string;
  balanceMinutes: number;
  totalSavedMinutes: number;
  totalSpentMinutes: number;
  transactions: TimeTransaction[];
  monthlyTrend: number;          // minutes saved per month
}

export interface TimeTransaction {
  id: string;
  type: 'earned' | 'spent' | 'invested' | 'gifted';
  minutes: number;
  description: string;
  routeId?: string;
  timestamp: Date;
}

export interface TimeInvestment {
  description: string;
  investMinutes: number;
  expectedReturnMinutes: number;
  returnPeriodDays: number;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 11: COUNTERFACTUAL & REGRET ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export interface CounterfactualAnalysis {
  chosenRoute: RouteObjectives;
  alternatives: Array<{
    routeId: string;
    objectives: RouteObjectives;
    regret: number;              // positive = chosen was worse
    wouldHaveBeenBetter: boolean;
  }>;
  totalRegret: number;
  lesson: string;
  profileAdjustment?: Partial<RouteWeights>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 12: ROUTE EMBEDDINGS (HIGH-DIMENSIONAL)
// ═══════════════════════════════════════════════════════════════════════════

/** Route embedding in high-dimensional space */
export interface RouteEmbedding {
  routeId: string;
  vector: Float32Array;          // 128-dimensional
  archetype: RouteArchetype;
  cluster: number;               // cluster assignment
}

export type RouteArchetype =
  | 'daily_commute'
  | 'weekend_leisure'
  | 'airport_trip'
  | 'shopping_run'
  | 'night_ride'
  | 'business_meeting'
  | 'school_run'
  | 'exploration';

/** Semantic understanding of a route */
export interface SemanticRouteProfile {
  archetype: RouteArchetype;
  pattern: string;               // "Public transit + last mile"
  sentiment: 'eco_friendly' | 'premium' | 'budget' | 'active' | 'routine';
  consistency: number;           // 0..1 — how consistent with user's typical pattern
  suggestion?: string;           // "New bike lane available — try it?"
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 13: IMMUNE SYSTEM — ROUTE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export type AntibodyType = 'many_transfers' | 'high_crime' | 'potholes' | 'flooding' | 'construction' | 'dead_end';

export interface RouteAntibody {
  id: string;
  type: AntibodyType;
  pattern: {
    location?: LatLng;
    radius?: number;             // meters
    timeWindow?: [number, number]; // hours
    severity: number;
  };
  createdAt: Date;
  activations: number;
  isMemory: boolean;             // long-term immune memory
}

export interface ImmuneResponse {
  routeId: string;
  threats: Array<{
    antibody: RouteAntibody;
    matchScore: number;          // 0..1
    location: LatLng;
  }>;
  action: 'pass' | 'warn' | 'reject';
  alternativeRouteId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER SYSTEM INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/** The unified interface for the Quantum Transport Intelligence system */
export interface QuantumTransportSystem {
  // Quantum routing
  evaluateRouteSuperposition(routes: NavRoute[], weights: RouteWeights): RouteSuperposition;
  collapseToRoute(superposition: RouteSuperposition, selectedId: string): NavRoute;

  // Entanglement
  computeEntanglement(incident: TrafficIncident): TrafficEntanglementMap;

  // Swarm intelligence
  getSwarmRecommendation(intention: TravelIntention): Promise<SwarmRecommendation>;

  // Digital twin
  simulateScenario(scenario: WhatIfScenario): Promise<ScenarioResult>;
  getCitySnapshot(): SimulationSnapshot;

  // Genetic optimizer
  evolveRoutes(from: LatLng, to: LatLng, config?: Partial<GeneticConfig>): Promise<EvolutionResult>;

  // Negotiation
  negotiateResource(bid: ResourceBid): Promise<NegotiationOutcome>;

  // User twin
  simulateUserTrip(routeId: string, userId: string): Promise<TwinSimulationResult>;
  predictUserState(routeObjectives: RouteObjectives): PredictedUserState;

  // Knowledge graph
  queryKnowledgeGraph(query: KnowledgeGraphQuery): KnowledgeGraphResult;

  // Meta-cognition
  generateSelfReport(): SystemSelfReport;
  abductiveReason(observation: string): AbductiveHypothesis;

  // Time banking
  getTimeAccount(userId: string): TimeAccount;
  recordTimeSaved(userId: string, minutes: number, routeId: string): void;

  // Counterfactual
  analyzeCounterfactual(chosenId: string, alternativeIds: string[]): CounterfactualAnalysis;

  // Immune system
  validateRoute(route: NavRoute): ImmuneResponse;

  // Embeddings
  embedRoute(route: NavRoute): RouteEmbedding;
  findSimilarRoutes(embedding: RouteEmbedding, k: number): RouteEmbedding[];
}

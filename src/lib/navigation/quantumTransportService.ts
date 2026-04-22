import type { LatLng } from '@/types/taxi';
import type { NavRoute, TravelMode } from '@/types/navigation';
import { routePreferenceLearner, type RouteScores, type RouteWeights, type TripContext } from '@/lib/navigation/routePreferenceLearner';
import { evaluateRouteSuperposition } from '@/lib/navigation/quantumRouteEvaluator';
import { simulateUserTrip } from '@/lib/navigation/userDigitalTwin';
import { computeSwarmRecommendation, createTravelIntention, registerIntention, removeIntention } from '@/lib/navigation/swarmIntelligence';
import { getTimeAccount, loadTimeAccount, recordTimeSaved, summarizeTimeValue } from '@/lib/navigation/timeBank';
import { recordRoutingEvent, recordFeedback, generateSelfReport, abductiveReason, hydrateMetaCognition } from '@/lib/navigation/metaCognition';
import { citySimulation, initializeSimulationFromGraph } from '@/lib/navigation/citySimulation';
import { loadOsmGraph, type OSMGraph } from '@/lib/navigation/osmGraph';
import type {
  RouteSuperposition,
  TwinSimulationResult,
  SwarmRecommendation,
  TimeAccount,
  SimulationSnapshot,
  WhatIfScenario,
  ScenarioResult,
  SystemSelfReport,
  AbductiveHypothesis,
} from '@/types/quantum-transport';

const DEFAULT_ROUTE_WEIGHTS: RouteWeights = {
  time: 0.35,
  cost: 0.20,
  eco: 0.10,
  safety: 0.15,
  comfort: 0.10,
  transfers: 0.10,
};

export interface QuantumLiveInsights {
  quantumSuperposition: RouteSuperposition | null;
  twinSimulation: TwinSimulationResult | null;
  swarmRecommendation: SwarmRecommendation | null;
  timeAccount: TimeAccount | null;
}

interface LiveInsightInput {
  route: NavRoute | null;
  alternatives: NavRoute[];
  userId: string | null;
  travelMode: TravelMode;
  origin: LatLng | null;
  destination: LatLng | null;
}

interface RouteBuildTelemetry {
  userId?: string | null;
  success: boolean;
  latencyMs: number;
  travelMode: TravelMode;
  destinationId?: string;
  errorType?: string;
}

interface RouteSelectionInput {
  selectedRoute: NavRoute;
  alternatives: NavRoute[];
  userId: string;
  travelMode: TravelMode;
}

interface ArrivalInput {
  userId: string;
  route: NavRoute;
  alternatives: NavRoute[];
}

class QuantumTransportService {
  private activeIntentionId: string | null = null;
  private cityReadyPromise: Promise<SimulationSnapshot> | null = null;

  async initUser(userId: string): Promise<TimeAccount> {
    const [account] = await Promise.all([
      loadTimeAccount(userId),
      routePreferenceLearner.loadProfile(userId),
      hydrateMetaCognition(userId).catch(() => undefined),
      this.ensureCitySimulationReady().catch(() => undefined),
    ]);

    return account;
  }

  buildLiveInsights(input: LiveInsightInput): QuantumLiveInsights {
    if (!input.route) {
      this.clearLiveSession();
      return {
        quantumSuperposition: null,
        twinSimulation: null,
        swarmRecommendation: null,
        timeAccount: input.userId ? getTimeAccount(input.userId) : null,
      };
    }

    const weights = routePreferenceLearner.getProfile()?.weights ?? DEFAULT_ROUTE_WEIGHTS;
    const quantumSuperposition = evaluateRouteSuperposition(
      [input.route, ...input.alternatives],
      weights,
      input.travelMode,
    );

    const twinSimulation = input.userId
      ? simulateUserTrip(input.route, input.userId, input.travelMode)
      : null;

    let swarmRecommendation: SwarmRecommendation | null = null;
    if (input.origin && input.destination) {
      const intention = createTravelIntention(input.origin, input.destination, [input.travelMode]);
      registerIntention(intention);
      if (this.activeIntentionId) {
        removeIntention(this.activeIntentionId);
      }
      this.activeIntentionId = intention.anonymousId;
      swarmRecommendation = computeSwarmRecommendation(intention);
    } else {
      this.clearLiveSession();
    }

    return {
      quantumSuperposition,
      twinSimulation,
      swarmRecommendation,
      timeAccount: input.userId ? getTimeAccount(input.userId) : null,
    };
  }

  recordRouteBuild(telemetry: RouteBuildTelemetry): void {
    recordRoutingEvent({
      timestamp: new Date(),
      latencyMs: telemetry.latencyMs,
      success: telemetry.success,
      errorType: telemetry.errorType,
      context: {
        userId: telemetry.userId,
        travelMode: telemetry.travelMode,
        destinationId: telemetry.destinationId,
      },
    });
  }

  async trackRouteSelection(input: RouteSelectionInput): Promise<void> {
    const context = this.getTripContext(input.travelMode);
    await routePreferenceLearner.onRouteSelected(
      this.routeToScores(input.selectedRoute, input.travelMode),
      input.alternatives.map((candidate) => this.routeToScores(candidate, input.travelMode)),
      context,
    );
  }

  handleNavigationStart(userId: string | null, routeId: string): void {
    if (!userId) return;
    recordFeedback('positive', { userId, stage: 'start_navigation', routeId });
  }

  handleNavigationArrival(input: ArrivalInput): TimeAccount | null {
    const slowestAlternative = [input.route, ...input.alternatives].sort(
      (left, right) => right.totalDurationSeconds - left.totalDurationSeconds,
    )[0];
    const savedMinutes = Math.max(
      0,
      Math.round((slowestAlternative.totalDurationSeconds - input.route.totalDurationSeconds) / 60),
    );

    let account: TimeAccount | null = getTimeAccount(input.userId);
    if (savedMinutes > 0) {
      account = recordTimeSaved(
        input.userId,
        savedMinutes,
        input.route.id,
        'Экономия времени за счёт оптимального маршрута',
      );
    }

    recordFeedback('positive', {
      userId: input.userId,
      stage: 'arrival',
      routeId: input.route.id,
      savedMinutes,
    });

    return account;
  }

  clearLiveSession(): void {
    if (this.activeIntentionId) {
      removeIntention(this.activeIntentionId);
      this.activeIntentionId = null;
    }
  }

  async ensureCitySimulationReady(force = false): Promise<SimulationSnapshot> {
    if (!force && citySimulation.getSnapshot().links.length > 0) {
      return citySimulation.getSnapshot();
    }

    if (!force && this.cityReadyPromise) {
      return this.cityReadyPromise;
    }

    this.cityReadyPromise = (async () => {
      const graph = await loadOsmGraph(force);
      if (!graph) {
        throw new Error('OSM graph is unavailable for city simulation');
      }

      initializeSimulationFromGraph(graph);
      this.seedAgentsFromGraph(graph);
      citySimulation.runSteps(8);
      return citySimulation.getSnapshot();
    })();

    try {
      return await this.cityReadyPromise;
    } finally {
      this.cityReadyPromise = null;
    }
  }

  async getCitySnapshot(): Promise<SimulationSnapshot> {
    return this.ensureCitySimulationReady();
  }

  async getScenarioPresets(): Promise<WhatIfScenario[]> {
    const snapshot = await this.ensureCitySimulationReady();
    const primaryLinkId = snapshot.links[0]?.id ?? 'link_0';
    const secondaryLinkId = snapshot.links[Math.min(5, Math.max(snapshot.links.length - 1, 0))]?.id ?? primaryLinkId;

    return [
      {
        id: 'rush-hour-demand-shift',
        name: 'Сдвиг утреннего спроса',
        description: 'Часть пользователей выезжает раньше, чтобы разгрузить пик.',
        modifications: [
          { type: 'shift_demand', zoneId: 'center', shiftMinutes: -20, percentage: 18 },
        ],
      },
      {
        id: 'artery-closure',
        name: 'Перекрытие магистрали',
        description: 'Аварийное перекрытие одного из ключевых дорожных коридоров.',
        modifications: [
          { type: 'close_road', roadId: primaryLinkId, from: new Date(), to: new Date(Date.now() + 60 * 60 * 1000) },
        ],
      },
      {
        id: 'transit-price-incentive',
        name: 'Стимул на общественный транспорт',
        description: 'Временное снижение цены на транзитные поездки в перегруженный период.',
        modifications: [
          { type: 'change_price', domain: 'metro', multiplier: 0.85 },
          { type: 'change_price', domain: 'bus', multiplier: 0.90 },
        ],
      },
      {
        id: 'capacity-upgrade',
        name: 'Локальное расширение пропускной способности',
        description: 'Добавление полос на перегруженном участке.',
        modifications: [
          { type: 'add_capacity', roadId: secondaryLinkId, lanesAdded: 1 },
        ],
      },
    ];
  }

  async runScenario(scenario: WhatIfScenario, simulationMinutes = 60): Promise<ScenarioResult> {
    await this.ensureCitySimulationReady();
    return citySimulation.evaluateScenario(scenario, simulationMinutes);
  }

  async generateSelfReport(userId: string): Promise<SystemSelfReport> {
    await hydrateMetaCognition(userId);
    return generateSelfReport();
  }

  async explainObservation(observation: string, userId?: string): Promise<AbductiveHypothesis> {
    if (userId) {
      await hydrateMetaCognition(userId);
    }
    return abductiveReason(observation);
  }

  async getLabState(userId: string): Promise<{
    snapshot: SimulationSnapshot;
    scenarios: WhatIfScenario[];
    selfReport: SystemSelfReport;
    timeAccount: TimeAccount;
    timeSummary: string;
  }> {
    const [snapshot, scenarios, selfReport, timeAccount] = await Promise.all([
      this.getCitySnapshot(),
      this.getScenarioPresets(),
      this.generateSelfReport(userId),
      loadTimeAccount(userId),
    ]);

    return {
      snapshot,
      scenarios,
      selfReport,
      timeAccount,
      timeSummary: summarizeTimeValue(userId),
    };
  }

  private seedAgentsFromGraph(graph: OSMGraph): void {
    const nodeEntries = Object.entries(graph.nodes);
    if (nodeEntries.length < 2) return;

    const sampleCount = Math.min(180, Math.max(48, Math.floor(nodeEntries.length / 150)));
    const agentTypes: Array<{ type: 'car' | 'bus' | 'pedestrian'; share: number; baseSpeed: number }> = [
      { type: 'car', share: 0.62, baseSpeed: 28 },
      { type: 'bus', share: 0.18, baseSpeed: 20 },
      { type: 'pedestrian', share: 0.20, baseSpeed: 5 },
    ];

    for (let index = 0; index < sampleCount; index++) {
      const origin = nodeEntries[(index * 97) % nodeEntries.length]?.[1];
      const destination = nodeEntries[(index * 193 + 17) % nodeEntries.length]?.[1];
      if (!origin || !destination) continue;

      const threshold = index / sampleCount;
      const descriptor = agentTypes.find((candidate, candidateIndex) => {
        const lowerBound = agentTypes.slice(0, candidateIndex).reduce((sum, item) => sum + item.share, 0);
        return threshold >= lowerBound && threshold < lowerBound + candidate.share;
      }) ?? agentTypes[0];

      citySimulation.addAgent(
        descriptor.type,
        { lat: origin.lat, lng: origin.lon },
        { lat: destination.lat, lng: destination.lon },
        descriptor.baseSpeed + (index % 7),
      );
    }
  }

  private getTripContext(travelMode: TravelMode): TripContext {
    const now = new Date();
    return {
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      isWeekend: [0, 6].includes(now.getDay()),
      travelMode,
    };
  }

  private routeToScores(route: NavRoute, travelMode: TravelMode): RouteScores {
    const distanceKm = route.totalDistanceMeters / 1000;
    const congestionPenalty = route.segments.filter(
      (segment) => segment.traffic === 'slow' || segment.traffic === 'congested',
    ).length;
    const complexManeuvers = route.maneuvers.filter(
      (maneuver) => maneuver.type.includes('sharp') || maneuver.type === 'uturn' || maneuver.type === 'roundabout',
    ).length;
    const modeCostPerKm: Record<TravelMode, number> = {
      car: 8,
      taxi: 20,
      pedestrian: 0,
      transit: 2.5,
      metro: 2,
      multimodal: 4,
    };
    const modeEcoFactor: Record<TravelMode, number> = {
      car: 4,
      taxi: 3.5,
      pedestrian: 10,
      transit: 8,
      metro: 9,
      multimodal: 7,
    };

    return {
      routeId: route.id,
      durationSeconds: route.totalDurationSeconds,
      distanceMeters: route.totalDistanceMeters,
      costRub: Math.round(distanceKm * modeCostPerKm[travelMode]),
      transfers: Math.max(
        0,
        route.maneuvers.filter((maneuver) => maneuver.type === 'merge-left' || maneuver.type === 'merge-right').length - 1,
      ),
      ecoScore: Math.max(0, Math.min(10, modeEcoFactor[travelMode] - congestionPenalty * 0.4)),
      safetyScore: Math.max(0.2, 1 - complexManeuvers * 0.08),
      comfortScore: Math.max(0.2, 1 - congestionPenalty / Math.max(route.segments.length, 1)),
    };
  }
}

export const quantumTransportService = new QuantumTransportService();
/**
 * Genetic Route Optimizer — Evolutionary Route Discovery.
 *
 * Uses genetic algorithms to evolve route populations:
 * - Selection: tournament + elitism
 * - Crossover: route segment exchange at common nodes
 * - Mutation: waypoint insertion/removal, mode switch, time shift
 * - Multi-objective fitness via weighted RouteObjectives
 *
 * Discovers novel routes that heuristic algorithms would miss.
 */

import type { LatLng } from '@/types/taxi';
import type { TravelMode } from '@/types/navigation';
import type { RouteWeights } from '@/lib/navigation/routePreferenceLearner';
import type {
  RouteGene,
  RouteChromosome,
  GeneticConfig,
  EvolutionResult,
  RouteObjectives,
} from '@/types/quantum-transport';

// ══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: GeneticConfig = {
  populationSize: 80,
  elitismRate: 0.10,
  crossoverRate: 0.70,
  mutationRate: 0.15,
  maxGenerations: 50,
  convergenceThreshold: 0.001,
  fitnessWeights: {
    time: 0.30,
    cost: 0.20,
    eco: 0.15,
    safety: 0.15,
    comfort: 0.10,
    transfers: 0.10,
  },
};

// ══════════════════════════════════════════════════════════════════════════
// FITNESS EVALUATION
// ══════════════════════════════════════════════════════════════════════════

/** Compute fitness from objectives and weights (higher = better) */
function computeFitness(objectives: RouteObjectives, weights: RouteWeights): number {
  // Normalize each objective to [0..1] (lower original value = better except safety/comfort/reliability)
  const timeScore = 1 - clamp(objectives.timeSeconds / 7200, 0, 1);       // <2h = good
  const costScore = 1 - clamp(objectives.costRub / 1000, 0, 1);           // <1000₽ = good
  const co2Score = 1 - clamp(objectives.co2Grams / 5000, 0, 1);           // <5kg = good
  const safetyScore = objectives.safetyScore;
  const comfortScore = objectives.comfortScore;
  const transferScore = 1 - clamp(objectives.transfers / 5, 0, 1);        // <5 transfers = good

  return (
    weights.time * timeScore +
    weights.cost * costScore +
    weights.eco * co2Score +
    weights.safety * safetyScore +
    weights.comfort * comfortScore +
    weights.transfers * transferScore
  );
}

/** Estimate objectives from a chromosome's genes (simplified model) */
function estimateObjectives(genes: RouteGene[]): RouteObjectives {
  if (genes.length < 2) {
    return {
      timeSeconds: 0,
      costRub: 0,
      co2Grams: 0,
      safetyScore: 1,
      comfortScore: 1,
      reliabilityScore: 1,
      transfers: 0,
      walkingMeters: 0,
    };
  }

  let totalTime = 0;
  let totalCost = 0;
  let totalCO2 = 0;
  let totalWalking = 0;
  let transfers = 0;
  let safetyAccum = 0;
  let comfortAccum = 0;

  const modeStats: Record<TravelMode, { speedKmh: number; costPerKm: number; co2PerKm: number; safety: number; comfort: number }> = {
    car: { speedKmh: 35, costPerKm: 12, co2PerKm: 180, safety: 0.7, comfort: 0.8 },
    taxi: { speedKmh: 35, costPerKm: 24, co2PerKm: 190, safety: 0.74, comfort: 0.85 },
    pedestrian: { speedKmh: 5, costPerKm: 0, co2PerKm: 0, safety: 0.8, comfort: 0.6 },
    transit: { speedKmh: 25, costPerKm: 3, co2PerKm: 30, safety: 0.9, comfort: 0.5 },
    metro: { speedKmh: 40, costPerKm: 2.5, co2PerKm: 18, safety: 0.94, comfort: 0.68 },
    multimodal: { speedKmh: 20, costPerKm: 6, co2PerKm: 60, safety: 0.8, comfort: 0.6 },
  };

  let prevMode: TravelMode | null = null;

  for (let i = 1; i < genes.length; i++) {
    const gene = genes[i];
    const stats = modeStats[gene.mode] ?? modeStats.car;

    // Approximate distance between consecutive genes as 1km (simplified)
    const distKm = 1.0;

    totalTime += (distKm / stats.speedKmh) * 3600;
    totalCost += distKm * stats.costPerKm;
    totalCO2 += distKm * stats.co2PerKm;
    safetyAccum += stats.safety;
    comfortAccum += stats.comfort;

    if (gene.mode === 'pedestrian') {
      totalWalking += distKm * 1000;
    }

    if (prevMode && prevMode !== gene.mode) {
      transfers++;
    }
    prevMode = gene.mode;
  }

  const segCount = Math.max(genes.length - 1, 1);

  return {
    timeSeconds: totalTime,
    costRub: totalCost,
    co2Grams: totalCO2,
    safetyScore: safetyAccum / segCount,
    comfortScore: comfortAccum / segCount,
    reliabilityScore: clamp(1 - transfers * 0.1, 0.3, 1),
    transfers,
    walkingMeters: totalWalking,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// POPULATION INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════

let chromoCounter = 0;

function createRandomChromosome(
  startNode: string,
  endNode: string,
  intermediateNodes: string[],
  generation: number
): RouteChromosome {
  const modes: TravelMode[] = ['car', 'taxi', 'pedestrian', 'transit', 'metro', 'multimodal'];
  const genes: RouteGene[] = [];

  // Start gene
  genes.push({ nodeId: startNode, mode: modes[randInt(0, modes.length - 1)], departureOffset: 0 });

  // Random intermediate waypoints (2-6)
  const waypointCount = randInt(2, Math.min(6, intermediateNodes.length));
  const shuffled = shuffleArray([...intermediateNodes]);
  let timeOffset = 0;

  for (let i = 0; i < waypointCount; i++) {
    const segTime = randInt(300, 1200); // 5-20 min between waypoints
    timeOffset += segTime;
    genes.push({
      nodeId: shuffled[i],
      mode: modes[randInt(0, modes.length - 1)],
      departureOffset: timeOffset,
    });
  }

  // End gene
  timeOffset += randInt(300, 1200);
  genes.push({ nodeId: endNode, mode: genes[genes.length - 1].mode, departureOffset: timeOffset });

  const id = `chromo_${++chromoCounter}`;
  const objectives = estimateObjectives(genes);

  return {
    id,
    genes,
    fitness: 0, // computed later
    generation,
    parentIds: null,
    mutationHistory: [],
  };
}

function initializePopulation(
  startNode: string,
  endNode: string,
  intermediateNodes: string[],
  size: number
): RouteChromosome[] {
  const population: RouteChromosome[] = [];
  for (let i = 0; i < size; i++) {
    population.push(createRandomChromosome(startNode, endNode, intermediateNodes, 0));
  }
  return population;
}

// ══════════════════════════════════════════════════════════════════════════
// SELECTION
// ══════════════════════════════════════════════════════════════════════════

/** Tournament selection: pick k random individuals, return the fittest */
function tournamentSelect(population: RouteChromosome[], k = 3): RouteChromosome {
  let best: RouteChromosome | null = null;
  for (let i = 0; i < k; i++) {
    const candidate = population[randInt(0, population.length - 1)];
    if (!best || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best!;
}

// ══════════════════════════════════════════════════════════════════════════
// CROSSOVER
// ══════════════════════════════════════════════════════════════════════════

/**
 * Single-point crossover at a common node.
 * If no common nodes, take first half of parent1 + second half of parent2.
 */
function crossover(parent1: RouteChromosome, parent2: RouteChromosome, generation: number): RouteChromosome {
  const genes1 = parent1.genes;
  const genes2 = parent2.genes;

  // Find common intermediate nodes
  const nodes1 = new Set(genes1.map(g => g.nodeId));
  const commonNodes = genes2.filter(g => nodes1.has(g.nodeId) && g !== genes2[0] && g !== genes2[genes2.length - 1]);

  let childGenes: RouteGene[];

  if (commonNodes.length > 0) {
    // Crossover at common node
    const crossPoint = commonNodes[randInt(0, commonNodes.length - 1)];
    const idx1 = genes1.findIndex(g => g.nodeId === crossPoint.nodeId);
    const idx2 = genes2.findIndex(g => g.nodeId === crossPoint.nodeId);

    if (idx1 > 0 && idx2 > 0 && idx2 < genes2.length) {
      childGenes = [
        ...genes1.slice(0, idx1),
        ...genes2.slice(idx2),
      ];
    } else {
      childGenes = halfAndHalf(genes1, genes2);
    }
  } else {
    childGenes = halfAndHalf(genes1, genes2);
  }

  // Recalculate departure offsets
  let offset = 0;
  for (let i = 0; i < childGenes.length; i++) {
    childGenes[i] = { ...childGenes[i], departureOffset: offset };
    offset += randInt(300, 900);
  }

  const id = `chromo_${++chromoCounter}`;
  return {
    id,
    genes: childGenes,
    fitness: 0,
    generation,
    parentIds: [parent1.id, parent2.id],
    mutationHistory: [],
  };
}

function halfAndHalf(genes1: RouteGene[], genes2: RouteGene[]): RouteGene[] {
  const mid1 = Math.floor(genes1.length / 2);
  const mid2 = Math.floor(genes2.length / 2);
  return [...genes1.slice(0, mid1), ...genes2.slice(mid2)];
}

// ══════════════════════════════════════════════════════════════════════════
// MUTATION
// ══════════════════════════════════════════════════════════════════════════

type MutationType = 'mode_switch' | 'waypoint_insert' | 'waypoint_remove' | 'time_shift' | 'swap';

function mutate(
  chromosome: RouteChromosome,
  intermediateNodes: string[],
  mutationRate: number
): RouteChromosome {
  if (Math.random() > mutationRate) return chromosome;

  const mutations: MutationType[] = ['mode_switch', 'waypoint_insert', 'waypoint_remove', 'time_shift', 'swap'];
  const mutation = mutations[randInt(0, mutations.length - 1)];
  const genes = [...chromosome.genes.map(g => ({ ...g }))];

  switch (mutation) {
    case 'mode_switch': {
      // Change mode of a random intermediate gene
      if (genes.length > 2) {
        const idx = randInt(1, genes.length - 2);
        const modes: TravelMode[] = ['car', 'taxi', 'pedestrian', 'transit', 'metro', 'multimodal'];
        genes[idx].mode = modes[randInt(0, modes.length - 1)];
      }
      break;
    }
    case 'waypoint_insert': {
      // Insert a random intermediate node
      if (intermediateNodes.length > 0 && genes.length < 10) {
        const newNode = intermediateNodes[randInt(0, intermediateNodes.length - 1)];
        const idx = randInt(1, genes.length - 1);
        const modes: TravelMode[] = ['car', 'taxi', 'pedestrian', 'transit', 'metro', 'multimodal'];
        genes.splice(idx, 0, {
          nodeId: newNode,
          mode: modes[randInt(0, modes.length - 1)],
          departureOffset: genes[idx - 1].departureOffset + randInt(300, 900),
        });
      }
      break;
    }
    case 'waypoint_remove': {
      // Remove a random intermediate gene
      if (genes.length > 3) {
        const idx = randInt(1, genes.length - 2);
        genes.splice(idx, 1);
      }
      break;
    }
    case 'time_shift': {
      // Shift departure offset of a random gene
      if (genes.length > 2) {
        const idx = randInt(1, genes.length - 2);
        genes[idx].departureOffset += randInt(-300, 300);
        if (genes[idx].departureOffset < 0) genes[idx].departureOffset = 0;
      }
      break;
    }
    case 'swap': {
      // Swap two intermediate genes
      if (genes.length > 3) {
        const i = randInt(1, genes.length - 2);
        const j = randInt(1, genes.length - 2);
        if (i !== j) {
          [genes[i], genes[j]] = [genes[j], genes[i]];
        }
      }
      break;
    }
  }

  return {
    ...chromosome,
    genes,
    mutationHistory: [...chromosome.mutationHistory, mutation],
  };
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN EVOLUTION LOOP
// ══════════════════════════════════════════════════════════════════════════

/**
 * Run genetic algorithm to discover optimized route chromosomes.
 *
 * @param startNode - Origin node ID
 * @param endNode - Destination node ID
 * @param intermediateNodes - Pool of candidate intermediate waypoints
 * @param config - Genetic algorithm configuration
 */
export function evolveRoutes(
  startNode: string,
  endNode: string,
  intermediateNodes: string[],
  config?: Partial<GeneticConfig>
): EvolutionResult {
  const cfg: GeneticConfig = { ...DEFAULT_CONFIG, ...config };
  const { populationSize, elitismRate, crossoverRate, mutationRate, maxGenerations, convergenceThreshold, fitnessWeights } = cfg;

  // Initialize
  let population = initializePopulation(startNode, endNode, intermediateNodes, populationSize);

  // Evaluate initial fitness
  for (const chromo of population) {
    const obj = estimateObjectives(chromo.genes);
    chromo.fitness = computeFitness(obj, fitnessWeights);
  }

  const fitnessHistory: number[] = [];
  let converged = false;

  for (let gen = 0; gen < maxGenerations; gen++) {
    // Sort by fitness (descending)
    population.sort((a, b) => b.fitness - a.fitness);
    fitnessHistory.push(population[0].fitness);

    // Check convergence
    if (gen > 5) {
      const recentImprovement = Math.abs(fitnessHistory[gen] - fitnessHistory[gen - 5]);
      if (recentImprovement < convergenceThreshold) {
        converged = true;
        break;
      }
    }

    // Elitism — top N survive
    const eliteCount = Math.max(1, Math.floor(populationSize * elitismRate));
    const nextGen: RouteChromosome[] = population.slice(0, eliteCount);

    // Fill rest with crossover + mutation
    while (nextGen.length < populationSize) {
      if (Math.random() < crossoverRate) {
        const parent1 = tournamentSelect(population);
        const parent2 = tournamentSelect(population);
        let child = crossover(parent1, parent2, gen + 1);
        child = mutate(child, intermediateNodes, mutationRate);
        const obj = estimateObjectives(child.genes);
        child.fitness = computeFitness(obj, fitnessWeights);
        nextGen.push(child);
      } else {
        // Mutation only
        const parent = tournamentSelect(population);
        let child = { ...parent, id: `chromo_${++chromoCounter}`, generation: gen + 1 };
        child = mutate(child, intermediateNodes, mutationRate);
        const obj = estimateObjectives(child.genes);
        child.fitness = computeFitness(obj, fitnessWeights);
        nextGen.push(child);
      }
    }

    population = nextGen;
  }

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);
  fitnessHistory.push(population[0].fitness);

  // Extract Pareto front (non-dominated solutions)
  const paretoFront = extractParetoFront(population, fitnessWeights);

  // Compute diversity
  const diversity = computeDiversity(population);

  return {
    bestChromosome: population[0],
    paretoFront,
    generationsRun: fitnessHistory.length - 1,
    fitnessHistory,
    diversity,
    converged,
  };
}

/**
 * Extract non-dominated chromosomes as the Pareto front.
 */
function extractParetoFront(population: RouteChromosome[], weights: RouteWeights): RouteChromosome[] {
  const objectives = population.map(c => ({
    chromo: c,
    obj: estimateObjectives(c.genes),
  }));

  const front: RouteChromosome[] = [];

  for (let i = 0; i < objectives.length; i++) {
    let dominated = false;
    for (let j = 0; j < objectives.length; j++) {
      if (i === j) continue;
      if (dominates(objectives[j].obj, objectives[i].obj)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      front.push(objectives[i].chromo);
    }
  }

  return front.length > 0 ? front : [population[0]];
}

/** Returns true if a dominates b (a is better or equal in all objectives, strictly better in at least one) */
function dominates(a: RouteObjectives, b: RouteObjectives): boolean {
  let strictlyBetter = false;

  // Lower is better: time, cost, co2, transfers, walking
  // Higher is better: safety, comfort, reliability
  const comparisons = [
    { diff: b.timeSeconds - a.timeSeconds, lowerBetter: true },
    { diff: b.costRub - a.costRub, lowerBetter: true },
    { diff: b.co2Grams - a.co2Grams, lowerBetter: true },
    { diff: a.safetyScore - b.safetyScore, lowerBetter: false },
    { diff: a.comfortScore - b.comfortScore, lowerBetter: false },
    { diff: b.transfers - a.transfers, lowerBetter: true },
  ];

  for (const c of comparisons) {
    const diff = c.lowerBetter ? c.diff : c.diff;
    if (diff < 0) return false; // b is better in this dimension
    if (diff > 0) strictlyBetter = true;
  }

  return strictlyBetter;
}

/** Compute population diversity as average pairwise fitness distance */
function computeDiversity(population: RouteChromosome[]): number {
  if (population.length < 2) return 0;

  let totalDiff = 0;
  let pairs = 0;

  // Sample pairs to avoid O(n²) for large populations
  const sampleSize = Math.min(population.length, 20);
  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < sampleSize; j++) {
      totalDiff += Math.abs(population[i].fitness - population[j].fitness);
      pairs++;
    }
  }

  return pairs > 0 ? totalDiff / pairs : 0;
}

// ══════════════════════════════════════════════════════════════════════════
// COORDINATE-BASED ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════

/**
 * High-level entry: evolve routes between two coordinates.
 * Generates synthetic intermediate nodes along the corridor.
 */
export function evolveRoutesFromCoords(
  from: LatLng,
  to: LatLng,
  config?: Partial<GeneticConfig>
): EvolutionResult {
  const startNode = `${from.lat.toFixed(5)}_${from.lng.toFixed(5)}`;
  const endNode = `${to.lat.toFixed(5)}_${to.lng.toFixed(5)}`;

  // Generate intermediate node candidates along and around the corridor
  const intermediateNodes = generateCorridorNodes(from, to, 20);

  return evolveRoutes(startNode, endNode, intermediateNodes, config);
}

/** Generate candidate nodes in a corridor between two points */
function generateCorridorNodes(from: LatLng, to: LatLng, count: number): string[] {
  const nodes: string[] = [];
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;

  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    // Midpoint + random offset perpendicular to the line
    const perpLat = -dLng * (Math.random() - 0.5) * 0.3;
    const perpLng = dLat * (Math.random() - 0.5) * 0.3;

    const lat = from.lat + dLat * t + perpLat;
    const lng = from.lng + dLng * t + perpLng;
    nodes.push(`${lat.toFixed(5)}_${lng.toFixed(5)}`);
  }

  return nodes;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

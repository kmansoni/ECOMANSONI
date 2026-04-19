/**
 * Multi-Stop Optimizer — решение задачи коммивояжёра (TSP) для нескольких точек.
 * Для N ≤ 15 — exact DP (Held-Karp); для N > 15 — 2-opt heuristic.
 */

import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface OptimizedItinerary {
  /** Оптимальный порядок посещения (индексы исходных точек) */
  order: number[];
  /** Суммарная дистанция (км) */
  totalDistanceKm: number;
  /** Суммарное время (секунды, приблизительно) */
  totalTimeSeconds: number;
  /** Экономия vs наивный порядок (%) */
  savingsPercent: number;
  /** Точки в оптимальном порядке */
  orderedStops: Array<LatLng & { label?: string }>;
  /** Расстояния между последовательными точками */
  legDistances: number[];
}

type DistanceMatrix = number[][];

// ── Haversine ──

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── Построение матрицы расстояний ──

function buildDistanceMatrix(
  stops: LatLng[],
  customDistances?: DistanceMatrix
): DistanceMatrix {
  if (customDistances) return customDistances;

  const n = stops.length;
  const matrix: DistanceMatrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(stops[i], stops[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

// ── Held-Karp (Exact DP) — O(n² · 2ⁿ) ──

function heldKarp(dist: DistanceMatrix, startIdx: number): number[] {
  const n = dist.length;
  const fullMask = (1 << n) - 1;

  // dp[mask][i] = min cost to visit all cities in mask, ending at i
  const dp: Float64Array[] = Array.from({ length: 1 << n }, () =>
    new Float64Array(n).fill(Infinity)
  );
  const parent: Int32Array[] = Array.from({ length: 1 << n }, () =>
    new Int32Array(n).fill(-1)
  );

  dp[1 << startIdx][startIdx] = 0;

  for (let mask = 0; mask <= fullMask; mask++) {
    for (let u = 0; u < n; u++) {
      if (!(mask & (1 << u))) continue;
      if (dp[mask][u] === Infinity) continue;

      for (let v = 0; v < n; v++) {
        if (mask & (1 << v)) continue;
        const nextMask = mask | (1 << v);
        const newCost = dp[mask][u] + dist[u][v];
        if (newCost < dp[nextMask][v]) {
          dp[nextMask][v] = newCost;
          parent[nextMask][v] = u;
        }
      }
    }
  }

  // Find best end node (open TSP — no return to start)
  let bestEnd = 0;
  let bestCost = Infinity;
  for (let i = 0; i < n; i++) {
    if (dp[fullMask][i] < bestCost) {
      bestCost = dp[fullMask][i];
      bestEnd = i;
    }
  }

  // Reconstruct path
  const path: number[] = [];
  let mask = fullMask;
  let current = bestEnd;

  while (current !== -1) {
    path.push(current);
    const prev = parent[mask][current];
    mask ^= (1 << current);
    current = prev;
  }

  return path.reverse();
}

// ── 2-opt Heuristic — O(n² · iterations) ──

function twoOptSolve(dist: DistanceMatrix, startIdx: number): number[] {
  const n = dist.length;

  // Start with nearest-neighbor greedy order
  let route = nearestNeighbor(dist, startIdx);
  let bestCost = routeCost(dist, route);

  let improved = true;
  let iterations = 0;
  const maxIterations = n * n * 2;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Try reversing segment [i..j]
        const newRoute = twoOptSwap(route, i, j);
        const newCost = routeCost(dist, newRoute);

        if (newCost < bestCost - 0.001) {
          route = newRoute;
          bestCost = newCost;
          improved = true;
        }
      }
    }
  }

  return route;
}

function nearestNeighbor(dist: DistanceMatrix, start: number): number[] {
  const n = dist.length;
  const visited = new Set<number>([start]);
  const path = [start];

  while (visited.size < n) {
    const last = path[path.length - 1];
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < n; i++) {
      if (!visited.has(i) && dist[last][i] < nearestDist) {
        nearest = i;
        nearestDist = dist[last][i];
      }
    }

    if (nearest === -1) break;
    visited.add(nearest);
    path.push(nearest);
  }

  return path;
}

function twoOptSwap(route: number[], i: number, j: number): number[] {
  const newRoute = route.slice(0, i);
  // Reverse segment [i..j]
  for (let k = j; k >= i; k--) {
    newRoute.push(route[k]);
  }
  // Append rest
  for (let k = j + 1; k < route.length; k++) {
    newRoute.push(route[k]);
  }
  return newRoute;
}

function routeCost(dist: DistanceMatrix, route: number[]): number {
  let cost = 0;
  for (let i = 0; i < route.length - 1; i++) {
    cost += dist[route[i]][route[i + 1]];
  }
  return cost;
}

// ── Публичный API ──

/**
 * Оптимизировать порядок посещения нескольких остановок.
 * @param stops - массив точек для посещения
 * @param startIndex - индекс начальной точки (0 по умолчанию)
 * @param fixedEnd - если true, последняя точка фиксирована (маршрут A→...→Z)
 * @param customDistances - опциональная матрица расстояний (иначе Haversine)
 * @param avgSpeedKmh - средняя скорость для оценки времени
 */
export function optimizeStopOrder(
  stops: Array<LatLng & { label?: string }>,
  startIndex = 0,
  fixedEnd = false,
  customDistances?: DistanceMatrix,
  avgSpeedKmh = 40
): OptimizedItinerary {
  const n = stops.length;

  if (n <= 1) {
    return {
      order: n === 1 ? [0] : [],
      totalDistanceKm: 0,
      totalTimeSeconds: 0,
      savingsPercent: 0,
      orderedStops: [...stops],
      legDistances: [],
    };
  }

  const dist = buildDistanceMatrix(stops, customDistances);

  // Calculate naive (input order) cost for comparison
  const naiveCost = routeCost(dist, Array.from({ length: n }, (_, i) => i));

  let order: number[];

  if (fixedEnd && n > 2) {
    // Fixed start and end — optimize middle points only
    const middleStops = stops.filter((_, i) => i !== startIndex && i !== n - 1);
    const middleIndices = Array.from({ length: n }, (_, i) => i).filter(i => i !== startIndex && i !== n - 1);

    if (middleIndices.length <= 13) {
      // Held-Karp on middle + virtual connections
      const subDist = buildDistanceMatrix(middleStops);
      const subOrder = middleIndices.length > 1
        ? heldKarp(subDist, 0)
        : [0];
      order = [startIndex, ...subOrder.map(i => middleIndices[i]), n - 1];
    } else {
      const subDist = buildDistanceMatrix(middleStops);
      const subOrder = twoOptSolve(subDist, 0);
      order = [startIndex, ...subOrder.map(i => middleIndices[i]), n - 1];
    }
  } else {
    // Free end
    if (n <= 15) {
      order = heldKarp(dist, startIndex);
    } else {
      order = twoOptSolve(dist, startIndex);
    }
  }

  // Compute distances between consecutive stops
  const legDistances: number[] = [];
  let totalDist = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const d = dist[order[i]][order[i + 1]];
    legDistances.push(Math.round(d * 100) / 100);
    totalDist += d;
  }

  const optimizedCost = routeCost(dist, order);
  const savings = naiveCost > 0 ? ((naiveCost - optimizedCost) / naiveCost) * 100 : 0;

  return {
    order,
    totalDistanceKm: Math.round(totalDist * 100) / 100,
    totalTimeSeconds: Math.round((totalDist / avgSpeedKmh) * 3600),
    savingsPercent: Math.round(Math.max(savings, 0) * 10) / 10,
    orderedStops: order.map(i => stops[i]),
    legDistances,
  };
}

/**
 * Добавить промежуточную остановку и пересчитать маршрут.
 */
export function addStopAndReoptimize(
  currentItinerary: OptimizedItinerary,
  newStop: LatLng & { label?: string },
  avgSpeedKmh = 40
): OptimizedItinerary {
  const allStops = [...currentItinerary.orderedStops, newStop];
  return optimizeStopOrder(allStops, 0, false, undefined, avgSpeedKmh);
}

/**
 * Удалить остановку по индексу и пересчитать маршрут.
 */
export function removeStopAndReoptimize(
  currentItinerary: OptimizedItinerary,
  removeIndex: number,
  avgSpeedKmh = 40
): OptimizedItinerary {
  const allStops = currentItinerary.orderedStops.filter((_, i) => i !== removeIndex);
  if (allStops.length === 0) {
    return { order: [], totalDistanceKm: 0, totalTimeSeconds: 0, savingsPercent: 0, orderedStops: [], legDistances: [] };
  }
  return optimizeStopOrder(allStops, 0, false, undefined, avgSpeedKmh);
}

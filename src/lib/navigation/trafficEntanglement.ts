/**
 * Traffic Entanglement Engine.
 *
 * Models second-order effects of traffic incidents across the transport network.
 * An incident on one road "entangles" with metro, buses, parking, carsharing —
 * creating ripple effects that propagate through the city.
 *
 * Uses a causal graph to predict how disruptions cascade across transport domains.
 */

import type { LatLng } from '@/types/taxi';
import type {
  TrafficIncident,
  IncidentType,
  TransportDomain,
  EntanglementEffect,
  TrafficEntanglementMap,
} from '@/types/quantum-transport';

// ══════════════════════════════════════════════════════════════════════════
// CAUSAL PROPAGATION RULES
// ══════════════════════════════════════════════════════════════════════════

/** Defines how a disruption in one domain affects another */
interface PropagationRule {
  sourceDomain: TransportDomain;
  targetDomain: TransportDomain;
  impactType: EntanglementEffect['impactType'];
  baseMagnitude: number;          // base effect size
  severityMultiplier: number;     // scaled by incident severity
  delayMinutes: number;           // time before effect manifests
  durationMultiplier: number;     // relative to incident duration
  confidence: number;             // base confidence of this rule
  description: string;
}

/**
 * Predefined causal propagation rules — the "entanglement table".
 * Each rule says: "if domain X is disrupted, domain Y will see effect Z".
 */
const PROPAGATION_RULES: PropagationRule[] = [
  // Road → Metro: people switch to metro
  {
    sourceDomain: 'road', targetDomain: 'metro',
    impactType: 'load_increase',
    baseMagnitude: 0.25, severityMultiplier: 0.40,
    delayMinutes: 10, durationMultiplier: 1.2,
    confidence: 0.85,
    description: 'Автомобилисты переключаются на метро',
  },
  // Road → Bus: buses also stuck in traffic
  {
    sourceDomain: 'road', targetDomain: 'bus',
    impactType: 'delay',
    baseMagnitude: 0.15, severityMultiplier: 0.30,
    delayMinutes: 5, durationMultiplier: 1.0,
    confidence: 0.80,
    description: 'Автобусы задерживаются в пробке',
  },
  // Road → Taxi: surge pricing activates
  {
    sourceDomain: 'road', targetDomain: 'taxi',
    impactType: 'price_increase',
    baseMagnitude: 0.20, severityMultiplier: 0.50,
    delayMinutes: 8, durationMultiplier: 0.8,
    confidence: 0.75,
    description: 'Повышенный спрос → рост цен на такси',
  },
  // Road → Carsharing: cars near incident become unavailable
  {
    sourceDomain: 'road', targetDomain: 'carsharing',
    impactType: 'availability_decrease',
    baseMagnitude: 0.20, severityMultiplier: 0.25,
    delayMinutes: 15, durationMultiplier: 0.6,
    confidence: 0.65,
    description: 'Каршеринг-автомобили застряли в зоне инцидента',
  },
  // Road → Parking: parking near transit fills up
  {
    sourceDomain: 'road', targetDomain: 'parking',
    impactType: 'availability_decrease',
    baseMagnitude: 0.30, severityMultiplier: 0.30,
    delayMinutes: 20, durationMultiplier: 1.5,
    confidence: 0.60,
    description: 'Парковки у метро заполняются',
  },
  // Metro → Road: metro disruption → people take cars
  {
    sourceDomain: 'metro', targetDomain: 'road',
    impactType: 'load_increase',
    baseMagnitude: 0.15, severityMultiplier: 0.30,
    delayMinutes: 5, durationMultiplier: 1.0,
    confidence: 0.80,
    description: 'Пассажиры пересаживаются на автомобили',
  },
  // Metro → Bus: overloaded surface transit
  {
    sourceDomain: 'metro', targetDomain: 'bus',
    impactType: 'load_increase',
    baseMagnitude: 0.35, severityMultiplier: 0.40,
    delayMinutes: 5, durationMultiplier: 1.0,
    confidence: 0.85,
    description: 'Наземный транспорт перегружается',
  },
  // Metro → Taxi: surge demand for taxis
  {
    sourceDomain: 'metro', targetDomain: 'taxi',
    impactType: 'price_increase',
    baseMagnitude: 0.30, severityMultiplier: 0.50,
    delayMinutes: 3, durationMultiplier: 0.7,
    confidence: 0.85,
    description: 'Резкий рост спроса на такси',
  },
  // Bus → Metro: bus delays push to metro
  {
    sourceDomain: 'bus', targetDomain: 'metro',
    impactType: 'load_increase',
    baseMagnitude: 0.10, severityMultiplier: 0.20,
    delayMinutes: 10, durationMultiplier: 0.8,
    confidence: 0.70,
    description: 'Часть пассажиров переходит в метро',
  },
  // Construction → road capacity reduction
  {
    sourceDomain: 'road', targetDomain: 'road',
    impactType: 'delay',
    baseMagnitude: 0.40, severityMultiplier: 0.50,
    delayMinutes: 0, durationMultiplier: 1.0,
    confidence: 0.90,
    description: 'Строительные работы снижают пропускную способность',
  },
  // Event → Road: event generates traffic
  {
    sourceDomain: 'road', targetDomain: 'parking',
    impactType: 'availability_decrease',
    baseMagnitude: 0.50, severityMultiplier: 0.40,
    delayMinutes: 30, durationMultiplier: 2.0,
    confidence: 0.70,
    description: 'Мероприятие создаёт дефицит парковки',
  },
  // Road → Bike: cyclists affected by road incidents
  {
    sourceDomain: 'road', targetDomain: 'bike',
    impactType: 'delay',
    baseMagnitude: 0.10, severityMultiplier: 0.15,
    delayMinutes: 5, durationMultiplier: 0.5,
    confidence: 0.55,
    description: 'Велосипедные дорожки частично заблокированы',
  },
];

// ══════════════════════════════════════════════════════════════════════════
// ENTANGLEMENT COMPUTATION
// ══════════════════════════════════════════════════════════════════════════

/** Map incident type → primary transport domain */
function incidentToDomain(incident: TrafficIncident): TransportDomain {
  switch (incident.type) {
    case 'accident':
    case 'construction':
    case 'congestion':
      return 'road';
    case 'broken_signal':
      return 'road';
    case 'weather':
      return 'road'; // weather affects roads primarily
    case 'event':
      return 'road';
    default:
      return 'road';
  }
}

/**
 * Compute the full entanglement map for a traffic incident.
 * Propagates effects through the causal graph up to the specified depth.
 */
export function computeEntanglement(
  incident: TrafficIncident,
  maxDepth = 2
): TrafficEntanglementMap {
  const sourceDomain = incidentToDomain(incident);
  const allEffects: EntanglementEffect[] = [];
  const visited = new Set<string>();

  // BFS through the causal graph
  interface QueueItem {
    domain: TransportDomain;
    depth: number;
    parentSeverity: number;
  }

  const queue: QueueItem[] = [{ domain: sourceDomain, depth: 0, parentSeverity: incident.severity }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const key = `${current.domain}-${current.depth}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Find all rules where this domain is the source
    const applicableRules = PROPAGATION_RULES.filter(r => r.sourceDomain === current.domain);

    for (const rule of applicableRules) {
      const effectKey = `${rule.sourceDomain}->${rule.targetDomain}:${rule.impactType}`;
      if (visited.has(effectKey)) continue;
      visited.add(effectKey);

      const magnitude = rule.baseMagnitude + rule.severityMultiplier * current.parentSeverity;
      const confidence = rule.confidence * Math.pow(0.7, current.depth); // decay with depth
      const delayMinutes = rule.delayMinutes * (current.depth + 1);
      const durationMinutes = (incident.estimatedDuration / 60) * rule.durationMultiplier;

      const effect: EntanglementEffect = {
        sourceDomain: rule.sourceDomain,
        targetDomain: rule.targetDomain,
        targetEntity: getTargetEntityName(rule.targetDomain, incident.location),
        impactType: rule.impactType,
        magnitude: Math.min(magnitude, 1.0),
        confidence,
        delayMinutes,
        durationMinutes,
      };

      allEffects.push(effect);

      // Propagate to next depth if effect is significant
      if (magnitude > 0.1 && confidence > 0.3) {
        queue.push({
          domain: rule.targetDomain,
          depth: current.depth + 1,
          parentSeverity: magnitude,
        });
      }
    }
  }

  // Sort by confidence descending
  allEffects.sort((a, b) => b.confidence - a.confidence);

  // Generate recommendation
  const recommendation = generateEntanglementRecommendation(incident, allEffects);

  return {
    incident,
    effects: allEffects,
    propagationDepth: maxDepth,
    computedAt: new Date(),
    recommendation,
  };
}

/**
 * Get a human-readable recommendation based on the entanglement effects.
 */
function generateEntanglementRecommendation(
  incident: TrafficIncident,
  effects: EntanglementEffect[]
): string {
  const parts: string[] = [];

  // Find the biggest impact
  const highImpact = effects.filter(e => e.magnitude > 0.3 && e.confidence > 0.6);

  if (highImpact.length === 0) {
    return `Инцидент "${incident.description}" имеет ограниченное влияние на транспортную сеть.`;
  }

  parts.push(`⚠️ ${incident.description}`);

  // Group by target domain
  const byDomain = new Map<TransportDomain, EntanglementEffect[]>();
  for (const e of highImpact) {
    const arr = byDomain.get(e.targetDomain) ?? [];
    arr.push(e);
    byDomain.set(e.targetDomain, arr);
  }

  const domainNames: Record<TransportDomain, string> = {
    road: 'Дороги', metro: 'Метро', bus: 'Автобусы', tram: 'Трамваи',
    taxi: 'Такси', carsharing: 'Каршеринг', parking: 'Парковки', bike: 'Велосипеды',
  };

  for (const [domain, domainEffects] of byDomain) {
    const topEffect = domainEffects[0];
    const pct = Math.round(topEffect.magnitude * 100);
    const delay = Math.round(topEffect.delayMinutes);

    switch (topEffect.impactType) {
      case 'load_increase':
        parts.push(`${domainNames[domain]}: нагрузка +${pct}% через ${delay} мин`);
        break;
      case 'delay':
        parts.push(`${domainNames[domain]}: задержки +${pct}% через ${delay} мин`);
        break;
      case 'price_increase':
        parts.push(`${domainNames[domain]}: цены +${pct}% через ${delay} мин`);
        break;
      case 'availability_decrease':
        parts.push(`${domainNames[domain]}: доступность −${pct}% через ${delay} мин`);
        break;
    }
  }

  // Suggest best action
  const metroOverload = effects.find(e => e.targetDomain === 'metro' && e.magnitude > 0.3);
  const busDelay = effects.find(e => e.targetDomain === 'bus' && e.magnitude > 0.2);

  if (!metroOverload && !busDelay) {
    parts.push('💡 Рекомендация: переключитесь на метро или автобус');
  } else if (!metroOverload) {
    parts.push('💡 Рекомендация: используйте метро (пока не перегружено)');
  } else {
    parts.push('💡 Рекомендация: выезжайте раньше или отложите поездку на 30 мин');
  }

  return parts.join('\n');
}

/**
 * Get a representative entity name for a transport domain near a location.
 */
function getTargetEntityName(domain: TransportDomain, location: LatLng): string {
  // In production, would query the knowledge graph for nearest entities.
  // For now, return generic names based on domain.
  const genericNames: Record<TransportDomain, string> = {
    road: 'Прилегающие дороги',
    metro: 'Ближайшие станции метро',
    bus: 'Автобусные маршруты района',
    tram: 'Трамвайные маршруты района',
    taxi: 'Такси в радиусе 3 км',
    carsharing: 'Каршеринг в радиусе 2 км',
    parking: 'Парковки у транспортных узлов',
    bike: 'Велодорожки района',
  };
  return genericNames[domain] ?? domain;
}

// ══════════════════════════════════════════════════════════════════════════
// REAL-TIME INCIDENT MONITORING
// ══════════════════════════════════════════════════════════════════════════

/** Active entanglement maps indexed by incident ID */
const activeEntanglements = new Map<string, TrafficEntanglementMap>();

/** Register a new incident and compute its entanglement map */
export function registerIncident(incident: TrafficIncident): TrafficEntanglementMap {
  const map = computeEntanglement(incident);
  activeEntanglements.set(incident.id, map);
  return map;
}

/** Get all active entanglement effects for a given domain */
export function getActiveEffectsForDomain(domain: TransportDomain): EntanglementEffect[] {
  const effects: EntanglementEffect[] = [];
  const now = Date.now();

  for (const [, map] of activeEntanglements) {
    // Check if incident is still active
    const incidentEnd = map.incident.startedAt.getTime() + map.incident.estimatedDuration * 1000;
    if (now > incidentEnd) {
      activeEntanglements.delete(map.incident.id);
      continue;
    }

    for (const effect of map.effects) {
      if (effect.targetDomain === domain) {
        // Check if effect has started
        const effectStart = map.incident.startedAt.getTime() + effect.delayMinutes * 60_000;
        if (now >= effectStart) {
          effects.push(effect);
        }
      }
    }
  }

  return effects;
}

/** Get combined disruption score for a domain (0 = normal, 1 = severely disrupted) */
export function getDomainDisruptionScore(domain: TransportDomain): number {
  const effects = getActiveEffectsForDomain(domain);
  if (effects.length === 0) return 0;

  // Combine effects (capped at 1.0)
  let score = 0;
  for (const e of effects) {
    score += e.magnitude * e.confidence;
  }
  return Math.min(score, 1.0);
}

/** Clear expired incidents */
export function cleanupExpiredIncidents(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, map] of activeEntanglements) {
    const endTime = map.incident.startedAt.getTime() + map.incident.estimatedDuration * 1000;
    if (now > endTime) {
      activeEntanglements.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

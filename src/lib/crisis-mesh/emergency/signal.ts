/**
 * Crisis Mesh — Emergency Signal service.
 * Управление SOS-сигналами: приём, дедуп, приоритезация, разрешение.
 */

import {
  type EmergencyLevel,
  type EmergencySignal,
  type MeshMessageId,
  type PeerId,
  type SignalType,
} from '../types';
import { haversineKm } from './haversine';

const SIGNAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface EmergencyServiceEvents {
  onSignalAdded?: (signal: EmergencySignal) => void;
  onSignalUpdated?: (signal: EmergencySignal) => void;
  onCriticalReceived?: (signal: EmergencySignal) => void;
}

export class EmergencyService {
  private readonly active = new Map<MeshMessageId, EmergencySignal>();
  private readonly resolved = new Map<MeshMessageId, EmergencySignal>();
  private readonly events: EmergencyServiceEvents;

  constructor(events: EmergencyServiceEvents = {}) {
    this.events = events;
  }

  /**
   * Добавить только что созданный локально сигнал.
   */
  ingest(signal: EmergencySignal): { accepted: boolean; reason?: string } {
    // Дубликат
    if (this.active.has(signal.id) || this.resolved.has(signal.id)) {
      return { accepted: false, reason: 'duplicate' };
    }

    // Истёк
    if (Date.now() - signal.timestamp > SIGNAL_TTL_MS) {
      return { accepted: false, reason: 'expired' };
    }

    this.active.set(signal.id, signal);
    this.events.onSignalAdded?.(signal);

    if (signal.level === 'critical') {
      this.events.onCriticalReceived?.(signal);
    }

    return { accepted: true };
  }

  /**
   * Пометить сигнал как разрешённый.
   */
  resolve(id: MeshMessageId, byPeerId: PeerId, now: number = Date.now()): boolean {
    const sig = this.active.get(id);
    if (!sig) return false;
    const resolved: EmergencySignal = {
      ...sig,
      status: 'resolved',
      resolvedBy: byPeerId,
      resolvedAt: now,
    };
    this.active.delete(id);
    this.resolved.set(id, resolved);
    this.events.onSignalUpdated?.(resolved);
    return true;
  }

  /**
   * Все активные сигналы, отсортированы по приоритету и времени.
   */
  listActive(): EmergencySignal[] {
    const list = [...this.active.values()];
    list.sort((a, b) => {
      const pa = levelPriority(a.level);
      const pb = levelPriority(b.level);
      if (pa !== pb) return pb - pa;
      return b.timestamp - a.timestamp;
    });
    return list;
  }

  listResolved(): EmergencySignal[] {
    return [...this.resolved.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Критичные сигналы в радиусе.
   */
  nearbyCritical(
    lat: number,
    lon: number,
    radiusKm: number,
  ): EmergencySignal[] {
    return this.listActive().filter((s) => {
      if (s.level !== 'critical') return false;
      if (!s.coordinates) return false;
      return haversineKm(lat, lon, s.coordinates.latitude, s.coordinates.longitude) <= radiusKm;
    });
  }

  /**
   * GC устаревших сигналов.
   */
  pruneExpired(now: number = Date.now()): number {
    let removed = 0;
    for (const [id, sig] of this.active.entries()) {
      if (now - sig.timestamp > SIGNAL_TTL_MS) {
        this.active.delete(id);
        removed++;
      }
    }
    // Resolved тоже чистим через 7 дней
    const resolvedCutoff = now - 7 * 24 * 60 * 60 * 1000;
    for (const [id, sig] of this.resolved.entries()) {
      if (sig.timestamp < resolvedCutoff) {
        this.resolved.delete(id);
        removed++;
      }
    }
    return removed;
  }

  criticalCount(): number {
    let count = 0;
    for (const s of this.active.values()) {
      if (s.level === 'critical') count++;
    }
    return count;
  }

  get(id: MeshMessageId): EmergencySignal | null {
    return this.active.get(id) ?? this.resolved.get(id) ?? null;
  }
}

function levelPriority(level: EmergencyLevel): number {
  switch (level) {
    case 'critical': return 3;
    case 'urgent': return 2;
    case 'warning': return 1;
    case 'info': return 0;
  }
}

export function describeSignalType(type: SignalType): string {
  switch (type) {
    case 'medical': return 'Медицинская помощь';
    case 'fire': return 'Пожар';
    case 'earthquake': return 'Землетрясение';
    case 'flood': return 'Наводнение';
    case 'violence': return 'Насилие';
    case 'trapped': return 'Заблокирован';
    case 'need-help': return 'Нужна помощь';
    case 'safe': return 'В безопасности';
  }
}

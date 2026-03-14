/**
 * waitingMeter — счётчик стоимости ожидания пассажира.
 *
 * Паттерн из Uber/Яндекс Такси:
 *   - После прибытия водителя начинается FREE_WAITING_MINUTES бесплатного ожидания
 *   - По истечении: считается посекундно по OVERTIME_WAITING_PRICE_PER_MIN
 *   - Стоимость ожидания добавляется к финальному чеку
 *
 * Константы берутся из constants.ts (FREE_WAITING_MINUTES = 5, OVERTIME = 5 руб/мин).
 *
 * Использование:
 *   const meter = createWaitingMeter(orderId, arrivedAt);
 *   const { currentCharge, isChargeable, waitedMinutes } = meter.getState();
 *   meter.stop(); // вызвать при посадке/отмене
 *
 * State machine:
 *   [free period] ──freeMinutes elapsed──► [chargeable]
 *   [chargeable]  ──pickup confirmed──►   [stopped]
 */

import {
  FREE_WAITING_MINUTES,
  OVERTIME_WAITING_PRICE_PER_MIN,
} from "./constants";
import type { WaitingMeter } from "@/types/taxi";

export interface WaitingMeterState {
  currentCharge: number;
  isChargeable: boolean;
  waitedMinutes: number;
  freeSecondsLeft: number;
}

export interface WaitingMeterInstance {
  getState: () => WaitingMeterState;
  stop: () => void;
  subscribe: (cb: (state: WaitingMeterState) => void) => () => void;
}

/**
 * Создаёт и запускает счётчик ожидания.
 *
 * @param arrivedAt — ISO 8601 timestamp прибытия водителя
 * @returns WaitingMeterInstance — держи ссылку, вызови stop() при посадке
 */
export function createWaitingMeter(arrivedAt: string): WaitingMeterInstance {
  const arrivedMs = new Date(arrivedAt).getTime();
  const freeMs = FREE_WAITING_MINUTES * 60 * 1000;

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const subscribers = new Set<(state: WaitingMeterState) => void>();

  function computeState(): WaitingMeterState {
    const elapsed = Date.now() - arrivedMs;
    const freeSecondsLeft = Math.max(0, Math.ceil((freeMs - elapsed) / 1000));
    const isChargeable = elapsed > freeMs;
    const chargeableMs = isChargeable ? elapsed - freeMs : 0;
    const chargeableMin = chargeableMs / 60_000;
    const currentCharge = Math.round(chargeableMin * OVERTIME_WAITING_PRICE_PER_MIN);
    const waitedMinutes = Math.floor(elapsed / 60_000);

    return { currentCharge, isChargeable, waitedMinutes, freeSecondsLeft };
  }

  function notify() {
    const state = computeState();
    for (const cb of subscribers) {
      try { cb(state); } catch { /* ignore render errors */ }
    }
  }

  timer = setInterval(() => {
    if (stopped) { clearInterval(timer!); return; }
    notify();
  }, 1000);

  return {
    getState: computeState,

    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      subscribers.clear();
    },

    subscribe: (cb) => {
      subscribers.add(cb);
      // Emit current state immediately
      try { cb(computeState()); } catch { /**/ }
      return () => subscribers.delete(cb);
    },
  };
}

/**
 * Вычислить стоимость ожидания по уже записанным меткам времени.
 * Используется при завершении поездки для расчёта финального чека.
 */
export function calculateWaitingCharge(
  arrivedAt: string,
  tripStartedAt: string
): number {
  const arrived = new Date(arrivedAt).getTime();
  const started = new Date(tripStartedAt).getTime();
  const elapsed = Math.max(0, started - arrived);
  const freeMs = FREE_WAITING_MINUTES * 60 * 1000;

  if (elapsed <= freeMs) return 0;

  const chargeableMs = elapsed - freeMs;
  const chargeableMin = chargeableMs / 60_000;
  return Math.round(chargeableMin * OVERTIME_WAITING_PRICE_PER_MIN);
}

/**
 * Форматирует состояние счётчика для отображения в UI.
 */
export function formatWaitingMeter(state: WaitingMeterState): {
  label: string;
  color: string;
} {
  if (!state.isChargeable) {
    const mins = Math.floor(state.freeSecondsLeft / 60);
    const secs = state.freeSecondsLeft % 60;
    return {
      label: `Водитель ждёт бесплатно: ${mins}:${String(secs).padStart(2, "0")}`,
      color: "text-green-400",
    };
  }

  return {
    label: `Ожидание: +${state.currentCharge} ₽ (${state.waitedMinutes} мин)`,
    color: state.currentCharge > 50 ? "text-red-400" : "text-amber-400",
  };
}

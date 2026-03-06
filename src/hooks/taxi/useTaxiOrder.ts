import { useCallback, useReducer, useRef } from 'react';
import type {
  TaxiOrderState,
  TaxiAddress,
  TaxiOrder,
  VehicleClass,
  PaymentMethod,
  CancellationReason,
  TariffEstimate,
  PromoCode,
} from '@/types/taxi';
import {
  createOrder,
  searchDriver,
  cancelOrder as apiCancelOrder,
  updateOrderStatus,
  rateTrip,
  applyPromoCode,
  getTariffEstimates,
} from '@/lib/taxi/api';

// ─── Типы ──────────────────────────────────────────────────────────────────────
type Action =
  | { type: 'RESET' }
  | { type: 'SET_PICKUP'; payload: TaxiAddress }
  | { type: 'SET_DESTINATION'; payload: TaxiAddress }
  | { type: 'ADD_STOP'; payload: TaxiAddress }
  | { type: 'REMOVE_STOP'; payload: number }
  | { type: 'SET_TARIFF'; payload: VehicleClass }
  | { type: 'SET_PAYMENT_METHOD'; payload: PaymentMethod }
  | { type: 'SET_TARIFF_ESTIMATES'; payload: TariffEstimate[] }
  | { type: 'SET_PROMO'; payload: PromoCode | null }
  | { type: 'SET_STATUS'; payload: TaxiOrderState['status'] }
  | { type: 'SET_ORDER'; payload: TaxiOrder }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SELECTING_ROUTE' }
  | { type: 'SELECTING_TARIFF' };

interface State extends TaxiOrderState {
  isLoading: boolean;
  error: string | null;
}

// ─── Начальное состояние ──────────────────────────────────────────────────────
const initialState: State = {
  status: 'idle',
  order: null,
  pickup: null,
  destination: null,
  stops: [],
  selectedTariff: 'economy',
  tariffEstimates: [],
  paymentMethod: 'card',
  promoCode: null,
  isLoading: false,
  error: null,
};

// ─── Reducer — детерминированные переходы состояний ───────────────────────────
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return { ...initialState };

    case 'SET_PICKUP':
      return { ...state, pickup: action.payload, error: null };

    case 'SET_DESTINATION':
      return { ...state, destination: action.payload, error: null };

    case 'ADD_STOP':
      return { ...state, stops: [...state.stops, action.payload] };

    case 'REMOVE_STOP':
      return {
        ...state,
        stops: state.stops.filter((_, i) => i !== action.payload),
      };

    case 'SET_TARIFF':
      return { ...state, selectedTariff: action.payload };

    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.payload };

    case 'SET_TARIFF_ESTIMATES':
      return { ...state, tariffEstimates: action.payload };

    case 'SET_PROMO':
      return { ...state, promoCode: action.payload };

    case 'SET_STATUS':
      return { ...state, status: action.payload };

    case 'SET_ORDER':
      return {
        ...state,
        order: action.payload,
        status: action.payload.status,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SELECTING_ROUTE':
      return { ...state, status: 'selecting_route' };

    case 'SELECTING_TARIFF':
      return { ...state, status: 'selecting_tariff' };

    default:
      return state;
  }
}

// ─── Хук ──────────────────────────────────────────────────────────────────────
export function useTaxiOrder() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Ref для отмены поиска водителя (abort signal)
  const searchAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // ─── Установить точку подачи ─────────────────────────────────────────────
  const setPickup = useCallback((address: TaxiAddress) => {
    dispatch({ type: 'SET_PICKUP', payload: address });
  }, []);

  // ─── Установить назначение + рассчитать тарифы ───────────────────────────
  const setDestination = useCallback(
    async (address: TaxiAddress, currentPickup?: TaxiAddress) => {
      dispatch({ type: 'SET_DESTINATION', payload: address });

      const pickup = currentPickup ?? state.pickup;
      if (!pickup) return;

      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const estimates = await getTariffEstimates(
          pickup.coordinates,
          address.coordinates
        );
        dispatch({ type: 'SET_TARIFF_ESTIMATES', payload: estimates });
        dispatch({ type: 'SELECTING_TARIFF' });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Ошибка расчёта стоимости' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [state.pickup]
  );

  // ─── Добавить промежуточную остановку ────────────────────────────────────
  const addStop = useCallback((address: TaxiAddress) => {
    dispatch({ type: 'ADD_STOP', payload: address });
  }, []);

  // ─── Удалить промежуточную остановку ─────────────────────────────────────
  const removeStop = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_STOP', payload: index });
  }, []);

  // ─── Выбрать тариф ───────────────────────────────────────────────────────
  const selectTariff = useCallback((tariffId: VehicleClass) => {
    dispatch({ type: 'SET_TARIFF', payload: tariffId });
  }, []);

  // ─── Выбрать способ оплаты ───────────────────────────────────────────────
  const setPaymentMethod = useCallback((method: PaymentMethod) => {
    dispatch({ type: 'SET_PAYMENT_METHOD', payload: method });
  }, []);

  // ─── Применить промокод ──────────────────────────────────────────────────
  const applyPromo = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        dispatch({ type: 'SET_PROMO', payload: null });
        return;
      }

      const estimate = state.tariffEstimates.find(
        (e) => e.id === state.selectedTariff
      );
      const amount = estimate?.estimatedPrice ?? 0;

      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const promo = await applyPromoCode(code, amount);
        dispatch({ type: 'SET_PROMO', payload: promo });
        if (!promo.isValid) {
          dispatch({ type: 'SET_ERROR', payload: promo.description });
        }
      } catch {
        dispatch({ type: 'SET_ERROR', payload: 'Ошибка проверки промокода' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [state.tariffEstimates, state.selectedTariff]
  );

  // ─── Начать выбор маршрута ───────────────────────────────────────────────
  const startSelectingRoute = useCallback(() => {
    dispatch({ type: 'SELECTING_ROUTE' });
  }, []);

  // ─── Назад — к idle или к маршруту ───────────────────────────────────────
  const goBack = useCallback(() => {
    if (state.status === 'selecting_tariff') {
      dispatch({ type: 'SELECTING_ROUTE' });
    } else {
      dispatch({ type: 'RESET' });
    }
  }, [state.status]);

  // ─── Создать заказ и начать поиск водителя ───────────────────────────────
  const createAndSearchDriver = useCallback(async () => {
    if (!state.pickup || !state.destination || !state.selectedTariff) {
      dispatch({ type: 'SET_ERROR', payload: 'Укажите маршрут и выберите тариф' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_STATUS', payload: 'searching_driver' });

    // Сбросить прошлый abort-флаг
    searchAbortRef.current = { cancelled: false };
    const abortSignal = searchAbortRef.current;

    try {
      // Создаём заказ
      const order = await createOrder({
        pickup: state.pickup,
        destination: state.destination,
        stops: state.stops,
        tariffId: state.selectedTariff,
        paymentMethod: state.paymentMethod,
        promoCode: state.promoCode?.code,
      });

      if (abortSignal.cancelled) return;
      dispatch({ type: 'SET_ORDER', payload: order });

      // Ищем водителя
      const driver = await searchDriver(order.id);

      if (abortSignal.cancelled) return;

      const updatedOrder: TaxiOrder = {
        ...order,
        status: 'driver_found',
        driver,
      };
      dispatch({ type: 'SET_ORDER', payload: updatedOrder });

      // Через 3 секунды — статус «водитель едет»
      setTimeout(() => {
        if (!abortSignal.cancelled) {
          dispatch({
            type: 'SET_ORDER',
            payload: { ...updatedOrder, status: 'driver_arriving' },
          });
        }
      }, 3000);
    } catch (err) {
      if (!abortSignal.cancelled) {
        dispatch({ type: 'SET_ERROR', payload: 'Не удалось найти водителя. Попробуйте ещё раз.' });
        dispatch({ type: 'SET_STATUS', payload: 'selecting_tariff' });
      }
    } finally {
      if (!abortSignal.cancelled) {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  }, [
    state.pickup,
    state.destination,
    state.stops,
    state.selectedTariff,
    state.paymentMethod,
    state.promoCode,
  ]);

  // ─── Отменить заказ ──────────────────────────────────────────────────────
  const cancelOrder = useCallback(
    async (reason: CancellationReason = 'changed_plans') => {
      // Отменяем поиск водителя если он ещё идёт
      searchAbortRef.current.cancelled = true;

      if (state.order) {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
          await apiCancelOrder(state.order.id, reason);
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }

      dispatch({ type: 'RESET' });
    },
    [state.order]
  );

  // ─── Водитель прибыл — показываем PIN ────────────────────────────────────
  const driverArrived = useCallback(async () => {
    if (!state.order) return;

    const updated = await updateOrderStatus(state.order.id, 'driver_arrived');
    dispatch({ type: 'SET_ORDER', payload: updated });
  }, [state.order]);

  // ─── Подтверждение PIN — начало поездки ──────────────────────────────────
  const startTrip = useCallback(async (pinCode: string) => {
    if (!state.order) return false;

    if (pinCode !== state.order.pinCode) {
      dispatch({ type: 'SET_ERROR', payload: 'Неверный PIN-код' });
      return false;
    }

    const updated = await updateOrderStatus(state.order.id, 'in_trip');
    dispatch({ type: 'SET_ORDER', payload: updated });
    return true;
  }, [state.order]);

  // ─── Завершить поездку ───────────────────────────────────────────────────
  const completeTrip = useCallback(async () => {
    if (!state.order) return;

    const updated = await updateOrderStatus(state.order.id, 'completed');
    dispatch({ type: 'SET_ORDER', payload: { ...updated, status: 'rating' as const } });
    dispatch({ type: 'SET_STATUS', payload: 'rating' });
  }, [state.order]);

  // ─── Оценить поездку ─────────────────────────────────────────────────────
  const submitRating = useCallback(
    async (rating: number, tip: number, comment?: string) => {
      if (!state.order) return;

      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        await rateTrip(state.order.id, rating, tip, comment);
        dispatch({ type: 'RESET' });
      } catch {
        dispatch({ type: 'SET_ERROR', payload: 'Ошибка при отправке оценки' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    [state.order]
  );

  // ─── Пропустить оценку ───────────────────────────────────────────────────
  const skipRating = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // ─── Сбросить ошибку ─────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  // ─── Получить выбранную смету ─────────────────────────────────────────────
  const selectedEstimate = state.tariffEstimates.find(
    (e) => e.id === state.selectedTariff
  );

  return {
    // Состояние
    status: state.status,
    order: state.order,
    pickup: state.pickup,
    destination: state.destination,
    stops: state.stops,
    selectedTariff: state.selectedTariff,
    tariffEstimates: state.tariffEstimates,
    paymentMethod: state.paymentMethod,
    promoCode: state.promoCode,
    selectedEstimate,
    isLoading: state.isLoading,
    error: state.error,

    // Действия
    setPickup,
    setDestination,
    addStop,
    removeStop,
    selectTariff,
    setPaymentMethod,
    applyPromo,
    startSelectingRoute,
    goBack,
    createAndSearchDriver,
    cancelOrder,
    driverArrived,
    startTrip,
    completeTrip,
    submitRating,
    skipRating,
    clearError,
  };
}

export type UseTaxiOrderReturn = ReturnType<typeof useTaxiOrder>;

import type {
  TaxiAddress,
  TaxiOrder,
  Driver,
  TariffEstimate,
  PromoCode,
  AddressSuggestion,
  VehicleClass,
  PaymentMethod,
  CancellationReason,
  TripHistoryItem,
  FavoriteAddress,
} from '@/types/taxi';
import {
  TARIFFS,
  MOCK_ADDRESS_SUGGESTIONS,
  DEFAULT_MAP_CENTER,
  DEFAULT_FAVORITE_ADDRESSES,
} from './constants';
import { estimateAllTariffs, generateSurgeMultiplier, generateRoutePoints } from './calculations';
import { generatePinCode } from './formatters';
import { generateMockDriver, generateMockTripHistory } from './mock-drivers';

// ─── Вспомогательная функция: искусственная задержка ─────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Вспомогательная функция: случайный ID ────────────────────────────────────
function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Локальное хранилище для имитации persistent state ────────────────────────
const store: {
  activeOrders: Map<string, TaxiOrder>;
  history: TripHistoryItem[];
  favorites: FavoriteAddress[];
  paymentMethod: PaymentMethod;
  promoCodes: Map<string, PromoCode>;
} = {
  activeOrders: new Map(),
  history: generateMockTripHistory() as TripHistoryItem[],
  favorites: [...DEFAULT_FAVORITE_ADDRESSES],
  paymentMethod: 'card',
  promoCodes: new Map([
    [
      'WELCOME20',
      {
        code: 'WELCOME20',
        discount: 0,
        discountPercent: 20,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        minOrderAmount: 300,
        description: '20% скидка на первую поездку',
        isValid: true,
      },
    ],
    [
      'SAVE100',
      {
        code: 'SAVE100',
        discount: 100,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        minOrderAmount: 400,
        description: '100 ₽ скидка',
        isValid: true,
      },
    ],
  ]),
};

// ─── Поиск адресов с автодополнением ─────────────────────────────────────────
export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  await delay(200 + Math.random() * 200);

  if (!query.trim()) return [];

  const q = query.toLowerCase();
  return MOCK_ADDRESS_SUGGESTIONS.filter(
    (s) =>
      s.address.toLowerCase().includes(q) ||
      s.shortAddress.toLowerCase().includes(q)
  );
}

// ─── Избранные и недавние адреса ─────────────────────────────────────────────
export async function getFavoriteAddresses(): Promise<FavoriteAddress[]> {
  return store.favorites.filter((f) => !!f.address);
}

export async function saveFavoriteAddress(
  addressData: Pick<FavoriteAddress, 'type' | 'label' | 'address' | 'coordinates'>
): Promise<FavoriteAddress> {
  const existing = store.favorites.find((f) => f.type === addressData.type);
  const updated: FavoriteAddress = {
    id: existing?.id ?? generateId('fav'),
    icon: addressData.type === 'home' ? '🏠' : addressData.type === 'work' ? '💼' : '📍',
    ...addressData,
  };

  if (existing) {
    const idx = store.favorites.indexOf(existing);
    store.favorites[idx] = updated;
  } else {
    store.favorites.push(updated);
  }

  return updated;
}

export async function deleteFavoriteAddress(id: string): Promise<void> {
  const idx = store.favorites.findIndex((f) => f.id === id);
  if (idx !== -1) store.favorites.splice(idx, 1);
}

// ─── Расчёт стоимости по всем тарифам ────────────────────────────────────────
export async function getTariffEstimates(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<TariffEstimate[]> {
  await delay(400 + Math.random() * 300);

  // Применим случайные surge к некоторым тарифам
  const tariffs = TARIFFS.map((t) => ({
    ...t,
    surgeMultiplier: generateSurgeMultiplier(),
  }));

  return estimateAllTariffs(tariffs, from, to);
}

// ─── Создание заказа ──────────────────────────────────────────────────────────
export async function createOrder(params: {
  pickup: TaxiAddress;
  destination: TaxiAddress;
  stops?: TaxiAddress[];
  tariffId: VehicleClass;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}): Promise<TaxiOrder> {
  await delay(300);

  const tariff = TARIFFS.find((t) => t.id === params.tariffId);
  if (!tariff) throw new Error(`Тариф ${params.tariffId} не найден`);

  // Рассчитываем стоимость
  const [estimate] = await getTariffEstimates(
    params.pickup.coordinates,
    params.destination.coordinates
  );
  const selectedEstimate = (await getTariffEstimates(
    params.pickup.coordinates,
    params.destination.coordinates
  )).find((e) => e.id === params.tariffId) ?? estimate;

  // Применяем промокод
  let discount = 0;
  if (params.promoCode) {
    const promo = store.promoCodes.get(params.promoCode.toUpperCase());
    if (promo?.isValid) {
      if (promo.discountPercent) {
        discount = Math.round(selectedEstimate.estimatedPrice * promo.discountPercent / 100);
      } else if (promo.discount) {
        discount = promo.discount;
      }
    }
  }

  const order: TaxiOrder = {
    id: generateId('order'),
    status: 'searching_driver',
    pickup: params.pickup,
    destination: params.destination,
    stops: params.stops ?? [],
    tariff: {
      ...tariff,
      surgeMultiplier: selectedEstimate.surgeMultiplier,
    },
    estimatedPrice: Math.max(0, selectedEstimate.estimatedPrice - discount),
    estimatedDuration: selectedEstimate.estimatedDuration,
    estimatedDistance: selectedEstimate.estimatedDistance,
    paymentMethod: params.paymentMethod,
    createdAt: new Date().toISOString(),
    pinCode: generatePinCode(),
    promoCode: params.promoCode,
    discount: discount > 0 ? discount : undefined,
  };

  store.activeOrders.set(order.id, order);
  return order;
}

// ─── Поиск водителя ───────────────────────────────────────────────────────────
export async function searchDriver(orderId: string): Promise<Driver> {
  const order = store.activeOrders.get(orderId);
  if (!order) throw new Error(`Заказ ${orderId} не найден`);

  // Симуляция поиска: задержка 3–8 секунд
  const searchTime = 3000 + Math.random() * 5000;
  await delay(searchTime);

  // 5% шанс, что водителей нет → всё равно вернём водителя для MVP
  const driver = generateMockDriver(order.pickup.coordinates);

  // Обновляем заказ
  const updatedOrder: TaxiOrder = {
    ...order,
    status: 'driver_found',
    driver,
  };
  store.activeOrders.set(orderId, updatedOrder);

  return driver;
}

// ─── Получить активный заказ ──────────────────────────────────────────────────
export async function getActiveOrder(): Promise<TaxiOrder | null> {
  for (const order of store.activeOrders.values()) {
    if (!['completed', 'cancelled'].includes(order.status)) {
      return order;
    }
  }
  return null;
}

// ─── Получить заказ по ID ─────────────────────────────────────────────────────
export async function getOrderById(orderId: string): Promise<TaxiOrder | null> {
  return store.activeOrders.get(orderId) ?? null;
}

// ─── Обновить статус заказа ───────────────────────────────────────────────────
export async function updateOrderStatus(
  orderId: string,
  status: TaxiOrder['status']
): Promise<TaxiOrder> {
  const order = store.activeOrders.get(orderId);
  if (!order) throw new Error(`Заказ ${orderId} не найден`);

  const updated: TaxiOrder = { ...order, status };

  if (status === 'completed') {
    updated.completedAt = new Date().toISOString();
    updated.finalPrice = order.estimatedPrice;
    // Добавить в историю
    store.history.unshift(orderToHistoryItem(updated));
  }

  if (status === 'cancelled') {
    updated.cancelledAt = new Date().toISOString();
    store.activeOrders.delete(orderId);
    return updated;
  }

  store.activeOrders.set(orderId, updated);
  return updated;
}

// ─── Отмена заказа ────────────────────────────────────────────────────────────
export async function cancelOrder(
  orderId: string,
  reason: CancellationReason = 'changed_plans'
): Promise<void> {
  const order = store.activeOrders.get(orderId);
  if (!order) return;

  const cancelled: TaxiOrder = {
    ...order,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancellationReason: reason,
  };

  store.history.unshift(orderToHistoryItem(cancelled));
  store.activeOrders.delete(orderId);
}

// ─── Оценка поездки ───────────────────────────────────────────────────────────
export async function rateTrip(
  orderId: string,
  rating: number,
  tip: number,
  comment?: string
): Promise<void> {
  await delay(200);

  // Обновить в истории
  const historyItem = store.history.find((h) => h.id === orderId);
  if (historyItem) {
    historyItem.userRating = rating;
    historyItem.tip = tip;
  }

  // Удалить из active
  store.activeOrders.delete(orderId);
}

// ─── История поездок ──────────────────────────────────────────────────────────
export async function getOrderHistory(params?: {
  page?: number;
  limit?: number;
  status?: 'completed' | 'cancelled';
}): Promise<{ items: TripHistoryItem[]; total: number; hasMore: boolean }> {
  await delay(300);

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 10;
  const offset = (page - 1) * limit;

  let items = store.history;
  if (params?.status) {
    items = items.filter((i) => i.status === params.status);
  }

  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    hasMore: offset + limit < items.length,
  };
}

// ─── Применить промокод ───────────────────────────────────────────────────────
export async function applyPromoCode(
  code: string,
  orderAmount: number
): Promise<PromoCode> {
  await delay(400);

  const promo = store.promoCodes.get(code.toUpperCase());

  if (!promo) {
    return {
      code,
      discount: 0,
      validUntil: '',
      description: 'Промокод не найден',
      isValid: false,
    };
  }

  const isExpired = new Date(promo.validUntil) < new Date();
  const isBelowMinAmount = promo.minOrderAmount
    ? orderAmount < promo.minOrderAmount
    : false;

  if (isExpired || isBelowMinAmount) {
    return { ...promo, isValid: false };
  }

  return promo;
}

// ─── Позиция водителя (mock real-time) ───────────────────────────────────────
// Возвращает незначительно смещённую позицию от предыдущей для симуляции движения
const driverPositionCache = new Map<string, { lat: number; lng: number; step: number }>();

export async function getDriverLocation(
  driverId: string,
  targetLocation?: { lat: number; lng: number }
): Promise<{ lat: number; lng: number; heading: number; eta: number }> {
  const current = driverPositionCache.get(driverId) ?? {
    lat: DEFAULT_MAP_CENTER.lat + (Math.random() - 0.5) * 0.01,
    lng: DEFAULT_MAP_CENTER.lng + (Math.random() - 0.5) * 0.01,
    step: 0,
  };

  // Движение в сторону цели
  let newLat = current.lat;
  let newLng = current.lng;
  let heading = 0;

  if (targetLocation) {
    const progress = Math.min(current.step * 0.05, 0.95);
    newLat = current.lat + (targetLocation.lat - current.lat) * 0.1;
    newLng = current.lng + (targetLocation.lng - current.lng) * 0.1;
    heading = Math.atan2(
      targetLocation.lat - current.lat,
      targetLocation.lng - current.lng
    ) * (180 / Math.PI);

    driverPositionCache.set(driverId, {
      lat: newLat,
      lng: newLng,
      step: current.step + 1,
    });

    const remainingEta = Math.max(1, Math.round((1 - progress) * 8));
    return { lat: newLat, lng: newLng, heading, eta: remainingEta };
  }

  driverPositionCache.set(driverId, {
    lat: newLat + (Math.random() - 0.5) * 0.0005,
    lng: newLng + (Math.random() - 0.5) * 0.0005,
    step: current.step + 1,
  });

  return { lat: newLat, lng: newLng, heading: 0, eta: 5 };
}

// ─── Поделиться поездкой ──────────────────────────────────────────────────────
export async function shareTrip(orderId: string): Promise<string> {
  await delay(100);
  return `https://app.mansoni.ru/taxi/shared/${orderId}?t=${Date.now()}`;
}

// ─── SOS ─────────────────────────────────────────────────────────────────────
export async function sendSos(orderId: string): Promise<void> {
  await delay(500);
  console.warn(`[SOS] Экстренный сигнал отправлен для заказа: ${orderId}`);
  // В production: отправить уведомление в службу безопасности, сохранить геопозицию
}

// ─── Обновить способ оплаты ───────────────────────────────────────────────────
export async function updatePaymentMethod(method: PaymentMethod): Promise<void> {
  store.paymentMethod = method;
}

export async function getPaymentMethod(): Promise<PaymentMethod> {
  return store.paymentMethod;
}

// ─── Конвертация заказа в историю ─────────────────────────────────────────────
function orderToHistoryItem(order: TaxiOrder): TripHistoryItem {
  return {
    id: order.id,
    pickup: order.pickup,
    destination: order.destination!,
    tariff: order.tariff.id,
    tariffName: order.tariff.name,
    price: order.finalPrice ?? order.estimatedPrice,
    duration: order.estimatedDuration,
    distance: order.estimatedDistance,
    driver: order.driver
      ? {
          name: order.driver.name,
          photo: order.driver.photo,
          rating: order.driver.rating,
        }
      : { name: 'Неизвестно', rating: 0 },
    vehicle: order.driver
      ? {
          make: order.driver.car.make,
          model: order.driver.car.model,
          color: order.driver.car.color,
          plateNumber: order.driver.car.plateNumber,
        }
      : { make: '-', model: '-', color: '-', plateNumber: '-' },
    date: order.completedAt ?? order.cancelledAt ?? order.createdAt,
    status: order.status === 'completed' ? 'completed' : 'cancelled',
  };
}

// ─── Nearby drivers для главного экрана ──────────────────────────────────────
export async function getNearbyDrivers(
  location: { lat: number; lng: number },
  tariffId?: VehicleClass
): Promise<Array<{ id: string; location: { lat: number; lng: number }; tariff: VehicleClass }>> {
  await delay(100);

  const tariffs: VehicleClass[] = tariffId
    ? [tariffId]
    : ['economy', 'comfort', 'business', 'economy', 'economy'];

  return Array.from({ length: 8 }, (_, i) => ({
    id: `nearby_${i}`,
    location: {
      lat: location.lat + (Math.random() - 0.5) * 0.02,
      lng: location.lng + (Math.random() - 0.5) * 0.02,
    },
    tariff: tariffs[Math.floor(Math.random() * tariffs.length)],
  }));
}

// ─── Маршрут для карты ────────────────────────────────────────────────────────
export async function calculateRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<Array<{ lat: number; lng: number }>> {
  await delay(200);
  return generateRoutePoints(from, to, 30);
}

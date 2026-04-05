import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";
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
import { sleep } from '@/lib/utils/sleep';
import { toast } from 'sonner';

const delay = sleep;

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Локальное хранилище — только для функций без DB-таблицы ─────────────────
const store: {
  favorites: FavoriteAddress[];
  paymentMethod: PaymentMethod;
  promoCodes: Map<string, PromoCode>;
} = {
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

// ─── Преобразование строки DB → TaxiOrder ────────────────────────────────────
function rowToTaxiOrder(row: Record<string, unknown>): TaxiOrder {
  const tariffDef = TARIFFS.find((t) => t.id === (row.tariff as string)) ?? TARIFFS[0];
  const pickup: TaxiAddress = {
    id: `pickup_${row.id}`,
    address: (row.pickup_address as string) ?? '',
    coordinates: {
      lat: (row.pickup_lat as number) ?? 0,
      lng: (row.pickup_lng as number) ?? 0,
    },
  };
  const destination: TaxiAddress | undefined =
    row.destination_address
      ? {
          id: `dest_${row.id}`,
          address: (row.destination_address as string),
          coordinates: {
            lat: (row.destination_lat as number) ?? 0,
            lng: (row.destination_lng as number) ?? 0,
          },
        }
      : undefined;

  return {
    id: row.id as string,
    status: (row.status as TaxiOrder['status']) ?? 'searching_driver',
    pickup,
    destination,
    stops: [],
    tariff: { ...tariffDef, surgeMultiplier: 1.0 },
    estimatedPrice: (row.estimated_price as number) ?? 0,
    finalPrice: (row.final_price as number) ?? undefined,
    estimatedDuration: (row.estimated_duration as number) ?? 0,
    estimatedDistance: (row.estimated_distance as number) ?? 0,
    paymentMethod: (row.payment_method as PaymentMethod) ?? 'card',
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    completedAt: (row.completed_at as string) ?? undefined,
    cancelledAt: (row.cancelled_at as string) ?? undefined,
    cancellationReason: (row.cancellation_reason as CancellationReason) ?? undefined,
    pinCode: (row.pin_code as string) ?? '',
    promoCode: (row.promo_code as string) ?? undefined,
    discount: (row.discount as number) ?? undefined,
  };
}

// ─── Преобразование строки DB → TripHistoryItem ───────────────────────────────
function rowToHistoryItem(row: Record<string, unknown>): TripHistoryItem {
  const tariffId = (row.tariff as VehicleClass) ?? 'economy';
  const tariffDef = TARIFFS.find((t) => t.id === tariffId) ?? TARIFFS[0];
  return {
    id: row.id as string,
    pickup: {
      id: `pickup_${row.id}`,
      address: (row.pickup_address as string) ?? '',
      coordinates: {
        lat: (row.pickup_lat as number) ?? 0,
        lng: (row.pickup_lng as number) ?? 0,
      },
    },
    destination: {
      id: `dest_${row.id}`,
      address: (row.destination_address as string) ?? '',
      coordinates: {
        lat: (row.destination_lat as number) ?? 0,
        lng: (row.destination_lng as number) ?? 0,
      },
    },
    tariff: tariffId,
    tariffName: tariffDef.name,
    price: (row.final_price as number) ?? (row.estimated_price as number) ?? 0,
    duration: (row.estimated_duration as number) ?? 0,
    distance: (row.estimated_distance as number) ?? 0,
    driver: { name: 'Водитель', rating: 5 },
    vehicle: { make: '-', model: '-', color: '-', plateNumber: '-' },
    date: (row.completed_at as string) ?? (row.cancelled_at as string) ?? (row.created_at as string) ?? '',
    status: (row.status as string) === 'completed' ? 'completed' : 'cancelled',
  };
}

// ─── Получить текущего пользователя ──────────────────────────────────────────
async function getUid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Пользователь не авторизован');
  return user.id;
}

// ─── Поиск адресов — DaData (ФИАС) с fallback на mock ───────────────────────
export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  if (!query.trim()) return [];

  // Try DaData first
  try {
    const { suggestAddress } = await import('@/lib/navigation/dadata');
    const results = await suggestAddress(query, 8);
    if (results.length > 0) {
      return results
        .filter((r) => r.geoLat != null && r.geoLon != null)
        .map((r, i) => ({
          id: r.fiasId ?? `dadata-${i}`,
          address: r.value,
          shortAddress: r.value.split(',')[0],
          coordinates: { lat: r.geoLat!, lng: r.geoLon! },
          type: 'address' as const,
        }));
    }
  } catch {
    // fallback below
  }

  // Fallback to mock
  await delay(200 + Math.random() * 200);
  const q = query.toLowerCase();
  return MOCK_ADDRESS_SUGGESTIONS.filter(
    (s) =>
      s.address.toLowerCase().includes(q) ||
      s.shortAddress.toLowerCase().includes(q)
  );
}

// ─── Избранные адреса (локально — нет таблицы в DB) ──────────────────────────
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

// ─── Расчёт стоимости (mock) ──────────────────────────────────────────────────
export async function getTariffEstimates(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<TariffEstimate[]> {
  await delay(400 + Math.random() * 300);
  const tariffs = TARIFFS.map((t) => ({
    ...t,
    surgeMultiplier: generateSurgeMultiplier(),
  }));
  return estimateAllTariffs(tariffs, from, to);
}

// ─── Создание заказа (Supabase) ───────────────────────────────────────────────
export async function createOrder(params: {
  pickup: TaxiAddress;
  destination: TaxiAddress;
  stops?: TaxiAddress[];
  tariffId: VehicleClass;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}): Promise<TaxiOrder> {
  const userId = await getUid();
  const tariff = TARIFFS.find((t) => t.id === params.tariffId);
  if (!tariff) throw new Error(`Тариф ${params.tariffId} не найден`);

  const estimates = await getTariffEstimates(
    params.pickup.coordinates,
    params.destination.coordinates
  );
  const selectedEstimate = estimates.find((e) => e.id === params.tariffId) ?? estimates[0];

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

  const pinCode = generatePinCode();

  const { data: rideData, error } = await dbLoose
    .from('taxi_rides')
    .insert({
      passenger_id: userId,
      status: 'searching_driver',
      pickup_address: params.pickup.address,
      pickup_lat: params.pickup.coordinates.lat,
      pickup_lng: params.pickup.coordinates.lng,
      destination_address: params.destination.address,
      destination_lat: params.destination.coordinates.lat,
      destination_lng: params.destination.coordinates.lng,
      tariff: params.tariffId,
      payment_method: params.paymentMethod,
      estimated_price: Math.max(0, selectedEstimate.estimatedPrice - discount),
      estimated_distance: selectedEstimate.estimatedDistance,
      estimated_duration: selectedEstimate.estimatedDuration,
      pin_code: pinCode,
      promo_code: params.promoCode ?? null,
      discount: discount > 0 ? discount : null,
    })
    .select()
    .single();

  const ride = rideData as Record<string, unknown> | null;

  if (error || !ride) {
    logger.error('[taxi] createOrder failed', error);
    throw new Error(error?.message ?? 'Не удалось создать заказ');
  }

  // Запускаем поиск водителя через Edge Function (не ждём — фоновый вызов)
  supabase.functions
    .invoke('taxi-dispatch', {
      body: {
        order_id: ride.id,
        pickup_lat: params.pickup.coordinates.lat,
        pickup_lng: params.pickup.coordinates.lng,
        tariff: params.tariffId,
      },
    })
    .catch((err) => logger.warn('[taxi] dispatch invoke error', err));

  return rowToTaxiOrder(ride as Record<string, unknown>);
}

// ─── Поиск водителя (ожидаем назначение через taxi-dispatch) ─────────────────
export async function searchDriver(orderId: string): Promise<Driver | null> {
  const order = await getOrderById(orderId);
  if (order?.driver) return order.driver;

  // Polling с интервалом 2с, макс ~10 сек
  for (let i = 0; i < 5; i++) {
    await delay(2000);
    const current = await getOrderById(orderId);
    if (current?.driver) return current.driver;
  }

  return null;
}

// ─── Получить активный заказ (Supabase) ──────────────────────────────────────
export async function getActiveOrder(): Promise<TaxiOrder | null> {
  const userId = await getUid().catch(() => null);
  if (!userId) return null;

  const { data, error } = await dbLoose
    .from('taxi_rides')
    .select('*')
    .eq('passenger_id', userId)
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('[taxi] getActiveOrder failed', error);
    return null;
  }
  return data ? rowToTaxiOrder(data as Record<string, unknown>) : null;
}

// ─── Получить заказ по ID (Supabase) ─────────────────────────────────────────
export async function getOrderById(orderId: string): Promise<TaxiOrder | null> {
  const userId = await getUid().catch(() => null);
  if (!userId) return null;

  const { data, error } = await dbLoose
    .from('taxi_rides')
    .select('*')
    .eq('id', orderId)
    .eq('passenger_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('[taxi] getOrderById failed', error);
    return null;
  }
  return data ? rowToTaxiOrder(data as Record<string, unknown>) : null;
}

// ─── Обновить статус заказа (Supabase) ───────────────────────────────────────
export async function updateOrderStatus(
  orderId: string,
  status: TaxiOrder['status']
): Promise<TaxiOrder> {
  const updates: Record<string, unknown> = { status };
  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await dbLoose
    .from('taxi_rides')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();

  if (error || !data) {
    logger.error('[taxi] updateOrderStatus failed', error);
    throw new Error(error?.message ?? 'Не удалось обновить статус заказа');
  }
  return rowToTaxiOrder(data as Record<string, unknown>);
}

// ─── Отмена заказа (Supabase) ─────────────────────────────────────────────────
export async function cancelOrder(
  orderId: string,
  reason: CancellationReason = 'changed_plans'
): Promise<void> {
  const { error } = await dbLoose
    .from('taxi_rides')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'passenger',
    })
    .eq('id', orderId);

  if (error) {
    logger.error('[taxi] cancelOrder failed', error);
  }
}

// ─── Оценка поездки (Supabase) ────────────────────────────────────────────────
export async function rateTrip(
  orderId: string,
  rating: number,
  tip: number,
  comment?: string
): Promise<void> {
  const userId = await getUid().catch(() => null);
  if (!userId) return;

  const { error: ratingError } = await dbLoose
    .from('taxi_ratings')
    .insert({
      ride_id: orderId,
      rater_id: userId,
      ratee_id: userId, // будет заменён на driver user_id при наличии
      rater_role: 'passenger',
      rating,
      comment: comment ?? null,
    });

  if (ratingError) {
    logger.warn('[taxi] rateTrip insert failed', ratingError);
  }

  // Если есть чаевые — добавить к final_price
  if (tip > 0) {
    const { data: ride } = await dbLoose
      .from('taxi_rides')
      .select('final_price')
      .eq('id', orderId)
      .single();

    const currentPrice = (ride as Record<string, unknown> | null)?.final_price as number | null;
    if (currentPrice != null) {
      await dbLoose
        .from('taxi_rides')
        .update({ final_price: currentPrice + tip })
        .eq('id', orderId);
    }
  }
}

// ─── История поездок (Supabase) ───────────────────────────────────────────────
export async function getOrderHistory(params?: {
  page?: number;
  limit?: number;
  status?: 'completed' | 'cancelled';
}): Promise<{ items: TripHistoryItem[]; total: number; hasMore: boolean }> {
  const userId = await getUid().catch(() => null);
  if (!userId) {
    return { items: [], total: 0, hasMore: false };
  }

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 10;
  const offset = (page - 1) * limit;

  let query = dbLoose
    .from('taxi_rides')
    .select('*', { count: 'exact' })
    .eq('passenger_id', userId)
    .in('status', params?.status ? [params.status] : ['completed', 'cancelled'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    logger.error('[taxi] getOrderHistory failed', error);
    return { items: [], total: 0, hasMore: false };
  }

  const total = count ?? 0;
  const items = (data ?? []).map((row) => rowToHistoryItem(row as Record<string, unknown>));
  return { items, total, hasMore: offset + limit < total };
}

// ─── Применить промокод (локально) ───────────────────────────────────────────
export async function applyPromoCode(
  code: string,
  orderAmount: number
): Promise<PromoCode> {
  await delay(400);
  const promo = store.promoCodes.get(code.toUpperCase());
  if (!promo) {
    return { code, discount: 0, validUntil: '', description: 'Промокод не найден', isValid: false };
  }
  const isExpired = new Date(promo.validUntil) < new Date();
  const isBelowMinAmount = promo.minOrderAmount ? orderAmount < promo.minOrderAmount : false;
  if (isExpired || isBelowMinAmount) return { ...promo, isValid: false };
  return promo;
}

// ─── Позиция водителя (mock real-time) ───────────────────────────────────────
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
    driverPositionCache.set(driverId, { lat: newLat, lng: newLng, step: current.step + 1 });
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
export async function shareTrip(orderId: string): Promise<string | null> {
  // share_token пока не поддерживается в схеме
  toast.info('Шеринг поездки в разработке');
  logger.debug('[taxi] shareTrip — таблица не поддерживает share_token', { orderId });
  return null;
}

// ─── SOS ──────────────────────────────────────────────────────────────────────
export async function sendSos(orderId: string): Promise<void> {
  logger.warn(`[SOS] Экстренный сигнал для заказа: ${orderId}`);

  const { error } = await dbLoose
    .from('taxi_rides')
    .update({ status: 'cancelled', cancellation_reason: 'other', cancelled_by: 'system', cancelled_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    logger.error('[taxi] sendSos update failed', error);
    toast.error('Не удалось отправить SOS, позвоните 112');
    return;
  }
  toast.error('SOS — поездка экстренно завершена, обратитесь в поддержку');
}

// ─── Способ оплаты (локально) ─────────────────────────────────────────────────
export async function updatePaymentMethod(method: PaymentMethod): Promise<void> {
  store.paymentMethod = method;
}

export async function getPaymentMethod(): Promise<PaymentMethod> {
  return store.paymentMethod;
}

// ─── Nearby drivers (из БД taxi_driver_locations + taxi_drivers) ─────────────
export async function getNearbyDrivers(
  _location: { lat: number; lng: number },
  _tariffId?: VehicleClass
): Promise<Array<{ id: string; location: { lat: number; lng: number }; tariff: VehicleClass }>> {
  const { data, error } = await dbLoose
    .from('taxi_driver_locations')
    .select('driver_id, lat, lng')
    .limit(20);

  if (error || !data) {
    logger.warn('[taxi] getNearbyDrivers failed', error);
    return [];
  }

  const rows = data as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.driver_id as string,
    location: { lat: r.lat as number, lng: r.lng as number },
    tariff: 'economy' as VehicleClass,
  }));
}

// ─── Маршрут для карты (интерполяция, до интеграции с OSRM) ──────────────────
export async function calculateRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<Array<{ lat: number; lng: number }>> {
  return generateRoutePoints(from, to, 30);
}

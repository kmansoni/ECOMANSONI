// === Статусы заказа — жизненный цикл поездки ===
export type OrderStatus =
  | 'idle'               // нет активного заказа
  | 'selecting_route'    // пользователь вводит маршрут
  | 'selecting_tariff'   // выбор тарифа
  | 'searching_driver'   // поиск водителя
  | 'driver_found'       // водитель найден, ожидает подтверждения
  | 'driver_arriving'    // водитель едет к пассажиру
  | 'driver_arrived'     // водитель прибыл
  | 'in_trip'            // поездка активна
  | 'completed'          // поездка завершена
  | 'cancelled'          // отменена
  | 'rating';            // экран оценки

// === Класс автомобиля ===
export type VehicleClass =
  | 'economy'
  | 'comfort'
  | 'business'
  | 'minivan'
  | 'premium'
  | 'kids'
  | 'green';

// === Способ оплаты ===
export type PaymentMethod =
  | 'card'
  | 'cash'
  | 'apple_pay'
  | 'google_pay'
  | 'corporate';

// === Причина отмены ===
export type CancellationReason =
  | 'long_wait'
  | 'wrong_car'
  | 'changed_plans'
  | 'driver_not_responding'
  | 'found_another'
  | 'other';

// === Координата ===
export interface LatLng {
  lat: number;
  lng: number;
}

// === Адрес ===
export interface TaxiAddress {
  id: string;
  label?: string;           // дом, работа, custom
  address: string;          // текстовый адрес для отображения
  shortAddress?: string;    // краткое название — название улицы
  coordinates: LatLng;
  isFavorite?: boolean;
}

// === Тариф ===
export interface Tariff {
  id: VehicleClass;
  name: string;
  description: string;
  emoji: string;
  capacity: number;       // макс. пассажиров
  basePrice: number;      // базовая посадка, руб
  pricePerKm: number;     // цена за км, руб
  pricePerMin: number;    // цена за минуту, руб
  minPrice: number;       // минимальная цена, руб
  eta: number;            // расчётное время подачи, минут
  surgeMultiplier: number; // множитель surge (1.0 = нет surge)
  available: boolean;
  features: string[];     // особенности — кондиционер, детское кресло
  badge?: string;         // бейдж — Популярный, Эко
}

// === Тарифная оценка ===
export interface TariffEstimate extends Tariff {
  estimatedPrice: number;    // расчётная стоимость
  estimatedDuration: number; // расчётное время поездки, минут
  estimatedDistance: number; // расчётное расстояние, км
}

// === Автомобиль ===
export interface Vehicle {
  make: string;           // марка
  model: string;          // модель
  color: string;          // цвет
  plateNumber: string;    // номер (маскированный для безопасности)
  year: number;
  class: VehicleClass;
  photo?: string;
}

// === Водитель ===
export interface Driver {
  id: string;
  name: string;
  photo?: string;
  rating: number;
  tripsCount: number;
  yearsOnPlatform: number;
  car: Vehicle;
  phone: string;          // маскированный — +7 *** ***-**-34
  location: LatLng;
  eta: number;            // ETA до пассажира, минут
  comment?: string;       // комментарий водителя
}

// === Заказ ===
export interface TaxiOrder {
  id: string;
  status: OrderStatus;
  pickup: TaxiAddress;
  destination?: TaxiAddress;
  stops: TaxiAddress[];   // промежуточные точки
  tariff: Tariff;
  estimatedPrice: number;
  finalPrice?: number;
  estimatedDuration: number; // минут
  estimatedDistance: number; // км
  driver?: Driver;
  paymentMethod: PaymentMethod;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: CancellationReason;
  rating?: number;
  tip?: number;
  comment?: string;
  pinCode: string;         // 4-значный PIN для подтверждения посадки
  tripPolyline?: LatLng[]; // маршрут на карте
  promoCode?: string;
  discount?: number;
}

// === Поездка в истории ===
export interface TripHistoryItem {
  id: string;
  pickup: TaxiAddress;
  destination: TaxiAddress;
  tariff: VehicleClass;
  tariffName: string;
  price: number;
  duration: number;       // минут
  distance: number;       // км
  driver: {
    name: string;
    photo?: string;
    rating: number;
  };
  vehicle: {
    make: string;
    model: string;
    color: string;
    plateNumber: string;
  };
  userRating?: number;
  tip?: number;
  date: string;
  status: 'completed' | 'cancelled';
}

// === Избранный адрес ===
export interface FavoriteAddress {
  id: string;
  type: 'home' | 'work' | 'custom';
  label: string;
  address: string;
  coordinates: LatLng;
  icon: string;
}

// === Промокод ===
export interface PromoCode {
  code: string;
  discount: number;         // абсолютная скидка, руб
  discountPercent?: number; // процентная скидка
  validUntil: string;
  minOrderAmount?: number;
  description: string;
  isValid: boolean;
}

// === Состояние поиска адреса ===
export interface AddressSuggestion {
  id: string;
  address: string;
  shortAddress: string;
  coordinates: LatLng;
  type: 'address' | 'place' | 'favorite';
  icon?: string;
}

// === Состояние текущего заказа ===
export interface TaxiOrderState {
  status: OrderStatus;
  order: TaxiOrder | null;
  pickup: TaxiAddress | null;
  destination: TaxiAddress | null;
  stops: TaxiAddress[];
  selectedTariff: VehicleClass | null;
  tariffEstimates: TariffEstimate[];
  paymentMethod: PaymentMethod;
  promoCode: PromoCode | null;
}

// === Конфигурация карты зоны surge ===
export interface SurgeZone {
  id: string;
  center: LatLng;
  radiusKm: number;
  multiplier: number;
  label: string;
}

// === Статус водителя ===
export type DriverStatus =
  | 'offline'       // не работает
  | 'available'     // онлайн, ждёт заказа
  | 'busy'          // везёт пассажира
  | 'arriving'      // едет к пассажиру
  | 'on_break';     // перерыв

// === Профиль водителя (расширяет Driver) ===
export interface DriverProfile {
  userId: string;       // Supabase auth.uid()
  driverId: string;
  name: string;
  phone: string;
  photo?: string;
  rating: number;
  tripsCount: number;
  acceptanceRate: number; // % принятых заказов
  yearsOnPlatform: number;
  car: Vehicle;
  status: DriverStatus;
  currentLocation?: LatLng;
  /** Баланс заработка за текущий сдвиг, руб */
  shiftEarnings: number;
  /** Заказов на текущем сдвиге */
  shiftTrips: number;
  onlineAt?: string;      // ISO 8601 — когда вышел онлайн
}

// === Входящий запрос заказа для водителя ===
export interface IncomingOrderRequest {
  orderId: string;
  passengerName: string;
  passengerRating: number;
  pickup: TaxiAddress;
  destination: TaxiAddress;
  estimatedPrice: number;
  estimatedDistance: number;
  estimatedDuration: number;
  tariff: VehicleClass;
  paymentMethod: PaymentMethod;
  /** Секунды на принятие до auto-expire */
  timeoutSeconds: number;
  /** Расстояние от водителя до точки подачи, км */
  distanceToPickup: number;
  createdAt: string;
  /** Пассажир вводит PIN для подтверждения посадки */
  pinCode: string;
}

// === Счётчик ожидания ===
export interface WaitingMeter {
  orderId: string;
  arrivedAt: string;    // ISO 8601 — время прибытия водителя
  freeMinutes: number;  // бесплатное ожидание (FREE_WAITING_MINUTES)
  ratePerMin: number;   // стоимость ожидания сверх лимита, руб/мин
  /** Текущая сумма за ожидание, руб */
  currentCharge: number;
  /** Идёт ли платное ожидание */
  isChargeable: boolean;
}

// === Предзаказ (scheduled ride) ===
export interface ScheduledRide {
  id: string;
  pickup: TaxiAddress;
  destination: TaxiAddress;
  tariff: VehicleClass;
  paymentMethod: PaymentMethod;
  scheduledAt: string;  // ISO 8601 — время подачи
  createdAt: string;
  status: 'pending' | 'assigned' | 'cancelled';
  driver?: Driver;
  estimatedPrice: number;
}

// === Оценка от водителя (bidirectional rating) ===
export interface DriverRating {
  orderId: string;
  driverId: string;
  passengerId: string;
  rating: number;       // 1–5
  comment?: string;
  createdAt: string;
}

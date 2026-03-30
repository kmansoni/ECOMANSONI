import type { OrderStatus, VehicleClass, PaymentMethod } from '@/types/taxi';
export { formatRating } from '@/lib/formatters/rating';

/**
 * Форматирует цену поездки
 */
export function formatTripPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(price)) + ' ₽';
}

/**
 * Форматирует расстояние
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} м`;
  }
  return `${km.toFixed(1)} км`;
}

/**
 * Форматирует время ETA
 */
export function formatEta(minutes: number): string {
  if (minutes < 1) return 'меньше минуты';
  if (minutes === 1) return '1 мин';
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}

/**
 * Возвращает читаемый статус заказа
 */
export function formatOrderStatus(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    idle: 'Нет заказа',
    selecting_route: 'Выбор маршрута',
    selecting_tariff: 'Выбор тарифа',
    searching_driver: 'Поиск водителя',
    driver_found: 'Водитель найден',
    driver_arriving: 'Водитель едет',
    driver_arrived: 'Водитель на месте',
    in_trip: 'В поездке',
    completed: 'Завершена',
    cancelled: 'Отменена',
    rating: 'Оцените поездку',
  };
  return labels[status] || status;
}

/**
 * Возвращает класс авто в читаемом виде
 */
export function formatVehicleClass(cls: VehicleClass): string {
  const labels: Record<VehicleClass, string> = {
    economy: 'Эконом',
    comfort: 'Комфорт',
    business: 'Бизнес',
    minivan: 'Минивэн',
    premium: 'Премиум',
    kids: 'Детский',
    green: 'Эко',
  };
  return labels[cls] || cls;
}

/**
 * Возвращает способ оплаты в читаемом виде
 */
export function formatPaymentMethod(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    card: '💳 Карта',
    cash: '💵 Наличные',
    apple_pay: '🍎 Apple Pay',
    google_pay: '🌐 Google Pay',
    corporate: '🏢 Корпоративный',
  };
  return labels[method] || method;
}

/**
 * Форматирует дату поездки
 */
export function formatTripDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Вчера, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return date.toLocaleDateString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматирует номерной знак — первый/последний символы видны
 */
export function maskPlateNumber(plate: string): string {
  if (plate.length <= 2) return plate;
  return plate.slice(0, 1) + '*'.repeat(plate.length - 2) + plate.slice(-1);
}

/**
 * Маскирует номер телефона водителя
 */
export function maskPhoneNumber(phone: string): string {
  // +7 (999) 999-99-99 → +7 (***) ***-**-99
  return phone.replace(/(\+7\s?\(?)(\d{3})(\)?[\s-]?)(\d{3})([\s-]?\d{2})([\s-]?)(\d{2})/, (_, p1, p2, p3, p4, p5, p6, p7) => {
    return `${p1}***${p3}***${p6}${p7}`;
  });
}

/**
 * Форматирует surge-мультипликатор
 */
export function formatSurge(multiplier: number): string {
  if (multiplier <= 1.0) return '';
  return `×${multiplier.toFixed(1)}`;
}

/**
 * Генерирует 4-значный PIN-код
 */
export function generatePinCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

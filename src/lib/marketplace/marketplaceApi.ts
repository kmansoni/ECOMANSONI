import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';

// =============================================================================
// MARKETPLACE CONNECTIONS — привязка аккаунтов Ozon, WB, Amazon
// =============================================================================

export interface MarketplaceConnection {
  id: string;
  user_id: string;
  marketplace_type: 'ozon' | 'wildberries' | 'amazon' | 'yandex';
  seller_id: string;
  seller_name: string;
  api_key: string;
  api_url?: string;
  is_active: boolean;
  sync_enabled: boolean;
  last_sync_at?: string;
  sync_status: 'idle' | 'syncing' | 'error' | 'success';
  settings: {
    timezone?: string;
    currency?: string;
    auto_price_sync?: boolean;
    auto_stock_sync?: boolean;
    fbo_mode?: boolean; // отгрузка со склада маркетплейса
    fbs_mode?: boolean; // отгрузка со своего склада
  };
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  marketplace_type: MarketplaceConnection['marketplace_type'];
  seller_id: string;
  seller_name: string;
  api_key: string;
  api_url?: string;
  settings?: MarketplaceConnection['settings'];
}

export async function getMarketplaceConnections(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  if (!targetUserId) return [];

  const { data, error } = await dbLoose
    .from('marketplace_connections')
    .select('*')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[Marketplace] Ошибка загрузки подключений', { error });
    toast.error('Ошибка загрузки подключений к маркетплейсам');
    return [];
  }
  return data || [];
}

export async function createMarketplaceConnection(input: CreateConnectionInput) {
  const { user } = useAuth();
  if (!user) {
    toast.error('Необходимо авторизоваться');
    return null;
  }

  const { data, error } = await dbLoose
    .from('marketplace_connections')
    .insert({
      user_id: user.id,
      marketplace_type: input.marketplace_type,
      seller_id: input.seller_id,
      seller_name: input.seller_name,
      api_key: input.api_key,
      api_url: input.api_url,
      settings: input.settings || {},
      is_active: true,
      sync_enabled: true,
      sync_status: 'idle',
    })
    .select()
    .single();

  if (error) {
    logger.error('[Marketplace] Ошибка создания подключения', { error });
    toast.error('Ошибка создания подключения');
    return null;
  }

  toast.success(`${input.marketplace_type === 'ozon' ? 'Ozon' : input.marketplace_type === 'wildberries' ? 'Wildberries' : 'Amazon'} подключён`);
  return data;
}

export async function updateConnectionStatus(id: string, status: Partial<MarketplaceConnection>) {
  const { error } = await dbLoose
    .from('marketplace_connections')
    .update(status)
    .eq('id', id);

  if (error) {
    logger.error('[Marketplace] Ошибка обновления статуса', { error });
    return false;
  }
  return true;
}

// =============================================================================
// MARKETPLACE PRODUCTS — товары на маркетплейсах
// =============================================================================

export interface MarketplaceProduct {
  id: string;
  connection_id: string;
  shop_product_id?: string; // ссылка на внутренний товар
  marketplace_sku: string;
  marketplace_product_id?: string; // ID товара на маркетплейсе
  title: string;
  description?: string;
  price: number;
  old_price?: number;
  currency: string;
  barcode?: string;
  images: string[];
  category_id?: string;
  category_path?: string;
  attributes?: Record<string, any>;
  vat?: number;
  weight_kg?: number;
  dimensions?: { length: number; width: number; height: number };
  status: 'draft' | 'active' | 'inactive' | 'blocked' | 'deleted';
  stock_sync: boolean;
  price_sync: boolean;
  last_sync_at?: string;
  sync_status: 'idle' | 'syncing' | 'error' | 'success';
  created_at: string;
  updated_at: string;
}

export interface CreateMarketplaceProductInput {
  connection_id: string;
  shop_product_id?: string;
  marketplace_sku: string;
  title: string;
  description?: string;
  price: number;
  old_price?: number;
  currency?: string;
  barcode?: string;
  images: string[];
  category_id?: string;
  attributes?: Record<string, any>;
  vat?: number;
  weight_kg?: number;
  dimensions?: { length: number; width: number; height: number };
}

export async function getMarketplaceProducts(connectionId?: string) {
  const { user } = useAuth();
  if (!user) return [];

  let query = dbLoose
    .from('marketplace_products')
    .select('*')
    .order('created_at', { ascending: false });

  if (connectionId) {
    query = query.eq('connection_id', connectionId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[Marketplace] Ошибка загрузки товаров', { error });
    toast.error('Ошибка загрузки товаров');
    return [];
  }
  return data || [];
}

export async function createMarketplaceProduct(input: CreateMarketplaceProductInput) {
  const { user } = useAuth();
  if (!user) {
    toast.error('Необходимо авторизоваться');
    return null;
  }

  const { data, error } = await dbLoose
    .from('marketplace_products')
    .insert({
      connection_id: input.connection_id,
      shop_product_id: input.shop_product_id,
      marketplace_sku: input.marketplace_sku,
      title: input.title,
      description: input.description,
      price: input.price,
      old_price: input.old_price,
      currency: input.currency || 'RUB',
      barcode: input.barcode,
      images: input.images,
      category_id: input.category_id,
      attributes: input.attributes || {},
      vat: input.vat || 20,
      weight_kg: input.weight_kg,
      dimensions: input.dimensions,
      status: 'draft',
      stock_sync: true,
      price_sync: true,
      sync_status: 'idle',
    })
    .select()
    .single();

  if (error) {
    logger.error('[Marketplace] Ошибка создания товара', { error });
    toast.error('Ошибка создания товара на маркетплейсе');
    return null;
  }

  toast.success('Товар добавлен на маркетплейс');
  return data;
}

export async function updateMarketplaceProduct(id: string, updates: Partial<MarketplaceProduct>) {
  const { data, error } = await dbLoose
    .from('marketplace_products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('[Marketplace] Ошибка обновления товара', { error });
    toast.error('Ошибка обновления товара');
    return null;
  }
  return data;
}

// Получить один товар по id
export async function getMarketplaceProductById(id: string) {
  const { data, error } = await dbLoose
    .from('marketplace_products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    logger.error('[Marketplace] Ошибка загрузки товара', { error });
    toast.error('Товар не найден');
    return null;
  }
  return data as MarketplaceProduct | null;
}

// =============================================================================
// MARKETPLACE ORDERS — заказы с маркетплейсов
// =============================================================================

export interface MarketplaceOrder {
  id: string;
  connection_id: string;
  marketplace_order_id: string;
  marketplace: 'ozon' | 'wildberries' | 'amazon';
  shop_order_id?: string; // ссылка на внутренний заказ
  status: 'pending' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
  order_items: {
    sku: string;
    name: string;
    quantity: number;
    price: number;
    currency: string;
  }[];
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  delivery_address: {
    full_name: string;
    city: string;
    street: string;
    building: string;
    apartment?: string;
    postal_code: string;
    country: string;
  };
  delivery_method: 'courier' | 'pickup' | 'post';
  delivery_cost: number;
  items_total: number;
  total_amount: number;
  currency: string;
  payment_method: 'card' | 'cash' | 'prepaid';
  payment_status: 'pending' | 'paid' | 'partially_paid' | 'refunded';
  ordered_at: string;
  delivered_at?: string;
  tracking_number?: string;
  tracking_url?: string;
  notes?: string;
  requires_pvz: boolean;
  pvz_code?: string;
  sync_status: 'idle' | 'syncing' | 'error' | 'success';
  created_at: string;
  updated_at: string;
}

export async function getMarketplaceOrders(connectionId?: string) {
  const { user } = useAuth();
  if (!user) return [];

  let query = dbLoose
    .from('marketplace_orders')
    .select('*')
    .order('ordered_at', { ascending: false });

  if (connectionId) {
    query = query.eq('connection_id', connectionId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[Marketplace] Ошибка загрузки заказов', { error });
    toast.error('Ошибка загрузки заказов');
    return [];
  }
  return data || [];
}

export async function updateMarketplaceOrderStatus(orderId: string, status: MarketplaceOrder['status']) {
  const { error } = await dbLoose
    .from('marketplace_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    logger.error('[Marketplace] Ошибка обновления статуса заказа', { error });
    toast.error('Ошибка обновления статуса');
    return false;
  }

  toast.success('Статус заказа обновлён');
  return true;
}

// =============================================================================
// STOCKS / ОСТАТКИ — синхронизация складов
// =============================================================================

export interface MarketplaceStock {
  id: string;
  connection_id: string;
  shop_product_id?: string;
  marketplace_product_id?: string;
  sku: string;
  warehouse_id?: string;
  warehouse_name?: string;
  quantity: number;
  reserved: number;
  available: number;
  last_sync_at?: string;
  sync_status: 'idle' | 'syncing' | 'error' | 'success';
  created_at: string;
  updated_at: string;
}

export async function getMarketplaceStocks(connectionId?: string) {
  const { user } = useAuth();
  if (!user) return [];

  let query = dbLoose
    .from('marketplace_stocks')
    .select('*')
    .order('updated_at', { ascending: false });

  if (connectionId) {
    query = query.eq('connection_id', connectionId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[Marketplace] Ошибка загрузки товара', { error });
    toast.error('Не удалось загрузить информацию о товаре');
    return null;
  }
  return data as MarketplaceProduct | null;
}

export async function updateMarketplaceStock(sku: string, updates: Partial<MarketplaceStock>) {
  const { user } = useAuth();
  if (!user) return null;

  const { data, error } = await dbLoose
    .from('marketplace_stocks')
    .upsert({
      sku,
      ...updates,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('[Marketplace] Ошибка обновления остатков', { error });
    toast.error('Ошибка синхронизации остатков');
    return null;
  }
  return data;
}

// =============================================================================
// PVZ — пункты выдачи заказов
// =============================================================================

export interface PVZPoint {
  id: string;
  code: string;
  provider: 'cdek' | 'russian-post' | 'dpd' | 'boxberry' | 'hermes';
  type: 'pickup' | 'post_office' | 'locker' | 'shop';
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  lat: number;
  lng: number;
  phone?: string;
  working_hours?: string;
  max_weight_kg?: number;
  max_dimensions?: { length: number; width: number; height: number };
  is_active: boolean;
  cost_delivery: number;
  delivery_days_min: number;
  delivery_days_max: number;
  created_at: string;
  updated_at: string;
}

export async function getPVZPoints(city?: string, provider?: PVZPoint['provider']) {
  const { user } = useAuth();
  if (!user) return [];

  let query = dbLoose
    .from('pvz_points')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (city) {
    query = query.eq('city', city);
  }
  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[PVZ] Ошибка загрузки пунктов выдачи', { error });
    toast.error('Ошибка загрузки ПВЗ');
    return [];
  }
  return data || [];
}

export async function getNearestPVZPoints(lat: number, lng: number, radiusKm = 10) {
  const { user } = useAuth();
  if (!user) return [];

  // Используем PostGIS для поиска ближайших точек
  const { data, error } = await dbLoose.rpc('get_nearest_pvz_points', {
    user_lat: lat,
    user_lng: lng,
    radius_km: radiusKm,
  });

  if (error) {
    logger.error('[PVZ] Ошибка поиска ближайших ПВЗ', { error });
    // fallback: загружаем все и сортируем на клиенте
    const allPoints = await getPVZPoints();
    const withDistance = allPoints.map(p => ({
      ...p,
      distance: haversineDistance(lat, lng, p.lat, p.lng),
    }));
    return withDistance
      .filter(p => p.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }
  return data || [];
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// =============================================================================
// DELIVERY TARIFFS — тарифы доставки
// =============================================================================

export interface DeliveryTariff {
  id: string;
  name: string;
  type: 'courier' | 'pickup' | 'post';
  min_weight_kg: number;
  max_weight_kg: number;
  min_dimensions?: { length: number; width: number; height: number };
  max_dimensions?: { length: number; width: number; height: number };
  base_cost: number;
  cost_per_kg: number;
  cost_per_km: number;
  free_delivery_threshold: number;
  cities: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalculateDeliveryInput {
  weight_kg: number;
  dimensions?: { length: number; width: number; height: number };
  from_city: string;
  to_city: string;
  distance_km?: number;
}

export async function getDeliveryTariffs() {
  const { user } = useAuth();
  if (!user) return [];

  const { data, error } = await dbLoose
    .from('delivery_tariffs')
    .select('*')
    .eq('is_active', true)
    .order('base_cost', { ascending: true });

  if (error) {
    logger.error('[Delivery] Ошибка загрузки тарифов', { error });
    return [];
  }
  return data || [];
}

export async function calculateDeliveryCost(input: CalculateDeliveryInput) {
  const { data, error } = await dbLoose.rpc('calculate_delivery_cost', input);

  if (error) {
    logger.error('[Delivery] Ошибка расчёта стоимости', { error });
    toast.error('Ошибка расчёта доставки');
    return null;
  }
  return data;
}

// =============================================================================
// PROMOTIONS / СКИДКИ — акции и промокоды
// =============================================================================

export interface Promotion {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'gift' | 'bundle';
  discount_value: number;
  max_discount?: number;
  min_order_amount?: number;
  max_uses?: number;
  used_count: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  applies_to_marketplaces: string[];
  created_at: string;
  updated_at: string;
}

export async function getActivePromotions(marketplaceType?: string) {
  const { user } = useAuth();
  if (!user) return [];

  let query = dbLoose
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .gte('valid_from', new Date().toISOString());

  if (marketplaceType) {
    query = query.contains('applies_to_marketplaces', [marketplaceType]);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[Promotions] Ошибка загрузки акций', { error });
    return [];
  }
  return data || [];
}

// =============================================================================
// PAYMENTS — платежи
// =============================================================================

export interface Payment {
  id: string;
  order_id: string;
  marketplace?: 'ozon' | 'wildberries' | 'amazon' | 'internal';
  amount: number;
  currency: string;
  method: 'card' | 'bank_transfer' | 'e_wallet' | 'cash';
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
  transaction_id?: string;
  card_last4?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

export async function createPayment(orderId: string, input: {
  marketplace?: 'ozon' | 'wildberries' | 'amazon' | 'internal';
  amount: number;
  currency?: string;
  method: Payment['method'];
}) {
  const { user } = useAuth();
  if (!user) {
    toast.error('Необходимо авторизоваться');
    return null;
  }

  const { data, error } = await dbLoose
    .from('payments')
    .insert({
      order_id: orderId,
      marketplace: input.marketplace,
      amount: input.amount,
      currency: input.currency || 'RUB',
      method: input.method,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    logger.error('[Payments] Ошибка создания платежа', { error });
    toast.error('Ошибка создания платежа');
    return null;
  }

  toast.success('Платёж инициирован');
  return data;
}

// =============================================================================
// USER TYPES — типы пользователей (ИП, ФЛ, Самозанятый)
// =============================================================================

export interface UserType {
  id: string;
  user_id: string;
  type: 'individual' | 'ip' | 'self_employed' | 'llc';
  status: 'pending' | 'verified' | 'rejected';
  inn?: string;
  snils?: string;
  ogrn?: string;
  kpp?: string;
  registration_cert?: string;
  verification_documents: string[];
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export async function getUserType(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  if (!targetUserId) return null;

  const { data, error } = await dbLoose
    .from('user_types')
    .select('*')
    .eq('user_id', targetUserId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[UserTypes] Ошибка загрузки', { error });
    return null;
  }
  return data;
}

export async function createUserType(input: {
  type: UserType['type'];
  inn?: string;
  snils?: string;
  ogrn?: string;
  kpp?: string;
  documents: string[];
}) {
  const { user } = useAuth();
  if (!user) {
    toast.error('Необходимо авторизоваться');
    return null;
  }

  const { data, error } = await dbLoose
    .from('user_types')
    .insert({
      user_id: user.id,
      type: input.type,
      status: 'pending',
      inn: input.inn,
      snils: input.snils,
      ogrn: input.ogrn,
      kpp: input.kpp,
      verification_documents: input.documents,
    })
    .select()
    .single();

  if (error) {
    logger.error('[UserTypes] Ошибка регистрации', { error });
    toast.error('Ошибка регистрации');
    return null;
  }

  toast.success('Заявка отправлена на верификацию');
  return data;
}

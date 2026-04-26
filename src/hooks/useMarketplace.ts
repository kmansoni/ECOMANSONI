import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  getMarketplaceConnections,
  createMarketplaceConnection,
  updateConnectionStatus,
  getMarketplaceProducts,
  createMarketplaceProduct,
  updateMarketplaceProduct,
  getMarketplaceOrders,
  updateMarketplaceOrderStatus,
  getMarketplaceStocks,
  updateMarketplaceStock,
  getActivePromotions,
  getDeliveryTariffs,
  calculateDeliveryCost,
  createPayment,
  getPVZPoints,
  getNearestPVZPoints,
  getUserType,
  createUserType,
} from '@/lib/marketplace/marketplaceApi';
import type {
  MarketplaceConnection,
  MarketplaceProduct,
  MarketplaceOrder,
  MarketplaceStock,
  CreateConnectionInput,
  CreateMarketplaceProductInput,
  PVZPoint,
  DeliveryTariff,
  Promotion,
  Payment,
  UserType,
} from '@/lib/marketplace/marketplaceApi';

export function useMarketplace() {
  const { user } = useAuth();

  // --- Подключения к маркетплейсам ---
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  const loadConnections = useCallback(async () => {
    if (!user) return;
    setConnectionsLoading(true);
    try {
      const data = await getMarketplaceConnections();
      setConnections(data);
    } finally {
      setConnectionsLoading(false);
    }
  }, [user]);

  const createConnection = useCallback(async (input: CreateConnectionInput) => {
    const data = await createMarketplaceConnection(input);
    if (data) {
      await loadConnections();
    }
    return data;
  }, [loadConnections]);

  // --- Товары на маркетплейсах ---
  const [marketplaceProducts, setMarketplaceProducts] = useState<MarketplaceProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const loadMarketplaceProducts = useCallback(async (connectionId?: string) => {
    if (!user) return;
    setProductsLoading(true);
    try {
      const data = await getMarketplaceProducts(connectionId);
      setMarketplaceProducts(data);
    } finally {
      setProductsLoading(false);
    }
  }, [user]);

  const addProductToMarketplace = useCallback(async (input: CreateMarketplaceProductInput) => {
    const data = await createMarketplaceProduct(input);
    if (data) {
      await loadMarketplaceProducts(input.connection_id);
    }
    return data;
  }, [loadMarketplaceProducts]);

  // --- Заказы с маркетплейсов ---
  const [marketplaceOrders, setMarketplaceOrders] = useState<MarketplaceOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadMarketplaceOrders = useCallback(async (connectionId?: string) => {
    if (!user) return;
    setOrdersLoading(true);
    try {
      const data = await getMarketplaceOrders(connectionId);
      setMarketplaceOrders(data);
    } finally {
      setOrdersLoading(false);
    }
  }, [user]);

  const changeOrderStatus = useCallback(async (orderId: string, status: MarketplaceOrder['status']) => {
    const success = await updateMarketplaceOrderStatus(orderId, status);
    if (success) {
      setMarketplaceOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status, updated_at: new Date().toISOString() } : o)
      );
    }
    return success;
  }, []);

  // --- Остатки ---
  const [stocks, setStocks] = useState<MarketplaceStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);

  const loadStocks = useCallback(async (connectionId?: string) => {
    if (!user) return;
    setStocksLoading(true);
    try {
      const data = await getMarketplaceStocks(connectionId);
      setStocks(data);
    } finally {
      setStocksLoading(false);
    }
  }, [user]);

  const syncStock = useCallback(async (sku: string, updates: Partial<MarketplaceStock>) => {
    const data = await updateMarketplaceStock(sku, updates);
    if (data) {
      setStocks(prev => {
        const existing = prev.find(s => s.sku === sku);
        if (existing) {
          return prev.map(s => s.sku === sku ? { ...s, ...updates, updated_at: new Date().toISOString() } : s);
        }
        return [...prev, data];
      });
    }
    return data;
  }, []);

  // --- ПВЗ ---
  const [pvzPoints, setPvzPoints] = useState<PVZPoint[]>([]);
  const [pvzLoading, setPvzLoading] = useState(false);

  const loadPVZPoints = useCallback(async (city?: string, provider?: PVZPoint['provider']) => {
    setPvzLoading(true);
    try {
      const data = await getPVZPoints(city, provider);
      setPvzPoints(data);
    } finally {
      setPvzLoading(false);
    }
  }, []);

  const findNearestPVZ = useCallback(async (lat: number, lng: number, radius = 10) => {
    return await getNearestPVZPoints(lat, lng, radius);
  }, []);

  // --- Тарифы доставки ---
  const [deliveryTariffs, setDeliveryTariffs] = useState<DeliveryTariff[]>([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);

  const loadDeliveryTariffs = useCallback(async () => {
    if (!user) return;
    setTariffsLoading(true);
    try {
      const data = await getDeliveryTariffs();
      setDeliveryTariffs(data);
    } finally {
      setTariffsLoading(false);
    }
  }, [user]);

  const calculateDelivery = useCallback(async (input: {
    weight_kg: number;
    dimensions?: { length: number; width: number; height: number };
    from_city: string;
    to_city: string;
    distance_km?: number;
  }) => {
    return await calculateDeliveryCost(input);
  }, []);

  // --- Акции и скидки ---
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);

  const loadPromotions = useCallback(async (marketplaceType?: string) => {
    setPromotionsLoading(true);
    try {
      const data = await getActivePromotions(marketplaceType);
      setPromotions(data);
    } finally {
      setPromotionsLoading(false);
    }
  }, []);

  // --- Платежи ---
  const createMarketplacePayment = useCallback(async (orderId: string, input: {
    marketplace?: 'ozon' | 'wildberries' | 'amazon' | 'internal';
    amount: number;
    currency?: string;
    method: 'card' | 'bank_transfer' | 'e_wallet' | 'cash';
  }) => {
    return await createPayment(orderId, input);
  }, []);

  // --- Типы пользователей ---
  const [userType, setUserType] = useState<UserType | null>(null);
  const [userTypeLoading, setUserTypeLoading] = useState(false);

  const loadUserType = useCallback(async (userId?: string) => {
    setUserTypeLoading(true);
    try {
      const data = await getUserType(userId);
      setUserType(data);
    } finally {
      setUserTypeLoading(false);
    }
  }, []);

  const registerUserType = useCallback(async (input: {
    type: 'individual' | 'ip' | 'self_employed' | 'llc';
    inn?: string;
    snils?: string;
    ogrn?: string;
    kpp?: string;
    documents: string[];
  }) => {
    const data = await createUserType(input);
    if (data) {
      await loadUserType();
    }
    return data;
  }, [loadUserType]);

  // --- Синхронизация с внутренним магазином ---
  const syncWithInternalShop = useCallback(async (shopProductId: string) => {
    // Здесь логика синхронизации с внутренним магазином
    // 1. Получить товар из внутреннего магазина (useShop)
    // 2. Обновить/создать товар на всех подключенных маркетплейсах
    // 3. Синхронизировать остатки и цены
    return true;
  }, []);

  useEffect(() => {
    if (user) {
      loadConnections();
      loadMarketplaceProducts();
      loadMarketplaceOrders();
      loadStocks();
      loadDeliveryTariffs();
      loadUserType();
    }
  }, [user, loadConnections, loadMarketplaceProducts, loadMarketplaceOrders, loadStocks, loadDeliveryTariffs, loadUserType]);

  return {
    // Подключения
    connections,
    connectionsLoading,
    loadConnections,
    createConnection,
    updateConnectionStatus,

    // Товары
    marketplaceProducts,
    productsLoading,
    loadMarketplaceProducts,
    addProductToMarketplace,
    updateMarketplaceProduct,

    // Заказы
    marketplaceOrders,
    ordersLoading,
    loadMarketplaceOrders,
    changeOrderStatus,

    // Остатки
    stocks,
    stocksLoading,
    loadStocks,
    syncStock,

    // ПВЗ
    pvzPoints,
    pvzLoading,
    loadPVZPoints,
    findNearestPVZ,

    // Доставка
    deliveryTariffs,
    tariffsLoading,
    loadDeliveryTariffs,
    calculateDelivery,

    // Акции
    promotions,
    promotionsLoading,
    loadPromotions,

    // Платежи
    createMarketplacePayment,

    // Типы пользователей
    userType,
    userTypeLoading,
    loadUserType,
    registerUserType,

    // Синхронизация
    syncWithInternalShop,
  };
}

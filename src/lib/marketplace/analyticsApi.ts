import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface SalesReport {
  id: string;
  period: string;
  marketplace: 'ozon' | 'wildberries' | 'amazon' | 'all';
  total_orders: number;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  profit_margin: number;
  total_refunds: number;
  avg_order_value: number;
  conversion_rate: number;
  product_count: number;
  top_products: Array<{
    product_id: string;
    title: string;
    sales: number;
    profit: number;
    quantity: number;
  }>;
  created_at: string;
}

export interface ProfitReport {
  id: string;
  shop_product_id?: string;
  marketplace: string;
  product_title: string;
  period: string;
  revenue: number;
  cogs: number; // себестоимость
  fees: number; // комиссии маркетплейса
  shipping_cost: number;
  marketing_cost: number;
  total_expenses: number;
  gross_profit: number;
  net_profit: number;
  profit_margin: number;
  roi: number;
  created_at: string;
}

export interface DailyMetrics {
  date: string;
  orders: number;
  revenue: number;
  profit: number;
  orders_marketplace: {
    ozon: number;
    wildberries: number;
    amazon: number;
    internal: number;
  };
  revenue_marketplace: {
    ozon: number;
    wildberries: number;
    amazon: number;
    internal: number;
  };
}

export interface ProductPerformance {
  product_id: string;
  title: string;
  marketplace: string;
  period: string;
  units_sold: number;
  revenue: number;
  profit: number;
  profit_margin: number;
  views: number;
  conversion_rate: number;
  returns_count: number;
  return_rate: number;
}

// =============================================================================
// Генерация отчета по продажам
// =============================================================================
export async function generateSalesReport(params: {
  startDate: string;
  endDate: string;
  marketplace?: 'ozon' | 'wildberries' | 'amazon' | 'all';
  groupBy?: 'day' | 'week' | 'month';
}) {
  const { startDate, endDate, marketplace = 'all', groupBy = 'day' } = params;

  try {
    const { data, error } = await dbLoose.rpc('generate_sales_report', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_marketplace: marketplace,
      p_group_by: groupBy,
    });

    if (error) {
      logger.error('[Analytics] Ошибка генерации отчета по продажам', { error });
      toast.error('Ошибка генерации отчета');
      return null;
    }

    return data as SalesReport[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при генерации отчета', { error: e.message });
    toast.error('Ошибка генерации отчета');
    return null;
  }
}

// =============================================================================
// Отчет по прибыли (доходы/расходы/маржинальность)
// =============================================================================
export async function generateProfitReport(params: {
  startDate: string;
  endDate: string;
  marketplace?: string;
  includeCogs?: boolean; // себестоимость
  includeFees?: boolean;  // комиссии
}) {
  const { startDate, endDate, marketplace, includeCogs = true, includeFees = true } = params;

  try {
    const { data, error } = await dbLoose.rpc('generate_profit_report', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_marketplace: marketplace || null,
      p_include_cogs: includeCogs,
      p_include_fees: includeFees,
    });

    if (error) {
      logger.error('[Analytics] Ошибка генерации отчета по прибыли', { error });
      toast.error('Ошибка генерации отчета');
      return null;
    }

    return data as ProfitReport[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при генерации отчета по прибыли', { error: e.message });
    toast.error('Ошибка генерации отчета');
    return null;
  }
}

// =============================================================================
// Ежедневные метрики (для дашборда)
// =============================================================================
export async function getDailyMetrics(startDate: string, endDate: string) {
  try {
    const { data, error } = await dbLoose.rpc('get_daily_metrics', {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      logger.error('[Analytics] Ошибка загрузки метрик', { error });
      return [];
    }

    return data as DailyMetrics[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при загрузке метрик', { error: e.message });
    return [];
  }
}

// =============================================================================
// Производительность товаров
// =============================================================================
export async function getProductPerformance(params: {
  startDate: string;
  endDate: string;
  marketplace?: string;
  limit?: number;
}) {
  const { startDate, endDate, marketplace, limit = 100 } = params;

  try {
    const { data, error } = await dbLoose.rpc('get_product_performance', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_marketplace: marketplace || null,
      p_limit: limit,
    });

    if (error) {
      logger.error('[Analytics] Ошибка загрузки производительности товаров', { error });
      return [];
    }

    return data as ProductPerformance[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при загрузке данных', { error: e.message });
    return [];
  }
}

// =============================================================================
// Сравнение площадок
// =============================================================================
export interface MarketplaceComparison {
  marketplace: string;
  total_orders: number;
  total_revenue: number;
  total_profit: number;
  avg_order_value: number;
  profit_margin: number;
  conversion_rate: number;
  fees_percent: number;
  top_category: string;
}

export async function compareMarketplaces(startDate: string, endDate: string) {
  try {
    const { data, error } = await dbLoose.rpc('compare_marketplaces', {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      logger.error('[Analytics] Ошибка сравнения площадок', { error });
      return [];
    }

    return data as MarketplaceComparison[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при сравнении', { error: e.message });
    return [];
  }
}

// =============================================================================
// Прогноз продаж (на основе исторических данных)
// =============================================================================
export interface SalesForecast {
  date: string;
  predicted_orders: number;
  predicted_revenue: number;
  confidence_lower: number;
  confidence_upper: number;
  seasonality_factor: number;
}

export async function getSalesForecast(daysAhead: number = 30) {
  try {
    const { data, error } = await dbLoose.rpc('get_sales_forecast', {
      p_days_ahead: daysAhead,
    });

    if (error) {
      logger.error('[Analytics] Ошибка прогнозирования', { error });
      return [];
    }

    return data as SalesForecast[];
  } catch (e: any) {
    logger.error('[Analytics] Исключение при прогнозе', { error: e.message });
    return [];
  }
}

// =============================================================================
// Ключевые показатели эффективности (KPI)
// =============================================================================
export interface KPIMetrics {
  total_revenue: number;
  total_profit: number;
  total_orders: number;
  avg_order_value: number;
  profit_margin: number;
  conversion_rate: number;
  customer_acquisition_cost: number;
  customer_lifetime_value: number;
  inventory_turnover: number;
  return_rate: number;
  top_performing_product: {
    id: string;
    title: string;
    revenue: number;
  };
  growth_vs_previous_period: {
    revenue: number;
    profit: number;
    orders: number;
  };
}

export async function getKPIMetrics(period: 'week' | 'month' | 'quarter' | 'year' = 'month') {
  try {
    const { data, error } = await dbLoose.rpc('get_kpi_metrics', {
      p_period: period,
    });

    if (error) {
      logger.error('[Analytics] Ошибка загрузки KPI', { error });
      return null;
    }

    return data as KPIMetrics | null;
  } catch (e: any) {
    logger.error('[Analytics] Исключение при загрузке KPI', { error: e.message });
    return null;
  }
}

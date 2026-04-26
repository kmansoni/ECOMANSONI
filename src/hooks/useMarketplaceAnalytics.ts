import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  generateSalesReport,
  generateProfitReport,
  getDailyMetrics,
  getProductPerformance,
  compareMarketplaces,
  getSalesForecast,
  getKPIMetrics,
  type SalesReport,
  type ProfitReport,
  type DailyMetrics,
  type ProductPerformance,
  type MarketplaceComparison,
  type SalesForecast,
  type KPIMetrics,
} from '@/lib/marketplace/analyticsApi';

export interface AnalyticsFilter {
  startDate: string;
  endDate: string;
  marketplace?: 'ozon' | 'wildberries' | 'amazon' | 'all';
  groupBy?: 'day' | 'week' | 'month';
}

export function useMarketplaceAnalytics() {
  const { user } = useAuth();

  // Sales Report
  const [salesReport, setSalesReport] = useState<SalesReport[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  // Profit Report
  const [profitReport, setProfitReport] = useState<ProfitReport[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);

  // Daily Metrics
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Product Performance
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);

  // Marketplace Comparison
  const [marketplaceComparison, setMarketplaceComparison] = useState<MarketplaceComparison[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // Sales Forecast
  const [salesForecast, setSalesForecast] = useState<SalesForecast[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // KPI Metrics
  const [kpiMetrics, setKpiMetrics] = useState<KPIMetrics | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  // Generate Sales Report
  const fetchSalesReport = useCallback(async (filter: AnalyticsFilter) => {
    if (!user) return;
    setSalesLoading(true);
    try {
      const data = await generateSalesReport(filter);
      setSalesReport(data || []);
    } finally {
      setSalesLoading(false);
    }
  }, [user]);

  // Generate Profit Report
  const fetchProfitReport = useCallback(async (params: {
    startDate: string;
    endDate: string;
    marketplace?: string;
    includeCogs?: boolean;
    includeFees?: boolean;
  }) => {
    if (!user) return;
    setProfitLoading(true);
    try {
      const data = await generateProfitReport(params);
      setProfitReport(data || []);
    } finally {
      setProfitLoading(false);
    }
  }, [user]);

  // Fetch Daily Metrics
  const fetchDailyMetrics = useCallback(async (startDate: string, endDate: string) => {
    if (!user) return;
    setMetricsLoading(true);
    try {
      const data = await getDailyMetrics(startDate, endDate);
      setDailyMetrics(data || []);
    } finally {
      setMetricsLoading(false);
    }
  }, [user]);

  // Fetch Product Performance
  const fetchProductPerformance = useCallback(async (params: {
    startDate: string;
    endDate: string;
    marketplace?: string;
    limit?: number;
  }) => {
    if (!user) return;
    setPerformanceLoading(true);
    try {
      const data = await getProductPerformance(params);
      setProductPerformance(data || []);
    } finally {
      setPerformanceLoading(false);
    }
  }, [user]);

  // Compare Marketplaces
  const fetchMarketplaceComparison = useCallback(async (startDate: string, endDate: string) => {
    if (!user) return;
    setComparisonLoading(true);
    try {
      const data = await compareMarketplaces(startDate, endDate);
      setMarketplaceComparison(data || []);
    } finally {
      setComparisonLoading(false);
    }
  }, [user]);

  // Get Sales Forecast
  const fetchSalesForecast = useCallback(async (daysAhead: number = 30) => {
    if (!user) return;
    setForecastLoading(true);
    try {
      const data = await getSalesForecast(daysAhead);
      setSalesForecast(data || []);
    } finally {
      setForecastLoading(false);
    }
  }, [user]);

  // Get KPI Metrics
  const fetchKPIMetrics = useCallback(async (period: 'week' | 'month' | 'quarter' | 'year' = 'month') => {
    if (!user) return;
    setKpiLoading(true);
    try {
      const data = await getKPIMetrics(period);
      setKpiMetrics(data || null);
    } finally {
      setKpiLoading(false);
    }
  }, [user]);

  // Load all analytics
  const loadAllAnalytics = useCallback(async (filter: AnalyticsFilter) => {
    await Promise.all([
      fetchSalesReport(filter),
      fetchProfitReport(filter),
      fetchDailyMetrics(filter.startDate, filter.endDate),
      fetchProductPerformance(filter),
      fetchMarketplaceComparison(filter.startDate, filter.endDate),
      fetchKPIMetrics('month'),
    ]);
  }, [fetchSalesReport, fetchProfitReport, fetchDailyMetrics, fetchProductPerformance, fetchMarketplaceComparison, fetchKPIMetrics]);

  return {
    // Sales Report
    salesReport,
    salesLoading,
    fetchSalesReport,

    // Profit Report
    profitReport,
    profitLoading,
    fetchProfitReport,

    // Daily Metrics
    dailyMetrics,
    metricsLoading,
    fetchDailyMetrics,

    // Product Performance
    productPerformance,
    performanceLoading,
    fetchProductPerformance,

    // Marketplace Comparison
    marketplaceComparison,
    comparisonLoading,
    fetchMarketplaceComparison,

    // Sales Forecast
    salesForecast,
    forecastLoading,
    fetchSalesForecast,

    // KPI Metrics
    kpiMetrics,
    kpiLoading,
    fetchKPIMetrics,

    // Load all
    loadAllAnalytics,
  };
}

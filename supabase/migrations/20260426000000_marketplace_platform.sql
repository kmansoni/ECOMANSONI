-- Функции для отчета по продажам
CREATE OR REPLACE FUNCTION public.generate_sales_report(
  p_start_date DATE,
  p_end_date DATE,
  p_marketplace VARCHAR DEFAULT 'all',
  p_group_by VARCHAR DEFAULT 'day'
)
RETURNS TABLE (
  period TEXT,
  total_orders BIGINT,
  total_sales NUMERIC,
  total_cost NUMERIC,
  total_profit NUMERIC,
  profit_margin NUMERIC,
  total_refunds NUMERIC,
  avg_order_value NUMERIC,
  product_count BIGINT
) AS $$
BEGIN
  IF p_group_by = 'day' THEN
    RETURN QUERY
    SELECT 
      to_char(o.ordered_at, 'YYYY-MM-DD') as period,
      COUNT(DISTINCT o.id) as total_orders,
      SUM(o.total_amount) as total_sales,
      SUM(o.total_amount * 0.6) as total_cost, -- предполагаем себестоимость 60%
      SUM(o.total_amount * 0.4) as total_profit, -- прибыль 40%
      CASE 
        WHEN SUM(o.total_amount) > 0 THEN ROUND((SUM(o.total_amount * 0.4) / SUM(o.total_amount)) * 100, 2)
        ELSE 0 
      END as profit_margin,
      SUM(CASE WHEN o.status = 'cancelled' OR o.status = 'returned' THEN o.total_amount ELSE 0 END) as total_refunds,
      CASE 
        WHEN COUNT(DISTINCT o.id) > 0 THEN ROUND(SUM(o.total_amount) / COUNT(DISTINCT o.id), 2)
        ELSE 0 
      END as avg_order_value,
      COUNT(DISTINCT mop.marketplace_product_id) as product_count
    FROM marketplace_orders o
    LEFT JOIN marketplace_products mop ON mop.marketplace_product_id = (o.order_items->0->>'marketplace_product_id')
    WHERE o.ordered_at >= p_start_date 
      AND o.ordered_at <= p_end_date + INTERVAL '1 day'
      AND o.status != 'cancelled'
      AND (p_marketplace = 'all' OR o.marketplace = p_marketplace)
    GROUP BY to_char(o.ordered_at, 'YYYY-MM-DD')
    ORDER BY period;
  ELSIF p_group_by = 'month' THEN
    RETURN QUERY
    SELECT 
      to_char(o.ordered_at, 'YYYY-MM') as period,
      COUNT(DISTINCT o.id) as total_orders,
      SUM(o.total_amount) as total_sales,
      SUM(o.total_amount * 0.6) as total_cost,
      SUM(o.total_amount * 0.4) as total_profit,
      CASE 
        WHEN SUM(o.total_amount) > 0 THEN ROUND((SUM(o.total_amount * 0.4) / SUM(o.total_amount)) * 100, 2)
        ELSE 0 
      END as profit_margin,
      SUM(CASE WHEN o.status = 'cancelled' OR o.status = 'returned' THEN o.total_amount ELSE 0 END) as total_refunds,
      CASE 
        WHEN COUNT(DISTINCT o.id) > 0 THEN ROUND(SUM(o.total_amount) / COUNT(DISTINCT o.id), 2)
        ELSE 0 
      END as avg_order_value,
      COUNT(DISTINCT mop.marketplace_product_id) as product_count
    FROM marketplace_orders o
    LEFT JOIN marketplace_products mop ON mop.marketplace_product_id = (o.order_items->0->>'marketplace_product_id')
    WHERE o.ordered_at >= p_start_date 
      AND o.ordered_at <= p_end_date + INTERVAL '1 day'
      AND o.status != 'cancelled'
      AND (p_marketplace = 'all' OR o.marketplace = p_marketplace)
    GROUP BY to_char(o.ordered_at, 'YYYY-MM')
    ORDER BY period;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для отчета по прибыли (детальный)
CREATE OR REPLACE FUNCTION public.generate_profit_report(
  p_start_date DATE,
  p_end_date DATE,
  p_marketplace VARCHAR DEFAULT NULL,
  p_include_cogs BOOLEAN DEFAULT true,
  p_include_fees BOOLEAN DEFAULT true
)
RETURNS TABLE (
  shop_product_id UUID,
  marketplace VARCHAR,
  product_title VARCHAR,
  period TEXT,
  revenue NUMERIC,
  cogs NUMERIC,
  fees NUMERIC,
  shipping_cost NUMERIC,
  marketing_cost NUMERIC,
  total_expenses NUMERIC,
  gross_profit NUMERIC,
  net_profit NUMERIC,
  profit_margin NUMERIC,
  roi NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.shop_product_id,
    o.marketplace,
    COALESCE(mp.title, 'Неизвестный товар') as product_title,
    to_char(o.ordered_at, 'YYYY-MM') as period,
    SUM(o.total_amount) as revenue,
    CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END as cogs, -- себестоимость 60%
    CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END as fees, -- комиссия маркетплейса 15%
    SUM(o.delivery_cost) as shipping_cost,
    0 as marketing_cost, -- пока не реализовано
    CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
    CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
    SUM(o.delivery_cost) as total_expenses,
    SUM(o.total_amount) - (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END) as gross_profit,
    SUM(o.total_amount) - (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
                           CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
                           SUM(o.delivery_cost)) as net_profit,
    CASE 
      WHEN SUM(o.total_amount) > 0 THEN ROUND(((SUM(o.total_amount) - (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
                                                         CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
                                                         SUM(o.delivery_cost))) / SUM(o.total_amount)) * 100, 2)
      ELSE 0 
    END as profit_margin,
    CASE 
      WHEN (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
            CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
            SUM(o.delivery_cost)) > 0 THEN
        ROUND(((SUM(o.total_amount) - (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
                          CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
                          SUM(o.delivery_cost))) / 
               (CASE WHEN p_include_cogs THEN SUM(o.total_amount * 0.6) ELSE 0 END + 
                CASE WHEN p_include_fees THEN SUM(o.total_amount * 0.15) ELSE 0 END + 
                SUM(o.delivery_cost))) * 100, 2)
      ELSE 0 
    END as roi
  FROM marketplace_orders o
  LEFT JOIN marketplace_products mp ON mp.marketplace_product_id = (o.order_items->0->>'marketplace_product_id')
  WHERE o.ordered_at >= p_start_date 
    AND o.ordered_at <= p_end_date + INTERVAL '1 day'
    AND o.status IN ('delivered', 'shipped', 'confirmed')
    AND (p_marketplace IS NULL OR o.marketplace = p_marketplace)
  GROUP BY mp.shop_product_id, o.marketplace, mp.title, to_char(o.ordered_at, 'YYYY-MM')
  HAVING SUM(o.total_amount) > 0
  ORDER BY net_profit DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для дневных метрик
CREATE OR REPLACE FUNCTION public.get_daily_metrics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  orders BIGINT,
  revenue NUMERIC,
  profit NUMERIC,
  orders_marketplace JSONB,
  revenue_marketplace JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.date::DATE,
    COALESCE(SUM(day_stats.orders), 0) as orders,
    COALESCE(SUM(day_stats.revenue), 0) as revenue,
    COALESCE(SUM(day_stats.profit), 0) as profit,
    jsonb_build_object(
      'ozon', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'ozon' THEN day_stats.orders ELSE 0 END), 0),
      'wildberries', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'wildberries' THEN day_stats.orders ELSE 0 END), 0),
      'amazon', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'amazon' THEN day_stats.orders ELSE 0 END), 0),
      'internal', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'internal' THEN day_stats.orders ELSE 0 END), 0)
    ) as orders_marketplace,
    jsonb_build_object(
      'ozon', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'ozon' THEN day_stats.revenue ELSE 0 END), 0),
      'wildberries', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'wildberries' THEN day_stats.revenue ELSE 0 END), 0),
      'amazon', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'amazon' THEN day_stats.revenue ELSE 0 END), 0),
      'internal', COALESCE(SUM(CASE WHEN day_stats.marketplace = 'internal' THEN day_stats.revenue ELSE 0 END), 0)
    ) as revenue_marketplace
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) d(date)
  LEFT JOIN (
    SELECT 
      o.ordered_at::DATE as order_date,
      o.marketplace,
      COUNT(*) as orders,
      SUM(o.total_amount) as revenue,
      SUM(o.total_amount * 0.4) as profit
    FROM marketplace_orders o
    WHERE o.ordered_at >= p_start_date 
      AND o.ordered_at <= p_end_date + INTERVAL '1 day'
      AND o.status IN ('delivered', 'shipped', 'confirmed')
    GROUP BY o.ordered_at::DATE, o.marketplace
  ) day_stats ON day_stats.order_date = d.date
  GROUP BY d.date
  ORDER BY d.date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для производительности товаров
CREATE OR REPLACE FUNCTION public.get_product_performance(
  p_start_date DATE,
  p_end_date DATE,
  p_marketplace VARCHAR DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  product_id UUID,
  title VARCHAR,
  marketplace VARCHAR,
  period TEXT,
  units_sold BIGINT,
  revenue NUMERIC,
  profit NUMERIC,
  profit_margin NUMERIC,
  views BIGINT DEFAULT 0,
  conversion_rate NUMERIC,
  returns_count BIGINT,
  return_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id as product_id,
    mp.title,
    o.marketplace,
    to_char(o.ordered_at, 'YYYY-MM') as period,
    SUM((oi->>'quantity')::INTEGER) as units_sold,
    SUM(o.total_amount) as revenue,
    SUM(o.total_amount * 0.4) as profit,
    40 as profit_margin,
    0 as views,
    0 as conversion_rate,
    SUM(CASE WHEN o.status = 'returned' THEN (oi->>'quantity')::INTEGER ELSE 0 END) as returns_count,
    CASE 
      WHEN SUM((oi->>'quantity')::INTEGER) > 0 THEN 
        ROUND((SUM(CASE WHEN o.status = 'returned' THEN (oi->>'quantity')::INTEGER ELSE 0 END)::NUMERIC / 
               SUM((oi->>'quantity')::INTEGER)::NUMERIC) * 100, 2)
      ELSE 0 
    END as return_rate
  FROM marketplace_orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.order_items) as oi
  LEFT JOIN marketplace_products mp ON mp.marketplace_sku = oi->>'sku'
  WHERE o.ordered_at >= p_start_date 
    AND o.ordered_at <= p_end_date + INTERVAL '1 day'
    AND o.status IN ('delivered', 'shipped', 'confirmed', 'returned')
    AND (p_marketplace IS NULL OR o.marketplace = p_marketplace)
  GROUP BY mp.id, mp.title, o.marketplace, to_char(o.ordered_at, 'YYYY-MM')
  ORDER BY profit DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для сравнения площадок
CREATE OR REPLACE FUNCTION public.compare_marketplaces(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  marketplace VARCHAR,
  total_orders BIGINT,
  total_revenue NUMERIC,
  total_profit NUMERIC,
  avg_order_value NUMERIC,
  profit_margin NUMERIC,
  conversion_rate NUMERIC,
  fees_percent NUMERIC,
  top_category VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.marketplace,
    COUNT(DISTINCT o.id) as total_orders,
    SUM(o.total_amount) as total_revenue,
    SUM(o.total_amount * 0.4) as total_profit,
    CASE 
      WHEN COUNT(DISTINCT o.id) > 0 THEN ROUND(SUM(o.total_amount) / COUNT(DISTINCT o.id), 2)
      ELSE 0 
    END as avg_order_value,
    40 as profit_margin,
    0 as conversion_rate,
    15 as fees_percent,
    'Категория' as top_category
  FROM marketplace_orders o
  WHERE o.ordered_at >= p_start_date 
    AND o.ordered_at <= p_end_date + INTERVAL '1 day'
    AND o.status IN ('delivered', 'shipped', 'confirmed')
  GROUP BY o.marketplace
  ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для прогноза продаж
CREATE OR REPLACE FUNCTION public.get_sales_forecast(
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  forecast_date DATE,
  predicted_orders BIGINT,
  predicted_revenue NUMERIC,
  confidence_lower NUMERIC,
  confidence_upper NUMERIC,
  seasonality_factor NUMERIC
) AS $$
DECLARE
  avg_daily_orders NUMERIC;
  avg_daily_revenue NUMERIC;
  last_date DATE;
BEGIN
  SELECT 
    AVG(day_stats.orders),
    AVG(day_stats.revenue),
    MAX(day_stats.order_date)
  INTO avg_daily_orders, avg_daily_revenue, last_date
  FROM (
    SELECT 
      o.ordered_at::DATE as order_date,
      COUNT(*) as orders,
      SUM(o.total_amount) as revenue
    FROM marketplace_orders o
    WHERE o.ordered_at >= CURRENT_DATE - INTERVAL '90 days'
      AND o.status IN ('delivered', 'shipped', 'confirmed')
    GROUP BY o.ordered_at::DATE
  ) day_stats;

  avg_daily_orders := COALESCE(avg_daily_orders, 10);
  avg_daily_revenue := COALESCE(avg_daily_revenue, 50000);

  RETURN QUERY
  SELECT 
    (COALESCE(last_date, CURRENT_DATE) + (gs || ' days')::INTERVAL)::DATE as forecast_date,
    ROUND(avg_daily_orders * (1 + (RANDOM() * 0.4 - 0.2)))::BIGINT as predicted_orders,
    ROUND(avg_daily_revenue * (1 + (RANDOM() * 0.4 - 0.2)))::NUMERIC as predicted_revenue,
    ROUND(avg_daily_orders * 0.8)::BIGINT as confidence_lower,
    ROUND(avg_daily_orders * 1.2)::BIGINT as confidence_upper,
    1.0 as seasonality_factor
  FROM generate_series(1, p_days_ahead) as gs;
END;
$$ LANGUAGE plpgsql STABLE;

-- Функция для KPI метрик
CREATE OR REPLACE FUNCTION public.get_kpi_metrics(
  p_period VARCHAR DEFAULT 'month'
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_profit NUMERIC,
  total_orders BIGINT,
  avg_order_value NUMERIC,
  profit_margin NUMERIC,
  conversion_rate NUMERIC,
  customer_acquisition_cost NUMERIC,
  customer_lifetime_value NUMERIC,
  inventory_turnover NUMERIC,
  return_rate NUMERIC,
  top_performing_product_id UUID,
  top_performing_product_title VARCHAR,
  top_performing_product_revenue NUMERIC,
  revenue_growth NUMERIC,
  profit_growth NUMERIC,
  orders_growth NUMERIC
) AS $$
DECLARE
  start_date DATE;
  prev_start_date DATE;
  prev_end_date DATE;
BEGIN
  CASE p_period
    WHEN 'week' THEN
      start_date := CURRENT_DATE - INTERVAL '7 days';
      prev_start_date := CURRENT_DATE - INTERVAL '14 days';
      prev_end_date := CURRENT_DATE - INTERVAL '8 days';
    WHEN 'month' THEN
      start_date := CURRENT_DATE - INTERVAL '30 days';
      prev_start_date := CURRENT_DATE - INTERVAL '60 days';
      prev_end_date := CURRENT_DATE - INTERVAL '31 days';
    WHEN 'quarter' THEN
      start_date := CURRENT_DATE - INTERVAL '90 days';
      prev_start_date := CURRENT_DATE - INTERVAL '180 days';
      prev_end_date := CURRENT_DATE - INTERVAL '91 days';
    WHEN 'year' THEN
      start_date := CURRENT_DATE - INTERVAL '365 days';
      prev_start_date := CURRENT_DATE - INTERVAL '730 days';
      prev_end_date := CURRENT_DATE - INTERVAL '366 days';
    ELSE
      start_date := CURRENT_DATE - INTERVAL '30 days';
      prev_start_date := CURRENT_DATE - INTERVAL '60 days';
      prev_end_date := CURRENT_DATE - INTERVAL '31 days';
  END CASE;

  RETURN QUERY
  WITH current_period AS (
    SELECT 
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM(total_amount * 0.4), 0) as profit,
      COUNT(*) as orders,
      COALESCE(AVG(total_amount), 0) as avg_order_val,
      COALESCE(SUM(CASE WHEN status IN ('returned', 'cancelled') THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 0) as ret_rate
    FROM marketplace_orders
    WHERE ordered_at >= start_date 
      AND ordered_at <= CURRENT_DATE
      AND status IN ('delivered', 'shipped', 'confirmed', 'returned', 'cancelled')
  ),
  prev_period AS (
    SELECT 
      COALESCE(SUM(total_amount), 0) as revenue,
      COALESCE(SUM(total_amount * 0.4), 0) as profit,
      COUNT(*) as orders
    FROM marketplace_orders
    WHERE ordered_at >= prev_start_date 
      AND ordered_at <= prev_end_date
      AND status IN ('delivered', 'shipped', 'confirmed')
  ),
  top_prod AS (
    SELECT 
      mp.id,
      mp.title,
      SUM(o.total_amount) as prod_revenue
    FROM marketplace_orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.order_items) as oi
    LEFT JOIN marketplace_products mp ON mp.marketplace_sku = oi->>'sku'
    WHERE o.ordered_at >= start_date 
      AND o.ordered_at <= CURRENT_DATE
      AND o.status IN ('delivered', 'shipped', 'confirmed')
    GROUP BY mp.id, mp.title
    ORDER BY prod_revenue DESC
    LIMIT 1
  )
  SELECT 
    cp.revenue,
    cp.profit,
    cp.orders,
    cp.avg_order_val,
    CASE 
      WHEN cp.revenue > 0 THEN ROUND((cp.profit / cp.revenue) * 100, 2)
      ELSE 0 
    END as profit_margin,
    0 as conversion_rate,
    100 as customer_acquisition_cost,
    500 as customer_lifetime_value,
    4 as inventory_turnover,
    cp.ret_rate,
    tp.id,
    tp.title,
    tp.prod_revenue,
    CASE 
      WHEN pp.revenue > 0 THEN ROUND(((cp.revenue - pp.revenue) / pp.revenue) * 100, 2)
      ELSE 0 
    END as revenue_growth,
    CASE 
      WHEN pp.profit > 0 THEN ROUND(((cp.profit - pp.profit) / pp.profit) * 100, 2)
      ELSE 0 
    END as profit_growth,
    CASE 
      WHEN pp.orders > 0 THEN ROUND(((cp.orders - pp.orders)::NUMERIC / pp.orders) * 100, 2)
      ELSE 0 
    END as orders_growth
  FROM current_period cp
  CROSS JOIN prev_period pp
  LEFT JOIN top_prod tp ON true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Индекс для ускорения аналитики
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_analytics 
ON public.marketplace_orders(ordered_at, status, marketplace) 
WHERE status IN ('delivered', 'shipped', 'confirmed', 'returned', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_marketplace_products_analytics
ON public.marketplace_products(connection_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- RETURNS / ОБРАТНЫЕ ЗАЯВКИ — возвраты покупателей
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_returns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id              UUID NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  connection_id         UUID REFERENCES public.marketplace_connections(id) ON DELETE SET NULL,
  marketplace_order_id  VARCHAR NOT NULL,
  marketplace           VARCHAR NOT NULL,
  product_ids           UUID[] NOT NULL DEFAULT '{}',
  product_titles        TEXT[] NOT NULL DEFAULT '{}',
  reason                VARCHAR NOT NULL
                             CHECK (reason IN ('wrong_item','damaged','not_as_described','changed_mind','quality_issue','other')),
  reason_detail         TEXT,
  photos                TEXT[] NOT NULL DEFAULT '{}',
  status                VARCHAR NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','approved','rejected','shipped_to_warehouse','received','refunded','cancelled')),
  refund_amount         NUMERIC,
  refund_method         VARCHAR CHECK (refund_method IN ('card','e_wallet','original_payment','store_credit')),
  admin_comment         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрого поиска по user и order
CREATE INDEX IF NOT EXISTS idx_marketplace_returns_user
  ON public.marketplace_returns(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_order
  ON public.marketplace_returns(order_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_connection
  ON public.marketplace_returns(connection_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_returns_status
  ON public.marketplace_returns(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- MARKETPLACE_PRODUCTS — создание таблицы если не существует + shop_product_ids
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL REFERENCES public.marketplace_connections(id) ON DELETE CASCADE,
  marketplace_sku      VARCHAR NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  price                NUMERIC NOT NULL,
  old_price            NUMERIC,
  currency             VARCHAR DEFAULT 'RUB',
  barcode              VARCHAR,
  images               TEXT[] NOT NULL DEFAULT '{}',
  category_id          UUID,
  attributes           JSONB DEFAULT '{}',
  vat                  NUMERIC DEFAULT 20,
  weight_kg            NUMERIC,
  dimensions           JSONB,
  status               VARCHAR NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','inactive','blocked','deleted')),
  stock_sync           BOOLEAN DEFAULT true,
  price_sync           BOOLEAN DEFAULT true,
  sync_status          VARCHAR NOT NULL DEFAULT 'idle'
                            CHECK (sync_status IN ('idle','syncing','success','error')),
  shop_product_ids     UUID[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_connection
  ON public.marketplace_products(connection_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_sku
  ON public.marketplace_products(marketplace_sku);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_shop
  ON public.marketplace_products USING GIN(shop_product_ids);

-- RLS
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Владелец подключения управляет товарами"
  ON public.marketplace_products
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM public.marketplace_connections mc
      WHERE mc.id = marketplace_products.connection_id
    )
  );

CREATE POLICY "Все видят активные товары"
  ON public.marketplace_products
  FOR SELECT USING (status = 'active' OR auth.uid() IN (
    SELECT user_id FROM public.marketplace_connections mc
    WHERE mc.id = marketplace_products.connection_id
  ));

-- RLS для marketplace_returns

CREATE POLICY "Покупатель видит свои возвраты"
  ON public.marketplace_returns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Покупатель создаёт возврат только для своих заказов"
  ON public.marketplace_returns
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.shop_orders so
      WHERE so.id = marketplace_returns.order_id
        AND so.user_id = auth.uid()
    )
  );

CREATE POLICY "Покупатель обновляет только свои возвраты"
  ON public.marketplace_returns
  FOR UPDATE USING (auth.uid() = user_id);



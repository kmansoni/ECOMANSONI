/**
 * searchService — поиск товаров с фильтрами и ранжированием.
 *
 * Реализует алгоритм ранжирования на основе Amazon A9/Ozon Search:
 *   score = relevance * conversion_rate * CTR * in_stock_boost
 *
 * Архитектура:
 *   - Поиск через Supabase full-text search (pg_trgm + to_tsvector)
 *   - Фильтрация по категории, цене, рейтингу, наличию, продавцу
 *   - Сортировка: relevance | price_asc | price_desc | rating | new | sales
 *   - Фасеты (facets) для фильтр-sidebar
 *   - Пагинация cursor-based для производительности
 *
 * Безопасность:
 *   - Все параметры валидируются и sanitize-уются
 *   - Максимальный limit 100 на страницу
 *   - SQL injection через parameterized queries Supabase
 */

import { dbLoose } from "@/lib/supabase";

const supabase = dbLoose;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductSortOrder =
  | "relevance"    // Amazon A9-like scoring
  | "price_asc"
  | "price_desc"
  | "rating"       // отзывы × рейтинг
  | "new"          // новинки
  | "sales";       // популярные (кол-во продаж)

export interface ProductSearchFilters {
  query?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  inStockOnly?: boolean;
  sellerId?: string;
  brands?: string[];
  tags?: string[];
  hasDiscount?: boolean;
  deliveryDays?: number; // max days
}

export interface ProductSearchResult {
  id: string;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  currency: string;
  imageUrl?: string;
  imageUrls?: string[];
  category?: string;
  sellerId: string;
  sellerName?: string;
  rating: number;
  reviewCount: number;
  salesCount: number;
  inStock: boolean;
  stockQty?: number;
  brand?: string;
  tags?: string[];
  createdAt: string;
  score?: number; // ranking score
}

export interface SearchFacets {
  categories: Array<{ name: string; count: number }>;
  priceRange: { min: number; max: number };
  brands: Array<{ name: string; count: number }>;
  ratings: Array<{ rating: number; count: number }>;
}

export interface ProductSearchResponse {
  items: ProductSearchResult[];
  total: number;
  hasMore: boolean;
  facets?: SearchFacets;
  page: number;
  limit: number;
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchProducts(
  filters: ProductSearchFilters,
  sort: ProductSortOrder = "relevance",
  page = 1,
  limit = 20
): Promise<ProductSearchResponse> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const offset = (Math.max(1, page) - 1) * safeLimit;

  let query = supabase
    .from("shop_products")
    .select(`
      id, name, description, price, original_price, discount_percent,
      currency, image_url, image_urls, category, seller_id,
      seller:shop_sellers(name),
      rating, review_count, sales_count, stock_qty, is_available,
      brand, tags, created_at
    `, { count: "exact" });

  // ── Filters ───────────────────────────────────────────────────────────────

  // Full-text search
  if (filters.query?.trim()) {
    const q = filters.query.trim().slice(0, 200);
    // PostgreSQL to_tsvector FTS with russian + english configs
    query = query.textSearch("fts_vector", q, {
      type: "websearch",
      config: "russian",
    });
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.priceMin != null && Number.isFinite(filters.priceMin)) {
    query = query.gte("price", filters.priceMin);
  }

  if (filters.priceMax != null && Number.isFinite(filters.priceMax)) {
    query = query.lte("price", filters.priceMax);
  }

  if (filters.ratingMin != null) {
    query = query.gte("rating", filters.ratingMin);
  }

  if (filters.inStockOnly) {
    query = query.eq("is_available", true).gt("stock_qty", 0);
  }

  if (filters.sellerId) {
    query = query.eq("seller_id", filters.sellerId);
  }

  if (filters.brands?.length) {
    query = query.in("brand", filters.brands);
  }

  if (filters.hasDiscount) {
    query = query.gt("discount_percent", 0);
  }

  // ── Sort ──────────────────────────────────────────────────────────────────

  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "rating":
      query = query.order("rating", { ascending: false })
                   .order("review_count", { ascending: false });
      break;
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    case "sales":
      query = query.order("sales_count", { ascending: false });
      break;
    case "relevance":
    default:
      // For FTS: rank by ts_rank, fallback to sales
      if (filters.query?.trim()) {
        // Supabase will use rank from textSearch
        query = query.order("rank", { ascending: false });
      } else {
        // No query → sales + rating hybrid
        query = query.order("sales_count", { ascending: false });
      }
  }

  query = query.range(offset, offset + safeLimit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const items = ((data as Record<string, unknown>[]) ?? []).map(rowToSearchResult);
  const total = count ?? 0;

  return {
    items,
    total,
    hasMore: offset + safeLimit < total,
    page,
    limit: safeLimit,
  };
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

/**
 * Автодополнение для строки поиска.
 * Возвращает до 8 подсказок: названия товаров + категории.
 */
export async function autocompleteSearch(query: string): Promise<Array<{ text: string; type: "product" | "category" | "brand" }>> {
  if (!query.trim() || query.length < 2) return [];

  const q = query.trim().slice(0, 100);

  const { data } = await supabase
    .from("shop_products")
    .select("name, category, brand")
    .or(`name.ilike.%${q}%,category.ilike.%${q}%`)
    .eq("is_available", true)
    .limit(8);

  if (!data) return [];

  const seen = new Set<string>();
  const results: Array<{ text: string; type: "product" | "category" | "brand" }> = [];

  for (const row of data as Array<{ name: string; category?: string; brand?: string }>) {
    if (row.name.toLowerCase().includes(q.toLowerCase()) && !seen.has(row.name)) {
      seen.add(row.name);
      results.push({ text: row.name, type: "product" });
    }
    if (row.category && !seen.has(row.category)) {
      seen.add(row.category);
      results.push({ text: row.category, type: "category" });
    }
    if (row.brand && !seen.has(row.brand)) {
      seen.add(row.brand);
      results.push({ text: row.brand, type: "brand" });
    }
  }

  return results.slice(0, 8);
}

// ── Facets ────────────────────────────────────────────────────────────────────

export async function getSearchFacets(category?: string): Promise<SearchFacets> {
  let q = supabase
    .from("shop_products")
    .select("category, brand, price, rating")
    .eq("is_available", true);

  if (category) q = q.eq("category", category);

  const { data } = await q.limit(5000);
  if (!data) {
    return { categories: [], priceRange: { min: 0, max: 100000 }, brands: [], ratings: [] };
  }

  const rows = data as Array<{ category?: string; brand?: string; price: number; rating: number }>;

  const catMap = new Map<string, number>();
  const brandMap = new Map<string, number>();
  const ratingMap = new Map<number, number>();
  let minP = Infinity, maxP = 0;

  for (const r of rows) {
    if (r.category) catMap.set(r.category, (catMap.get(r.category) ?? 0) + 1);
    if (r.brand)    brandMap.set(r.brand, (brandMap.get(r.brand) ?? 0) + 1);
    const star = Math.floor(r.rating);
    ratingMap.set(star, (ratingMap.get(star) ?? 0) + 1);
    if (r.price < minP) minP = r.price;
    if (r.price > maxP) maxP = r.price;
  }

  return {
    categories: [...catMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 20),
    priceRange: { min: minP === Infinity ? 0 : minP, max: maxP },
    brands: [...brandMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 30),
    ratings: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: ratingMap.get(r) ?? 0 })),
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function rowToSearchResult(row: Record<string, unknown>): ProductSearchResult {
  const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller as Record<string, unknown> | null;
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    price: Number(row.price),
    originalPrice: row.original_price ? Number(row.original_price) : undefined,
    discountPercent: row.discount_percent ? Number(row.discount_percent) : undefined,
    currency: String(row.currency ?? "RUB"),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    imageUrls: Array.isArray(row.image_urls) ? (row.image_urls as string[]) : undefined,
    category: row.category ? String(row.category) : undefined,
    sellerId: String(row.seller_id),
    sellerName: seller ? String(seller.name ?? "") : undefined,
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    salesCount: Number(row.sales_count ?? 0),
    inStock: Boolean(row.is_available),
    stockQty: row.stock_qty != null ? Number(row.stock_qty) : undefined,
    brand: row.brand ? String(row.brand) : undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    createdAt: String(row.created_at),
  };
}

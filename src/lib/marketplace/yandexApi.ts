import axios from 'axios';
import { logger } from '@/lib/logger';
import { MarketplaceOrder, MarketplaceProduct, MarketplaceStock } from './marketplaceApi';

const YANDEX_API_BASE = 'https://api.partner.market.yandex.ru';

interface YandexClientOptions {
  apiKey: string;
  businessId: string;
  campaignId: string;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class YandexClient {
  private apiKey: string;
  private businessId: string;
  private campaignId: string;

  constructor({ apiKey, businessId, campaignId }: YandexClientOptions) {
    this.apiKey = apiKey;
    this.businessId = businessId;
    this.campaignId = campaignId;
  }

  private async request<T>(method: HttpMethod, path: string, payload?: unknown): Promise<T> {
    try {
      const isGet = method === 'GET';
      const response = await axios({
        method,
        url: `${YANDEX_API_BASE}${path}`,
        params: isGet ? payload : undefined,
        data: isGet ? undefined : payload,
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return response.data as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Yandex API] Ошибка запроса', { method, path, error: message });
      throw error;
    }
  }

  async getProducts(limit = 100, pageToken?: string) {
    const params: Record<string, string | number> = { limit };
    if (pageToken) {
      params.page_token = pageToken;
    }

    const data = await this.request<{ result?: { offers?: unknown[] } }>(
      'GET',
      `/campaigns/${this.campaignId}/offers`,
      params,
    );

    return data.result?.offers ?? [];
  }

  async getProduct(offerId: string) {
    const data = await this.request<{ result?: unknown }>(
      'GET',
      `/campaigns/${this.campaignId}/offers/${offerId}`,
    );

    return data.result ?? null;
  }

  async getStocks() {
    const data = await this.request<{ result?: { warehouses?: unknown[] } }>(
      'GET',
      `/campaigns/${this.campaignId}/offers/stocks`,
    );

    return data.result?.warehouses ?? [];
  }

  async updateStock(offerId: string, count: number) {
    const data = await this.request<{ result?: unknown }>(
      'POST',
      `/campaigns/${this.campaignId}/offers/stocks`,
      {
        skus: [
          {
            offerId,
            warehouseId: this.businessId,
            items: [
              {
                type: 'FIT',
                count,
              },
            ],
          },
        ],
      },
    );

    return data.result ?? null;
  }

  async updatePrice(offerId: string, price: number, currencyId = 'RUR', discountBase = 0) {
    const data = await this.request<{ result?: unknown }>(
      'POST',
      `/businesses/${this.businessId}/offer-mappings/update`,
      {
        offerMappings: [
          {
            offer: {
              offerId,
              basicPrice: {
                value: price,
                currencyId,
              },
              discountBase: {
                value: discountBase,
                currencyId,
              },
            },
          },
        ],
      },
    );

    return data.result ?? null;
  }

  async getOrders(status?: string) {
    const payload = status ? { status } : undefined;
    const data = await this.request<{ result?: { orders?: unknown[] } }>(
      'GET',
      `/campaigns/${this.campaignId}/orders`,
      payload,
    );

    return data.result?.orders ?? [];
  }

  async getOrder(orderId: number | string) {
    const data = await this.request<{ result?: unknown }>(
      'GET',
      `/campaigns/${this.campaignId}/orders/${orderId}`,
    );

    return data.result ?? null;
  }
}

export function convertYandexProductToMarketplace(product: any, connectionId: string): Partial<MarketplaceProduct> {
  return {
    connection_id: connectionId,
    marketplace_sku: product.offerId || product.shopSku || '',
    marketplace_product_id: String(product.id || product.marketSku || ''),
    title: product.name || product.title || '',
    description: product.description || '',
    price: Number(product.price?.value || product.basicPrice?.value || 0),
    currency: product.price?.currencyId || 'RUB',
    images: Array.isArray(product.pictures) ? product.pictures.map((p: any) => p.url || p) : [],
    barcode: product.barcode || product.vendorCode,
    vat: Number(product.vat || 20),
    status: 'active',
    stock_sync: true,
    price_sync: true,
    sync_status: 'success',
  };
}

export function convertYandexOrderToMarketplace(order: any, connectionId: string): Partial<MarketplaceOrder> {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemTotal = items.reduce(
    (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.count || 0),
    0,
  );

  return {
    connection_id: connectionId,
    marketplace_order_id: String(order.id || ''),
    marketplace: 'ozon',
    status: convertYandexOrderStatus(order.status),
    order_items: items.map((item: any) => ({
      sku: item.offerId || item.shopSku || '',
      name: item.offerName || item.name || 'Товар',
      quantity: Number(item.count || 1),
      price: Number(item.price || 0),
      currency: 'RUB',
    })),
    customer: {
      name: [order.buyer?.lastName, order.buyer?.firstName].filter(Boolean).join(' ') || 'Покупатель',
      phone: order.delivery?.phone || '',
      email: order.buyer?.email || '',
    },
    delivery_address: {
      full_name: order.delivery?.recipient || 'Покупатель',
      city: order.delivery?.region?.name || '',
      street: order.delivery?.address?.street || '',
      building: order.delivery?.address?.house || '',
      apartment: order.delivery?.address?.apartment || '',
      postal_code: order.delivery?.address?.postcode || '',
      country: 'RU',
    },
    delivery_method: 'courier',
    delivery_cost: Number(order.delivery?.price || 0),
    items_total: itemTotal,
    total_amount: Number(order.payment?.total || itemTotal),
    currency: 'RUB',
    payment_method: order.paymentType === 'PREPAID' ? 'prepaid' : 'card',
    payment_status: convertYandexPaymentStatus(order.paymentStatus),
    ordered_at: order.creationDate || new Date().toISOString(),
    tracking_number: order.delivery?.parcels?.[0]?.tracks?.[0]?.trackCode,
    requires_pvz: Boolean(order.delivery?.outletCode),
    pvz_code: order.delivery?.outletCode,
    sync_status: 'success',
  };
}

export function convertYandexStockToMarketplace(stock: any, productId: string): Partial<MarketplaceStock> {
  return {
    marketplace_product_id: productId,
    sku: stock.offerId || stock.shopSku || productId,
    warehouse_id: stock.warehouseId || stock.warehouse?.id,
    warehouse_name: stock.warehouseName || stock.warehouse?.name,
    quantity: Number(stock.count || stock.fit || 0),
    reserved: Number(stock.reserve || 0),
    available: Number(stock.available || stock.count || 0),
    sync_status: 'success',
  };
}

function convertYandexOrderStatus(status?: string): MarketplaceOrder['status'] {
  const map: Record<string, MarketplaceOrder['status']> = {
    PROCESSING: 'pending',
    RESERVED: 'confirmed',
    UNPAID: 'pending',
    DELIVERY: 'shipped',
    PICKUP: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    RETURNED: 'returned',
  };

  return map[String(status || '').toUpperCase()] ?? 'pending';
}

function convertYandexPaymentStatus(status?: string): MarketplaceOrder['payment_status'] {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAID') return 'paid';
  if (normalized === 'REFUNDED') return 'refunded';
  return 'pending';
}
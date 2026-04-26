import axios from 'axios';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { MarketplaceConnection, MarketplaceProduct, MarketplaceOrder, MarketplaceStock } from './marketplaceApi';

const OZON_API_BASE = {
  v1: 'https://api-seller.ozon.ru',
  v2: 'https://api-seller.ozon.ru/v2',
};

interface OzonClientOptions {
  apiKey: string;
  clientId: string;
}

export class OzonClient {
  private apiKey: string;
  private clientId: string;

  constructor({ apiKey, clientId }: OzonClientOptions) {
    this.apiKey = apiKey;
    this.clientId = clientId;
  }

  private async request<T>(method: string, path: string, data?: any): Promise<T> {
    try {
      const response = await axios.post(`${OZON_API_BASE.v2}${path}`, data, {
        headers: {
          'Client-Id': this.clientId,
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      logger.error('[Ozon API] Ошибка запроса', { method, path, error: error.message });
      throw error;
    }
  }

  // =================================================================
  // ТОВАРЫ
  // =================================================================

  async getProducts(limit = 100, lastId?: string) {
    const data = await this.request<any>('POST', '/v2/product/list', {
      filter: { visibility: 'ALL' },
      limit,
      last_id: lastId,
    });
    return data.result.items || [];
  }

  async getProductInfo(offerId: string) {
    const data = await this.request<any>('POST', '/v2/product/info', {
      offer_id: offerId,
    });
    return data.result;
  }

  async getProductPrices(offerIds: string[]) {
    const data = await this.request<any>('POST', '/v2/product/info/prices', {
      offer_ids: offerIds,
    });
    return data.result || [];
  }

  async getProductStocks(offerIds: string[]) {
    const data = await this.request<any>('POST', '/v2/product/info/stocks', {
      offer_ids: offerIds,
    });
    return data.result || [];
  }

  async createProduct(product: Partial<MarketplaceProduct>) {
    const data = await this.request<any>('POST', '/v2/product/import', {
      items: [{
        offer_id: product.marketplace_sku,
        product_id: product.marketplace_product_id,
        name: product.title,
        description: product.description,
        price: product.price,
        vat: product.vat || 20,
        weight: product.weight_kg,
        dimension: product.dimensions,
        images: product.images.map(img => ({ link: img })),
        ...(product.barcode && { barcode: product.barcode }),
      }],
    });
    return data.result || [];
  }

  async updateProduct(product: Partial<MarketplaceProduct>) {
    const data = await this.request<any>('POST', '/v2/product/update', {
      items: [{
        offer_id: product.marketplace_sku,
        product_id: product.marketplace_product_id,
        name: product.title,
        description: product.description,
        price: product.price,
        vat: product.vat,
        weight: product.weight_kg,
        dimension: product.dimensions,
        images: product.images?.map(img => ({ link: img })),
        ...(product.barcode && { barcode: product.barcode }),
      }],
    });
    return data.result || [];
  }

  async updatePrices(prices: Array<{ offer_id: string; price: number; old_price?: number; auto_action?: boolean }>) {
    const data = await this.request<any>('POST', '/v2/product/update/prices', {
      prices,
    });
    return data.result || [];
  }

  async updateStocks(stocks: Array<{
    offer_id: string;
    warehouse_id: string;
    items: Array<{
      type: 'FIT' | 'PREPARE' | 'RESERVED' | 'RTV';
      quantity: number;
    }>;
  }>) {
    const data = await this.request<any>('POST', '/v2/product/update/stocks', {
      stocks,
    });
    return data.result || [];
  }

  // =================================================================
  // ЗАКАЗЫ
  // =================================================================

  async getOrders({
    since,
    to,
    status,
    limit = 100,
  }: {
    since?: string;
    to?: string;
    status?: 'awaiting_packaging' | 'awaiting_deliver' | 'delivering' | 'delivered' | 'cancelled';
    limit?: number;
  }) {
    const data = await this.request<any>('POST', '/v3/posting/fbs/list', {
      dir: 'desc',
      filter: {
        ...(since && { since }),
        ...(to && { to }),
        ...(status && { status }),
      },
      limit,
    });
    return data.result?.postings || [];
  }

  async getOrderInfo(postingNumber: string) {
    const data = await this.request<any>('POST', '/v3/posting/fbs/get', {
      posting_number: postingNumber,
    });
    return data.result;
  }

  async shipOrder(postingNumber: string, items: Array<{ id: string; quantity: number }>) {
    const data = await this.request<any>('POST', '/v3/posting/fbs/ship', {
      posting_number: postingNumber,
      items,
    });
    return data.result;
  }

  async cancelOrder(postingNumber: string, reason: string) {
    const data = await this.request<any>('POST', '/v3/posting/fbs/cancel', {
      posting_number: postingNumber,
      reason,
    });
    return data.result;
  }

  // =================================================================
  // АНАЛИТИКА
  // =================================================================

  async getAnalyticsProducts(dateFrom: string, dateTo: string, offerIds?: string[]) {
    const data = await this.request<any>('POST', '/v1/report/product/info', {
      date_from: dateFrom,
      date_to: dateTo,
      offer_ids: offerIds,
    });
    return data.result || [];
  }

  async getWarehouses() {
    const data = await this.request<any>('POST', '/v2/warehouse/list', {});
    return data.result?.warehouses || [];
  }
}

// =================================================================
// ХЭЛПЕРЫ
// =================================================================

export function convertOzonProductToMarketplace(product: any, connectionId: string): Partial<MarketplaceProduct> {
  return {
    connection_id: connectionId,
    marketplace_sku: product.offer_id,
    marketplace_product_id: product.product_id,
    title: product.name,
    description: product.description,
    price: product.price,
    currency: 'RUB',
    images: (product.images || []).map((img: any) => typeof img === 'string' ? img : img.link),
    barcode: product.barcode,
    vat: product.vat,
    weight_kg: product.weight,
    dimensions: product.dimension,
    status: 'active',
    stock_sync: true,
    price_sync: true,
    sync_status: 'success',
  };
}

export function convertOzonOrderToMarketplace(order: any, connectionId: string): Partial<MarketplaceOrder> {
  return {
    connection_id: connectionId,
    marketplace_order_id: order.posting_number,
    marketplace: 'ozon',
    status: convertOzonStatus(order.status),
    order_items: (order.items || []).map((item: any) => ({
      sku: item.offer_id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      currency: 'RUB',
    })),
    customer: {
      name: order.delivery?.address?.name || '',
      phone: order.delivery?.address?.phone || '',
      email: order.delivery?.address?.email || '',
    },
    delivery_address: {
      full_name: order.delivery?.address?.name || '',
      city: order.delivery?.address?.city || '',
      street: order.delivery?.address?.street || '',
      building: order.delivery?.address?.house || '',
      apartment: order.delivery?.address?.apartment || '',
      postal_code: order.delivery?.address?.zip_code || '',
      country: order.delivery?.address?.country || 'RU',
    },
    delivery_method: 'courier',
    delivery_cost: order.delivery?.delivery_sum || 0,
    items_total: order.items?.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0) || 0,
    total_amount: order.total_amount || 0,
    currency: 'RUB',
    payment_method: order.payment?.type === 'prepaid' ? 'prepaid' : 'card',
    payment_status: convertPaymentStatus(order.status),
    ordered_at: order.created_at,
    tracking_number: order.delivery?.tracking_number,
    requires_pvz: !!order.delivery?.pvz_code,
    pvz_code: order.delivery?.pvz_code,
    sync_status: 'success',
  };
}

function convertOzonStatus(status: string): MarketplaceOrder['status'] {
  const map: Record<string, MarketplaceOrder['status']> = {
    awaiting_packaging: 'pending',
    awaiting_deliver: 'confirmed',
    delivering: 'shipped',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  return map[status] || 'pending';
}

function convertPaymentStatus(status: string): MarketplaceOrder['payment_status'] {
  if (status.includes('paid') || status === 'delivered') return 'paid';
  if (status === 'cancelled') return 'refunded';
  return 'pending';
}

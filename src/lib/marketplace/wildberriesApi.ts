import axios from 'axios';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { MarketplaceProduct, MarketplaceOrder, MarketplaceStock } from './marketplaceApi';

const WB_API_BASE = 'https://discounts-prices-api.wildberries.ru';
const WB_STAT_API = 'https://statistics-api.wildberries.ru';
const WB_CONTENT_API = 'https://content-api.wildberries.ru';

interface WBClientOptions {
  apiKey: string;
}

/**
 * Wildberries API клиент (v2/nm)
 * https://openapi.wb.ru/
 */
export class WildberriesClient {
  private apiKey: string;

  constructor({ apiKey }: WBClientOptions) {
    this.apiKey = apiKey;
  }

  private async request<T>(method: string, url: string, data?: any): Promise<T> {
    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      logger.error('[WB API] Ошибка запроса', { method, url, error: error.message });
      throw error;
    }
  }

  // =================================================================
  // ТОВАРЫ (Content API)
  // =================================================================

  async getProducts(limit = 100, offset = 0) {
    const data = await this.request<any>('POST', `${WB_CONTENT_API}/content/v1/cards/list`, {
      settings: { limit, offset },
    });
    return data.data?.cards || [];
  }

  async getProductByBarcode(barcode: string) {
    const data = await this.request<any>('POST', `${WB_CONTENT_API}/content/v1/cards/filter`, {
      filter: { barcodes: [barcode] },
    });
    return data.data?.cards?.[0];
  }

  async getProductImgs(imtId: number) {
    const data = await this.request<any>('GET', `${WB_CONTENT_API}/content/v1/cards/media?imtId=${imtId}`);
    return data.data || [];
  }

  async updatePrice(prices: Array<{
    nmId: number;
    price: number;
    discount?: number;
    techSizeName?: string;
  }>) {
    const data = await this.request<any>('PUT', `${WB_CONTENT_API}/content/v1/prices`, {
      data: prices,
    });
    return data.data || [];
  }

  async updateDiscounts(discounts: Array<{
    nmId: number;
    discount: number;
    techSizeName?: string;
  }>) {
    const data = await this.request<any>('PUT', `${WB_CONTENT_API}/content/v1/discounts`, {
      data: discounts,
    });
    return data.data || [];
  }

  // =================================================================
  // ОСТАТКИ (Prices & Stocks API)
  // =================================================================

  async getStocks(warehouseIds: string[]) {
    const data = await this.request<any>('POST', `${WB_API_BASE}/api/v2/stocks`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      warehouseList: warehouseIds,
    });
    return data.data || [];
  }

  async updateStocks(stocks: Array<{
    nmId: number;
    techSizeName?: string;
    quantity: number;
    warehouseId: string;
  }>) {
    const data = await this.request<any>('PUT', `${WB_API_BASE}/api/v2/stocks`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      stocks: stocks.map(s => ({
        nmId: s.nmId,
        techSizeName: s.techSizeName,
        quantity: s.quantity,
        warehouseId: s.warehouseId,
      })),
    });
    return data.data || [];
  }

  // =================================================================
  // ЗАКАЗЫ (Order API)
  // =================================================================

  async getOrders({
    dateFrom,
    dateTo,
    status,
    take = 100,
  }: {
    dateFrom: string;
    dateTo?: string;
    status?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
    take?: number;
  }) {
    const data = await this.request<any>('GET', `${WB_API_BASE}/api/v2/orders`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      dateFrom,
      ...(dateTo && { dateTo }),
      ...(status !== undefined && { status }),
      take,
    });
    return data.orders || [];
  }

  async getOrderDetails(orderId: number) {
    const data = await this.request<any>('GET', `${WB_API_BASE}/api/v2/orders/${orderId}`, {
      apiKey: this.apiKey,
      ts: Date.now(),
    });
    return data.order || null;
  }

  async setOrderStatus(orderId: number, status: number) {
    const data = await this.request<any>('PUT', `${WB_API_BASE}/api/v2/orders/status`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      orderId,
      status,
    });
    return data;
  }

  // =================================================================
  // СТОКИ (Stocks API - новые статусы)
  // =================================================================

  async getStockStatuses(warehouseIds: number[]) {
    const data = await this.request<any>('POST', `${WB_API_BASE}/api/v3/stocks`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      warehouseIds,
    });
    return data.data || [];
  }

  // =================================================================
  // АНАЛИТИКА (Statistics API)
  // =================================================================

  async getSalesReport(dateFrom: string, dateTo: string) {
    const data = await this.request<any>('GET', `${WB_STAT_API}/api/v1/supplier/sales`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      dateFrom,
      dateTo: dateTo,
      limit: 100000,
      rrd: 1,
    });
    return data.data || [];
  }

  async getReportDetailByTk(dateFrom: string, dateTo: string) {
    const data = await this.request<any>('GET', `${WB_STAT_API}/api/v1/supplier/reportDetailByTk`, {
      apiKey: this.apiKey,
      ts: Date.now(),
      dateFrom,
      dateTo,
      limit: 100000,
    });
    return data.data || [];
  }
}

// =================================================================
// ХЭЛПЕРЫ ПРЕОБРАЗОВАНИЯ
// =================================================================

export function convertWBProductToMarketplace(product: any, connectionId: string): Partial<MarketplaceProduct> {
  const card = product.card || {};
  const description = card.description || '';
  const media = card.media || [];

  return {
    connection_id: connectionId,
    marketplace_sku: product.nmId?.toString() || product.vendorCode || '',
    marketplace_product_id: product.id?.toString(),
    title: card.name || product.subjectName || '',
    description: description.replace(/<[^>]*>/g, '').substring(0, 1000),
    price: product.price || 0,
    currency: 'RUB',
    images: media.filter((m: any) => m.type === 'photo').map((m: any) => m.url || m.name),
    barcode: product.barcode,
    vat: 20,
    weight_kg: product?.dimensions?.weight || 0,
    dimensions: product?.dimensions ? {
      length: product.dimensions.length || 0,
      width: product.dimensions.width || 0,
      height: product.dimensions.height || 0,
    } : undefined,
    status: 'active',
    stock_sync: true,
    price_sync: true,
    sync_status: 'success',
  };
}

export function convertWBOrderToMarketplace(order: any, connectionId: string): Partial<MarketplaceOrder> {
  const price = order.priceWithDisc || order.finishedPrice || 0;
  const totalAmount = order.totalPrice || 0;

  return {
    connection_id: connectionId,
    marketplace_order_id: order.orderId?.toString() || order.srid || '',
    marketplace: 'wildberries',
    status: convertWBStatus(order.status),
    order_items: (order.items || []).map((item: any) => ({
      sku: item.nmId?.toString() || item.techSize || '',
      name: item.subject || 'Товар',
      quantity: item.quantity || 1,
      price: item.price || 0,
      currency: 'RUB',
    })),
    customer: {
      name: `${order.firstName || ''} ${order.lastName || ''}`.trim() || order.userName || '',
      phone: order.phone || '',
      email: '',
    },
    delivery_address: {
      full_name: order.recipientName || '',
      city: order.city || '',
      street: order.street || '',
      building: order.house || '',
      apartment: order.flat || '',
      postal_code: order.postalCode || '',
      country: 'RU',
    },
    delivery_method: convertDeliveryType(order.deliveryType),
    delivery_cost: order.deliveryAmount || 0,
    items_total: price,
    total_amount: totalAmount,
    currency: 'RUB',
    payment_method: order.paymentMethod || order.paymentType === 'full_prepay' ? 'prepaid' : 'card',
    payment_status: convertWBPaymentStatus(order.status),
    ordered_at: order.date || new Date().toISOString(),
    tracking_number: order.chrtId?.toString(),
    requires_pvz: order.isExpressDelivery || false,
    pvz_code: order.pvzCode,
    sync_status: 'success',
  };
}

function convertWBStatus(status: number): MarketplaceOrder['status'] {
  const map: Record<number, MarketplaceOrder['status']> = {
    0: 'pending',
    1: 'confirmed',
    2: 'packed',
    3: 'shipped',
    8: 'delivered',
    9: 'cancelled',
    10: 'cancelled',
    11: 'cancelled',
    12: 'returned',
  };
  return map[status] || 'pending';
}

function convertWBPaymentStatus(status: number): MarketplaceOrder['payment_status'] {
  if ([8, 12].includes(status)) return 'paid';
  if ([9, 10, 11].includes(status)) return 'refunded';
  return 'pending';
}

function convertDeliveryType(type: number): MarketplaceOrder['delivery_method'] {
  if (type === 1) return 'courier';
  if (type === 2) return 'pickup';
  return 'post';
}

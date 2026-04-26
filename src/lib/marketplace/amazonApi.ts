import axios from 'axios';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { MarketplaceProduct, MarketplaceOrder, MarketplaceStock } from './marketplaceApi';

const AMAZON_API_BASE = 'https://sellingpartnerapi-na.amazon.com';

interface AmazonClientOptions {
  accessToken: string;
  sellerId: string;
  developerId: string;
}

/**
 * Amazon SP API клиент (REST)
 * https://developer-docs.amazon.com/sp-api/
 */
export class AmazonClient {
  private accessToken: string;
  private sellerId: string;
  private developerId: string;

  constructor({ accessToken, sellerId, developerId }: AmazonClientOptions) {
    this.accessToken = accessToken;
    this.sellerId = sellerId;
    this.developerId = developerId;
  }

  private async request<T>(method: string, path: string, data?: any): Promise<T> {
    try {
      const response = await axios({
        method,
        url: `${AMAZON_API_BASE}${path}`,
        data,
        headers: {
          'x-amz-access-token': this.accessToken,
          'x-amz-date': new Date().toISOString(),
          'Content-Type': 'application/json',
          'User-Agent': 'Mansoni-Marketplace/1.0',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      logger.error('[Amazon API] Ошибка запроса', { method, path, error: error.message });
      throw error;
    }
  }

  // =================================================================
  // ТОВАРЫ (Catalog Items & Listings)
  // =================================================================

  async getProducts(marketplaceIds: string[] = ['A2Q3Y263D00K49']) {
    const data = await this.request<any>('GET', `/catalog/2022-04-01/items?marketplaceIds=${marketplaceIds.join(',')}`);
    return data.payload || [];
  }

  async getProduct(asin: string, marketplaceId = 'A2Q3Y263D00K49') {
    const data = await this.request<any>('GET', `/catalog/2022-04-01/items/${asin}?marketplaceIds=${marketplaceId}`);
    return data.payload || null;
  }

  async getListings(sellerId: string, skus: string[]) {
    const data = await this.request<any>('GET', `/listings/2021-08-01/items?sellerId=${sellerId}&skus=${skus.join(',')}`);
    return data.payload || [];
  }

  async putListing(sku: string, product: Partial<MarketplaceProduct>) {
    const data = await this.request<any>('PUT', `/listings/2021-08-01/items/${sku}`, {
      productType: 'PRODUCT',
      requirements: 'LISTING',
      attributes: {
        title: [{ value: product.title }],
        description: [{ value: product.description }],
        bullet_point: (product.description || '').split('.').map((p: string) => ({ value: p.trim() })),
        generic_keywords: product.title.split(' ').map((k: string) => ({ value: k })),
        ...(product.price && { price: { amount: product.price, currencyCode: product.currency || 'USD' } }),
        ...(product.weight_kg && { item_weight: { value: product.weight_kg, unit: 'kilograms' } }),
      },
    });
    return data.payload || [];
  }

  async updatePrice(sku: string, price: number, currency = 'USD') {
    const data = await this.request<any>('PUT', `/listings/2021-08-01/items/${sku}/price`, {
      price: {
        amount: price,
        currencyCode: currency,
      },
    });
    return data;
  }

  // =================================================================
  // ОСТАТКИ (FBA Inventory)
  // =================================================================

  async getFbaInventory(marketplaceId = 'A2Q3Y263D00K49') {
    const data = await this.request<any>('GET', `/fba/inventory/2024-09-01/items?sellerSkus=&marketplaceIds=${marketplaceId}`);
    return data.payload?.inventorySummaries || [];
  }

  async updateFbaInventory(sku: string, quantity: number, warehouseId: string) {
    const data = await this.request<any>('PUT', `/fba/inventory/2024-09-01/items/${sku}`, {
      inventoryDetails: {
        quantity,
        warehouseId,
      },
    });
    return data;
  }

  // =================================================================
  // ЗАКАЗЫ (Orders)
  // =================================================================

  async getOrders({
    createdAfter,
    createdBefore,
    orderStatuses,
    marketplaceIds = ['A2Q3Y263D00K49'],
  }: {
    createdAfter?: string;
    createdBefore?: string;
    orderStatuses?: string[];
    marketplaceIds?: string[];
  }) {
    const params = new URLSearchParams({
      marketplaceIds: marketplaceIds.join(','),
      ...(createdAfter && { createdAfter }),
      ...(createdBefore && { createdBefore }),
      ...(orderStatuses && { orderStatuses: orderStatuses.join(',') }),
    });

    const data = await this.request<any>('GET', `/orders/2020-09-01/orders?${params}`);
    return data.payload || [];
  }

  async getOrder(orderId: string) {
    const data = await this.request<any>('GET', `/orders/2020-09-01/orders/${orderId}`);
    return data.payload || null;
  }

  async getOrderItems(orderId: string) {
    const data = await this.request<any>('GET', `/orders/2020-09-01/orders/${orderId}/orderItems`);
    return data.payload || [];
  }

  async confirmShipment(orderId: string, trackingNumber: string, carrier = 'USPS') {
    const data = await this.request<any>('POST', `/orders/2020-09-01/orders/${orderId}/shipment`, {
      trackingNumber,
      carrier,
    });
    return data;
  }

  // =================================================================
  // ФУНКЦИИ ФУЛФИЛМЕНТА (Fulfillment)
  // =================================================================

  async createFulfillmentOrder(order: any) {
    const data = await this.request<any>('POST', '/fba/fulfillment/2020-09-01/fulfillmentOrders', {
      ...order,
    });
    return data.payload || null;
  }

  async getFulfillmentOrder(orderId: string) {
    const data = await this.request<any>('GET', `/fba/fulfillment/2020-09-01/fulfillmentOrders/${orderId}`);
    return data.payload || null;
  }
}

// =================================================================
// ХЭЛПЕРЫ ПРЕОБРАЗОВАНИЯ
// =================================================================

export function convertAmazonProductToMarketplace(product: any, connectionId: string): Partial<MarketplaceProduct> {
  const identifiers = product.identifiers || {};
  const attributes = product.attributes || {};

  return {
    connection_id: connectionId,
    marketplace_sku: identifiers.sellerSKU || '',
    marketplace_product_id: identifiers.asin,
    title: attributes.title?.[0]?.value || '',
    description: attributes.description?.[0]?.value || '',
    price: attributes.price?.[0]?.amount || 0,
    currency: attributes.price?.[0]?.currencyCode || 'USD',
    images: attributes.imageURL?.[0]?.value ? [attributes.imageURL[0].value] : [],
    barcode: identifiers.gtin?.[0] || '',
    vat: 0,
    weight_kg: attributes.itemWeight?.[0]?.value || 0,
    status: 'active',
    stock_sync: true,
    price_sync: true,
    sync_status: 'success',
  };
}

export function convertAmazonOrderToMarketplace(order: any, connectionId: string): Partial<MarketplaceOrder> {
  const purchaseInfo = order.purchaseInformation || {};
  const paymentInfo = order.paymentInformation || {};
  const shipping = order.shipping || {};

  return {
    connection_id: connectionId,
    marketplace_order_id: order.amazonOrderId,
    marketplace: 'amazon',
    status: convertAmazonStatus(order.orderStatus),
    order_items: (order.orderItems || []).map((item: any) => ({
      sku: item.sellerSKU,
      name: item.title,
      quantity: item.quantityOrdered,
      price: purchaseInfo.itemPrice?.[0]?.amount || 0,
      currency: purchaseInfo.itemPrice?.[0]?.currencyCode || 'USD',
    })),
    customer: {
      name: shipping.name?.name || '',
      phone: shipping.phone?.phoneNumber || '',
      email: order.buyerInfo?.buyerEmailAddress || '',
    },
    delivery_address: {
      full_name: shipping.name?.name || '',
      city: shipping.address?.city || '',
      street: shipping.address?.addressLine1 || '',
      building: '',
      apartment: shipping.address?.addressLine2 || '',
      postal_code: shipping.address?.postalCode || '',
      country: shipping.address?.countryCode || 'US',
    },
    delivery_method: 'courier',
    delivery_cost: shipping.amount?.amount || 0,
    items_total: purchaseInfo.itemPrice?.[0]?.amount || 0,
    total_amount: purchaseInfo.totalPrice?.[0]?.amount || 0,
    currency: purchaseInfo.totalPrice?.[0]?.currencyCode || 'USD',
    payment_method: 'card',
    payment_status: convertAmazonPaymentStatus(order.orderStatus),
    ordered_at: order.purchaseDate || new Date().toISOString(),
    tracking_number: order.fulfillmentData?.fulfillmentChannel || '',
    requires_pvz: false,
    sync_status: 'success',
  };
}

function convertAmazonStatus(status: string): MarketplaceOrder['status'] {
  const map: Record<string, MarketplaceOrder['status']> = {
    Pending: 'pending',
    Unshipped: 'pending',
    PartiallyShipped: 'shipped',
    Shipped: 'shipped',
    Delivered: 'delivered',
    Canceled: 'cancelled',
    Unfulfillable: 'cancelled',
  };
  return map[status] || 'pending';
}

function convertAmazonPaymentStatus(status: string): MarketplaceOrder['payment_status'] {
  if (status === 'Delivered') return 'paid';
  if (status === 'Canceled') return 'refunded';
  return 'pending';
}

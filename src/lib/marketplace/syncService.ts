import { logger } from '@/lib/logger';
import type { MarketplaceConnection } from './marketplaceApi';
import { OzonClient } from './ozonApi';
import { WildberriesClient } from './wildberriesApi';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

export class MarketplaceSyncService {
  private readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 минут
  private timers: NodeJS.Timeout[] = [];

  async syncConnection(connection: MarketplaceConnection): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    try {
      switch (connection.marketplace_type) {
        case 'ozon':
          await this.syncOzon(connection, result);
          break;
        case 'wildberries':
          await this.syncWildberries(connection, result);
          break;
        default:
          result.success = false;
          result.errors.push(`Неподдерживаемый маркетплейс: ${connection.marketplace_type}`);
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      logger.error('[SyncService] Ошибка синхронизации', { connection: connection.id, error: error.message });
    }

    return result;
  }

  private async syncOzon(connection: MarketplaceConnection, result: SyncResult) {
    const client = new OzonClient({
      apiKey: connection.api_key,
      clientId: connection.seller_id,
    });

    // Синхронизация товаров
    try {
      const products = await client.getProducts(1000);
      result.synced += products.length;
      
      // Обновление цен и остатков
      for (const product of products) {
        try {
          const prices = await client.getProductPrices([product.offer_id]);
          const stocks = await client.getProductStocks([product.offer_id]);
          // Здесь логика обновления в БД
        } catch (e) {
          result.failed++;
          result.errors.push(`Ошибка синхронизации товара ${product.offer_id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.success = false;
      result.errors.push(`Ошибка получения товаров Ozon: ${e.message}`);
    }

    // Синхронизация заказов
    try {
      const orders = await client.getOrders({
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        limit: 1000,
      });
      result.synced += orders.length;
      // Здесь логика сохранения заказов в БД
    } catch (e: any) {
      logger.warn('[SyncService] Ошибка синхронизации заказов Ozon', { error: e.message });
    }
  }

  private async syncWildberries(connection: MarketplaceConnection, result: SyncResult) {
    const client = new WildberriesClient({
      apiKey: connection.api_key,
    });

    // Синхронизация товаров
    try {
      const products = await client.getProducts(1000, 0);
      result.synced += products.length;
      
      // Обновление цен и остатков
      for (const product of products) {
        try {
          const stocks = await client.getStocks(['default']);
          // Здесь логика обновления в БД
        } catch (e) {
          result.failed++;
          result.errors.push(`Ошибка синхронизации товара ${product.nmId}: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.success = false;
      result.errors.push(`Ошибка получения товаров Wildberries: ${e.message}`);
    }

    // Синхронизация заказов
    try {
      const orders = await client.getOrders({
        dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        take: 1000,
      });
      result.synced += orders.length;
      // Здесь логика сохранения заказов в БД
    } catch (e: any) {
      logger.warn('[SyncService] Ошибка синхронизации заказов Wildberries', { error: e.message });
    }
  }

  async syncInternalShopWithMarketplace(connection: MarketplaceConnection, shopProductId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    // Здесь логика синхронизации внутреннего товара с маркетплейсом
    // 1. Получаем товар из useShop
    // 2. Создаем/обновляем товар на маркетплейсе
    // 3. Синхронизируем остатки и цены

    return result;
  }

  startAutoSync(connections: MarketplaceConnection[]) {
    // Останавливаем предыдущие таймеры
    this.stopAutoSync();

    // Запускаем синхронизацию для каждого подключения
    connections.forEach(connection => {
      if (connection.sync_enabled) {
        const timer = setInterval(async () => {
          logger.info('[SyncService] Автоматическая синхронизация', { connectionId: connection.id });
          await this.syncConnection(connection);
        }, this.SYNC_INTERVAL);

        this.timers.push(timer);
      }
    });
  }

  stopAutoSync() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
  }
}

export const marketplaceSyncService = new MarketplaceSyncService();

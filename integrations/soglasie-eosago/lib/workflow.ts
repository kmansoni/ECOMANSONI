/**
 * E-OSAGO Workflow Manager
 * 
 * Менеджер для упрощенияworkflow оформления Е-ОСАГО
 */

import { SoglasieClient, ApplicationStatus, FINAL_STATUSES, PAYABLE_STATUSES, type SoglasieConfig } from './client';
import type { EosagoApplication, EosagoStatusResponse, WorkflowResult } from './types';

/**
 * Опцииworkflow
 */
export interface EosagoWorkflowOptions {
  /** Автоматически получать ссылку на оплату */
  autoGetPayLink?: boolean;
  /** Интервал проверки статуса (мс) */
  statusIntervalMs?: number;
  /** Максимальное количество проверок статуса */
  maxStatusChecks?: number;
}

/**
 * Менеджерworkflow Е-ОСАГО
 */
export class EosagoWorkflow {
  private client: SoglasieClient;

  constructor(config: SoglasieConfig) {
    this.client = new SoglasieClient(config);
  }

  /**
   * Полный цикл оформления (до статуса готовности к оплате)
   * 
   * @param application - данные заявления
   * @param options - опции
   * @returns результат с данными для оплаты
   */
  async execute(
    application: EosagoApplication,
    options: EosagoWorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const { autoGetPayLink = true, statusIntervalMs = 3000, maxStatusChecks = 30 } = options;

    // ЭТАП 3: Загрузка заявления
    console.log('[EOSAGO] Загрузка заявления...');
    const { policyId } = await this.client.loadApplication(application);
    console.log(`[EOSAGO] Заявление загружено: policyId=${policyId}`);

    // ЭТАП 4: Ожидание проверки
    console.log('[EOSAGO] Ожидание проверки заявления...');
    const status = await this.client.waitForStatus(
      policyId,
      [...FINAL_STATUSES, ...PAYABLE_STATUSES],
      { maxAttempts: maxStatusChecks, intervalMs: statusIntervalMs }
    );

    return this.processStatus(policyId, status, autoGetPayLink);
  }

  /**
   * Оформление с предварительной проверкой КБМ
   * 
   * @param kbmRequest - запрос КБМ
   * @param application - данные заявления (без поля Drivers)
   * @param options - опции
   * @returns результат
   */
  async executeWithKbm(
    kbmRequest: Parameters<typeof this.client.checkKbm>[0],
    application: Omit<EosagoApplication, 'Drivers'>,
    options: EosagoWorkflowOptions = {}
  ): Promise<WorkflowResult & { kbmValue: number; kbmRequestId: string }> {
    // ЭТАП 1: Проверка КБМ
    console.log('[EOSAGO] Проверка КБМ...');
    const kbmResult = await this.client.checkKbm(kbmRequest);
    const kbmValue = kbmResult.processingResult?.calculatedKbmValue || 1;
    console.log(`[EOSAGO] КБМ: ${kbmValue}`);

    // Выполняем оформление с добавленными водителями
    const appWithDrivers = application as EosagoApplication;
    return {
      ...await this.execute(appWithDrivers, options),
      kbmValue,
      kbmRequestId: kbmResult.requestId,
    };
  }

  /**
   * Обработка статуса и получение данных для оплаты
   */
  private async processStatus(
    policyId: number,
    status: EosagoStatusResponse,
    autoGetPayLink: boolean
  ): Promise<WorkflowResult> {
    const statusValue = status.policy?.status || status.status;

    // Проверка на ошибки
    if (status.status === 'ERROR') {
      const errorInfo = status.lastError || 'Ошибка обработки';
      await this.client.suspendApplication(policyId);
      throw new Error(errorInfo);
    }

    if (statusValue === ApplicationStatus.RSA_CHECK_FAIL) {
      const errorInfo = status.lastError || 'Проверка в РСА не пройдена';
      await this.client.suspendApplication(policyId);
      throw new Error(errorInfo);
    }

    if (statusValue === ApplicationStatus.SK_CHECK_FAIL) {
      const errorInfo = status.lastError || 'Проверка в СК не пройдена';
      await this.client.suspendApplication(policyId);
      throw new Error(errorInfo);
    }

    // Переадресация в ЕГАРАНТ
    if (statusValue === ApplicationStatus.OTHER_SK) {
      const rsaid = status.rsacheck?.find((r) => r.type === 'CONTRACT')?.rsaid;
      return {
        policyId,
        status: statusValue,
        contractId: status.contractid,
        premium: status.policy?.premium || 0,
        coefficients: status.policy?.coeffs || [],
        drivers: status.policy?.drivers || [],
      };
    }

    // Проверка готовности к оплате
    if (!PAYABLE_STATUSES.includes(statusValue as any)) {
      await this.client.suspendApplication(policyId);
      throw new Error(`Неожиданный статус: ${statusValue}`);
    }

    // Получение ссылки на оплату
    let payLink: string | undefined;
    if (autoGetPayLink) {
      console.log('[EOSAGO] Получение ссылки на оплату...');
      const payResponse = await this.client.getPayLink(policyId);
      payLink = payResponse.PayLink;
    }

    return {
      policyId,
      status: statusValue,
      contractId: status.contractid,
      premium: status.policy?.premium || 0,
      coefficients: status.policy?.coeffs || [],
      drivers: status.policy?.drivers || [],
    };
  }

  /**
   * Подтверждение оплаты (для внешнего эквайринга)
   */
  async confirmPayment(policyId: number, amount: number, transactionId: string): Promise<void> {
    await this.client.confirmPayment(policyId, {
      PaySum: amount,
      TransactionID: transactionId,
    });
  }

  /**
   * Ожидание статуса "Вступил в силу"
   */
  async waitForSigned(policyId: number, options: { maxAttempts?: number; intervalMs?: number } = {}): Promise<{ status: string; policySerial?: string; policyNumber?: string }> {
    const { maxAttempts = 30, intervalMs = 3000 } = options;

    return this.client.waitForStatus(policyId, [ApplicationStatus.SIGNED], {
      maxAttempts,
      intervalMs,
    }).then((status) => ({
      status: status.policy?.status || '',
      policySerial: status.policy?.policyserial,
      policyNumber: status.policy?.policyno,
    }));
  }

  /**
   * Получить ссылку на оплату
   */
  async getPaymentLink(policyId: number): Promise<string> {
    const response = await this.client.getPayLink(policyId);
    return response.PayLink;
  }

  /**
   * Скачать ПФ заявления
   */
  async downloadApplicationPdf(policyId: number): Promise<Blob> {
    return this.client.downloadApplicationPdf(policyId);
  }

  /**
   * Скачать ПФ полиса
   */
  async downloadPolicyPdf(policyId: number): Promise<Blob> {
    return this.client.downloadPolicyPdf(policyId);
  }

  /**
   * Прекратить оформление
   */
  async suspend(policyId: number): Promise<void> {
    return this.client.suspendApplication(policyId);
  }
}

/**
 * Создатьworkflow менеджер
 */
export function createWorkflow(config: SoglasieConfig): EosagoWorkflow {
  return new EosagoWorkflow(config);
}
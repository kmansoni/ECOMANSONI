# Е-ОСАГО API: Полное руководство по внедрению

## Содержание

1. [Обзор интеграции](#обзор-интеграции)
2. [Архитектура](#архитектура)
3. [Workflow оформления](#workflow-оформления)
4. [Типы данных](#типы-данных)
5. [Реализация API клиента](#реализация-api-клиента)
6. [Примеры использования](#примеры-использования)
7. [Обработка ошибок](#обработка-ошибок)
8. [Тестирование](#тестирование)
9. [Справочники](#справочники)

---

## Обзор интеграции

Интеграция с Страховой Компанией "Согласие" для оформления электронного полиса ОСАГО (Е-ОСАГО).

| Параметр | Значение |
|----------|----------|
| API Version | REST |
| Format | JSON/XML |
| Encoding | UTF-8 |
| Auth | Basic Auth |

### URLs

| Environment | Base URL |
|-------------|---------|
| Production | `https://b2b.soglasie.ru` |
| Test | `https://b2b.soglasie.ru/daily` |
| Test (new) | `https://b2b.soglasie.ru/upload-test` |

### Support

- **Phone:** +7 495 739-01-01, доб. 2444
- **Email:** technical support via curator

---

## Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client   │────▶│   SK      │────▶│    RSA    │
│   App     │     │ Согласие  │     │    РСА    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                 │                 │
       │                 │                 │
   ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
   │  User  │    │  KBM   │    │ Policy │
   │  Flow  │    │ Check  │    │ Sign  │
   └────────┘    └────────┘    └────────┘
```

### Компоненты

1. **Client App** - ваше приложение
2. **SK Soglasie API** - REST API СК Согласие
3. **RSA API** - РСА (Российский Союз Автостраховщиков)

---

## Workflow оформления

### Основной сценарий (11 этапов)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ЭТАП 01: Проверка КБМ 2.0                                    │
│  POST /rsaproxy/api/osago/v1/kbm                           │
│  ─────────────────────────────────────────────────────── │
│  Вход:  VIN, данные водителей                           │
│  Выход: requestId, calculatedKbmValue                  │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌────────────────���─────────────────────────────────────────────────────────┐
│  ЭТАП 02: Расчет премии                                     │
│  POST /CCM/CCMService (SOAP)                             │
│  ─────────────────────────────────────────────────────── │
│  Вход:  данные ТС, водителей, КБМ                      │
│  Выход: tariff, premium, coeffs                        │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ЭТАП 03: Загрузка заявления                                 │
│  POST /online/api/eosago                                │
│  ─────────────────────────────────────────────────────── │
│  Вход:  полные данные заявления                        │
│  Выход: policyId                                    │
│  ─────────────────────────────────────────────────────── │
│  ⚠️ Заявление направляется на проверку в РСА            │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ЭТАП 04: Проверка статуса (повторять пока не COMPLETE)         │
│  GET /online/api/eosago/{policyId}/status                   │
│  ─────────────────────────────────────────────────────── │
│  Статусы:                                             │
│    DRAFT        ─ Предварительный                        │
│    RSA_CHECK   ─ На проверке в РСА                   │
│    RSA_CHECK_OK ─ Проверка РСА пройдена                 │
│    RSA_CHECK_FAIL ─ Проверка РСА НЕ пройдена          │
│    SK_CHECK_OK ─ Проверка СК пройдена                 │
│    SIGNED       ─ Вступил в силу (SUCCESS)           │
│    SUSPENDED   ─ Оформление прекращено              │
└──────────────────────────┬───────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
          ┌─────▼─────┐        ┌─────▼──────┐
          │  SUCCESS  │        │   FAIL     │
          │           │        │            │
    ┌─────▼─────┐    │   ┌─────▼─────┐    │
    │ Эт��п 05-10 │    │   │ Этап 06   │    │
    │(optional) │    │   │ Suspend   │    │
    └───────────┘    │   └───────────┘    │
```

### Этапы подробно

| # | Этап | Метод | Обязательность | Описание |
|---|------|-------|--------------|----------|
| 01 | Проверка КБМ | POST /rsaproxy/api/osago/v1/kbm | Нет (для мультидрайв) | Проверка КБМ водителей |
| 02 | Расчет премии | POST /CCM/CCMService | Да | Расчет стоимости |
| 03 | Загрузка заявления | POST /online/api/eosago | Да | Загрузка заявления |
| 04 | Проверка статуса | GET /online/api/eosago/{policyId}/status | Да | Мониторинг статуса |
| 05 | ПФ заявления | GET /online/api/eosago/{policyId}/notice | Нет | Скачать PDF |
| 06 | Прекратить | PUT /online/api/eosago/{policyId}/suspend | Нет | Отмена оформления |
| 07 | Ссылка оплаты | GET /online/api/eosago/{policyId}/paylink | Да | Получить ссылку |
| 08 | Подтвердить оплату | POST /online/api/eosago/{policyId}/acquiring | Нет | Записать оплату |
| 09 | Счет для ЮЛ | POST /online/api/eosago/accounts | Нет | Создание счета |
| 10 | ПФ полиса | GET /online/api/eosago/{policyId}/policy | Нет | Скачать PDF |
| 11 | Загрузка сканов | POST /online/api/eosago/{policyId}/scans | Нет | Загрузить документы |

---

## Типы данных

### Enums

```typescript
// Статусы заявления
type ApplicationStatus = 
  | 'DRAFT'           // Предварительный
  | 'RSA_CHECK'       // На проверке в РСА
  | 'RSA_CHECK_OK'    // Проверка РСА пройдена
  | 'RSA_CHECK_FAIL'  // Проверка РСА НЕ пройдена
  | 'SK_CHECK'      // На проверке в СК
  | 'SK_CHECK_START' // Сотрудник взял в работу
  | 'SK_CHECK_OK'   // Проверка СК пройдена
  | 'SK_CHECK_FAIL' // Проверка СК НЕ пройдена
  | 'PAY_COMPLETE'  // Оплачено
  | 'RSA_SIGN'     // Отправлено на подписание
  | 'RSA_SIGNED'  // Подписано в РСА
  | 'RSA_SIGN_FAIL' // Ошибка подписания
  | 'SIGNED'     // Вступил в силу (SUCCESS)
  | 'SUSPENDED'  // Прекращено
  | 'CANCELED'   // Досрочно прекращен
  | 'OTHER_SK'; // Передано в ЕГАРАНТ

// Тип собственника
type OwnerType = 
  | 1001  // Физическое лицо
  | 1002  // Юридическое лицо
  | 1003  // Индивидуальный предприниматель
  | 1004; // ПБОЮЛ

// Тип ТС
type VehicleType = 
  | 1  // Мотоцикл
  | 2  // Легковой автомобиль
  | 3  // Грузовой автомобиль
  | 4  // Автобус
  | 5  // Трактор
  | 6  //_other;

// Цель использования
type GoalUse = 
  | 'Personal'              // Личные
  | 'RidingTraining'        // Учебная езда
  | 'Collection'          // Инкассация
  | 'Ambulance'          // Скорая помощь
  | 'Taxi'               // Такси
  | 'TrafficAndSpecial'    // Дорожные и специальные ТС
  | 'Other'              // Прочие
  | 'RegularPassengers'    // Регулярные пассажирские перевозки
  | 'DangerousAndFlammable' // Перевозка опасных грузов
  | 'Rent'               // Прокат/аренда
  | 'EmergencyAndMunicipal'; // Экстренные и коммунальные службы
```

### Interfaces

```typescript
// ====== Vehicle ======
interface VehicleInfo {
  /** VIN (17 символов) - приоритетный */
  VIN?: string;
  /** Номер кузова */
  BodyNumber?: string;
  /** Номер шасси */
  ChassisNumber?: string;
  /** Госномер */
  LicensePlate?: string;
  /** Код модели из справочника */
  MarkModelCarCode: number;
  /** Марка по ПТС */
  MarkPTS: string;
  /** Модель по ПТС */
  ModelPTS: string;
  /** Год выпуска */
  YearIssue: number;
  /** Документ ТС (СТС/ПТС) */
  DocumentCar: VehicleDocument;
  /** Диагностическая карта */
  TicketCar?: VehicleDocument;
  /** Мощность (л.с.) */
  EngCap: number;
  /** Максимальная масса (для грузовых) */
  MaxMass?: number;
  /** Цель использования */
  GoalUse: string;
  /** ТС в залоге */
  IsPledge?: boolean;
  /** Пассажирских мест (для автобусов) */
  PasQuant?: number;
  /** Сдается в аренду */
  Rented: boolean;
}

interface VehicleDocument {
  /** Код РСА документа */
  TypeRSA?: string;
  /** Код справочника */
  Type?: number;
  /** Серия */
  Serial?: string;
  /** Номер */
  Number: string;
  /** Дата выдачи */
  Date: string;
  /** Основной документ */
  IsPrimary?: boolean;
}

// ====== Person ======
interface Person {
  /** Физическое лицо */
  Phisical?: PhisicalPerson;
  /** Юридическое лицо */
  Juridical?: JuridicalPerson;
}

interface PhisicalPerson {
  /** Резидент РФ */
  Resident: boolean;
  /** Индивидуальный предприниматель */
  PBOUL?: boolean;
  /** Фамилия */
  Surname: string;
  /** Имя */
  Name: string;
  /** Отчество */
  Patronymic?: string;
  /** Дата рождения */
  BirthDate: string;
  /** Пол (male/female) */
  Sex: string;
  /** ИНН */
  INN?: string;
  /** СНИЛС */
  Snils?: string;
  /** Документы */
  Documents: { Document: Document[] };
  /** Адреса */
  Addresses?: { Address?: Address[] };
  /** Email */
  Email?: string;
  /** Телефон */
  PhoneMobile?: string;
}

interface JuridicalPerson {
  /** Резидент */
  Resident?: boolean;
  /** Полное наименование */
  FullName: string;
  /** Сокращенное наименование */
  BriefName?: string;
  /** ОПФ (АО, ООО, ЗАО) */
  OPF: string;
  /** ИНН */
  INN: string;
  /** Документы */
  Documents: { Document: Document[] };
  /** Адреса */
  Addresses?: { Address[] };
  /** Телефон */
  Tel?: string;
  /** Факс */
  Fax?: string;
  /** Email */
  Email?: string;
}

interface Document {
  TypeRSA?: string;
  Type?: number;
  Serial?: string;
  Number: string;
  Date?: string;
  Exit?: string;
  IsPrimary?: boolean;
}

interface Address {
  /** Тип (Registered/Legal/Actual) */
  Type: string;
  /** Код страны (643 = Россия) */
  Country: string;
  /** Код КЛАДР (17 символов) */
  AddressCode: string;
  /** Улица */
  Street?: string;
  /** Дом */
  Hous?: string;
  /** Корпус */
  Housing?: string;
  /** Строение */
  Structure?: string;
  /** Квартира */
  Flat?: string;
  /** Индекс */
  Index?: string;
  /** Полный адрес (для иностранных) */
  AddressString?: string;
  /** Основной адрес */
  IsPrimary?: boolean;
  /** ФИАС GUID */
  FiasGuid?: string;
}

// ====== Driver ======
interface Driver {
  Face: PersonFace;
  DrivingExpDate: string;
}

interface PersonFace {
  Resident: boolean;
  Surname: string;
  Name: string;
  Patronymic?: string;
  BirthDate: string;
  Sex: string;
  INN?: string;
  Snils?: string;
  Documents: { Document: Document[] };
  Addresses?: { Address?: Address[] };
  PhisicalOld?: OldPersonInfo;
}

// ====== Application ======
interface EosagoApplication {
  DeclarationDate: string;
  BeginDate: string;
  EndDate: string;
  /** Предыдущий полис СК Согласие */
  PrevPolicy?: {
    Serial: string;
    Number: string;
  };
  /** Полис другой СК */
  PrevPolicyOther?: {
    SerialOther: string;
    NumberOther: string;
  };
  Period1Begin: string;
  Period1End: string;
  /** ТС следует к месту регистрации */
  IsTransCar: boolean;
  /** Иностранное ТС */
  IsForeignCar?: boolean;
  /** Страхование прицепа */
  IsInsureTrailer?: boolean;
  CarInfo: VehicleInfo;
  Insurer: Person;
  CarOwner: Person;
  Drivers?: { Driver: Driver[] };
  /** Индивидуальный код продавца */
  IKP1: string;
  /** Наличная форма оплаты */
  CashPaymentOption?: boolean;
  /** Платеж от страхователя */
  InsurerPay?: boolean;
  /** Субагент */
  SubagentID?: string;
  /** Инвойс (по согласованию) */
  DopFieldCalc?: string;
  /** Особые отметки */
  SpecialConditions?: string;
}
```

---

## Реализация API клиента

### Базовый класс

```typescript
// integrations/soglasie-eosago/lib/client.ts

import type {
  KbmRequest,
  KbmResponse,
  EosagoApplication,
  ApplicationStatus,
  EosagoStatusResponse,
  PayLinkResponse,
  AcquiringRequest,
} from '../types';

export type Environment = 'production' | 'test' | 'upload-test';

export interface SoglasieConfig {
  login: string;
  password: string;
  subUser?: string;
  subUserPassword?: string;
  environment: Environment;
}

export class SoglasieClient {
  private baseUrl: string;
  private authHeader: string;
  private authHeaderWithSubUser: string;

  constructor(private config: SoglasieConfig) {
    this.baseUrl = this.getBaseUrl();
    this.authHeader = this.createAuth(config.login, config.password);
    this.authHeaderWithSubUser = this.createAuth(
      config.login,
      config.subUser || config.password,
      config.subUserPassword || config.password
    );
  }

  private getBaseUrl(): string {
    const urls = {
      production: 'https://b2b.soglasie.ru',
      test: 'https://b2b.soglasie.ru/daily',
      'upload-test': 'https://b2b.soglasie.ru/upload-test',
    };
    return urls[this.config.environment];
  }

  private createAuth(login: string, password: string): string {
    return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { auth?: string }
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': options.auth || this.authHeader,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new SoglasieError(
        error.error || `Request failed: ${response.status}`,
        response.status,
        error
      );
    }

    return response.json();
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 1: Проверка КБМ
  // ═══════════════════════════════════════════════════════════

  /**
   * Проверка КБМ водителей
   * @see https://wiki.soglasie.ru/partners/integration/services/kbmservice2.0/start
   */
  async checkKbm(request: KbmRequest): Promise<KbmResponse> {
    return this.request('/rsaproxy/api/osago/v1/kbm', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 3: Загрузка заявления
  // ═══════════════════════════════════════════════════════════

  /**
   * Загрузка заявления Е-ОСАГО
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/load
   */
  async loadApplication(
    application: EosagoApplication
  ): Promise<{ policyId: number; packageId: number }> {
    return this.request('/online/api/eosago', {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(application),
    });
  }

  /**
   * Загрузка черновика (без проверки РСА)
   */
  async loadApplicationDraft(
    application: EosagoApplication
  ): Promise<{ policyId: number; packageId: number }> {
    return this.request('/online/api/eosago?test=true', {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(application),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 4: Проверка статуса
  // ═══════════════════════════════════════════════════════════

  /**
   * Получение статуса заявления
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/status
   */
  async getStatus(
    policyId: number,
    options?: { akv?: boolean; overlimit?: boolean }
  ): Promise<EosagoStatusResponse> {
    const params = new URLSearchParams();
    if (options?.akv) params.set('akv', 'true');
    if (options?.overlimit) params.set('overlimit', 'true');

    const query = params.toString();
    return this.request(`/online/api/eosago/${policyId}/status${query ? '?' + query : ''}`);
  }

  /**
   * Ожидание достижения статуса
   */
  async waitForStatus(
    policyId: number,
    targetStatuses: string[],
    options: { maxAttempts?: number; intervalMs?: number } = {}
  ): Promise<EosagoStatusResponse> {
    const { maxAttempts = 30, intervalMs = 3000 } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getStatus(policyId);
      const currentStatus = status.policy?.status || status.status;

      if (targetStatuses.includes(currentStatus)) {
        return status;
      }

      if (status.status === 'ERROR') {
        throw new SoglasieError(
          status.lastError || 'Processing failed',
          500,
          status
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new SoglasieError(
      `Timeout waiting for status: ${targetStatuses.join(', ')}`,
      408
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 5: ПФ заявления
  // ═══════════════════════════════════════════════════

  /**
   * Скачивание ПФ заявления
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/docdownload
   */
  async downloadApplicationPdf(policyId: number): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/notice`,
      {
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to download PDF: ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 6: Прекратить оформление
  // ═══════════════════════════════════════════════════════════

  /**
   * Перевод заявления в статус "Оформление прекращено"
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/stop
   */
  async suspendApplication(policyId: number): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/suspend`,
      {
        method: 'PUT',
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to suspend: ${response.status}`,
        response.status
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 7: Ссылка на оплату
  // ═══════════════════════════════════════════════════════════

  /**
   * Получение ссылки на оплату
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/linktopay
   */
  async getPayLink(policyId: number): Promise<PayLinkResponse> {
    return this.request(`/online/api/eosago/${policyId}/paylink`);
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 8: Подтверждение оплаты
  // ═══════════════════════════════════════════════════════════

  /**
   * Запись данных об успешной оплате
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/success
   */
  async confirmPayment(policyId: number, acquiring: AcquiringRequest): Promise<void> {
    await this.request(`/online/api/eosago/${policyId}/acquiring`, {
      method: 'POST',
      auth: this.authHeaderWithSubUser,
      body: JSON.stringify(acquiring),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ЭТАП 10: ПФ полиса
  // ═══════════════════════════════════════════════════════════

  /**
   * Скачивание ПФ полиса
   * @see https://wiki.soglasie.ru/partners/integration/products/eosago/docpolisdownload
   */
  async downloadPolicyPdf(policyId: number): Promise<Blob> {
    const response = await fetch(
      `${this.baseUrl}/online/api/eosago/${policyId}/policy`,
      {
        headers: { Authorization: this.authHeader },
      }
    );

    if (!response.ok) {
      throw new SoglasieError(
        `Failed to download policy PDF: ${response.status}`,
        response.status
      );
    }

    return response.blob();
  }
}

// ═══════════════════════════════════════════════════════════
// Custom Error
// ═══════════════════════════════════════════════════════════

export class SoglasieError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SoglasieError';
  }
}
```

### Менеджер workflow

```typescript
// integrations/soglasie-eosago/lib/workflow.ts

import { SoglasieClient, type SoglasieConfig } from './client';

export const ApplicationStatus = {
  DRAFT: 'DRAFT',
  RSA_CHECK: 'RSA_CHECK',
  RSA_CHECK_OK: 'RSA_CHECK_OK',
  RSA_CHECK_FAIL: 'RSA_CHECK_FAIL',
  SK_CHECK: 'SK_CHECK',
  SK_CHECK_START: 'SK_CHECK_START',
  SK_CHECK_OK: 'SK_CHECK_OK',
  SK_CHECK_FAIL: 'SK_CHECK_FAIL',
  PAY_COMPLETE: 'PAY_COMPLETE',
  RSA_SIGN: 'RSA_SIGN',
  RSA_SIGNED: 'RSA_SIGNED',
  RSA_SIGN_FAIL: 'RSA_SIGN_FAIL',
  SIGNED: 'SIGNED',
  SUSPENDED: 'SUSPENDED',
  CANCELED: 'CANCELED',
  OTHER_SK: 'OTHER_SK',
} as const;

// Статусы завершения
export const FINAL_STATUSES = [
  ApplicationStatus.SIGNED,
  ApplicationStatus.SUSPENDED,
  ApplicationStatus.CANCELED,
  ApplicationStatus.OTHER_SK,
] as const;

// Статусы готовности к оплате
export const PAYABLE_STATUSES = [
  ApplicationStatus.RSA_CHECK_OK,
  ApplicationStatus.SK_CHECK_OK,
] as const;

// Ожидаемые статусы
export const PENDING_STATUSES = [
  ApplicationStatus.DRAFT,
  ApplicationStatus.RSA_CHECK,
  ApplicationStatus.SK_CHECK,
  ApplicationStatus.SK_CHECK_START,
  ApplicationStatus.PAY_COMPLETE,
  ApplicationStatus.RSA_SIGN,
  ApplicationStatus.RSA_SIGNED,
] as const;

export type WorkflowOptions = {
  /** Автоматически получать ссылку на оплату */
  autoGetPayLink?: boolean;
  /** Автоматически подтверждать оплату (для внешнего эквайринга) */
  autoConfirmPayment?: boolean;
  /** Интервал проверки статуса (мс) */
  statusIntervalMs?: number;
  /** Максимальное количество проверок статуса */
  maxStatusChecks?: number;
};

export interface WorkflowResult {
  policyId: number;
  status: string;
  contractId?: number;
  policySerial?: string;
  policyNumber?: string;
  premium: number;
  coefficients: Array<{ brief: string; value: number }>;
  drivers: Array<{ name: string; kbm: number; class: string }>;
}

export class EosagoWorkflow {
  private client: SoglasieClient;

  constructor(config: SoglasieConfig) {
    this.client = new SoglasieClient(config);
  }

  /**
   * Полный workflow оформления
   */
  async execute(
    application: unknown,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const {
      autoGetPayLink = true,
      statusIntervalMs = 3000,
      maxStatusChecks = 30,
    } = options;

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

    // Проверка на ошибки
    if (status.status === 'ERROR' || status.policy?.status === ApplicationStatus.RSA_CHECK_FAIL) {
      const errorInfo = status.lastError || 'Проверка в РСА не пройдена';
      await this.client.suspendApplication(policyId);
      throw new Error(errorInfo);
    }

    if (status.policy?.status === ApplicationStatus.SK_CHECK_FAIL) {
      const errorInfo = status.lastError || 'Проверка в СК не пройдена';
      await this.client.suspendApplication(policyId);
      throw new Error(errorInfo);
    }

    // Возврат если переадресация в ЕГАРАНТ
    if (status.policy?.status === ApplicationStatus.OTHER_SK) {
      const rsaid = status.rsacheck?.find((r) => r.type === 'CONTRACT')?.rsaid;
      return {
        policyId,
        status: ApplicationStatus.OTHER_SK,
        contractId: status.contractid,
        premium: status.policy?.premium || 0,
        coefficients: status.policy?.coeffs || [],
        drivers: status.policy?.drivers || [],
      };
    }

    // Проверка готовности к оплате
    if (!PAYABLE_STATUSES.includes(status.policy?.status as any)) {
      await this.client.suspendApplication(policyId);
      throw new Error(`Неожиданный статус: ${status.policy?.status}`);
    }

    // Получение ссылки на оплату
    let payLink: string | undefined;
    if (autoGetPayLink) {
      console.log('[EOSAGO] Получение ссылки на оплату...');
      const payResponse = await this.client.getPayLink(policyId);
      payLink = payResponse.PayLink;
    }

    // Возврат результата - клиент должен совершить оплату
    return {
      policyId,
      status: status.policy?.status || 'PAYABLE',
      contractId: status.contractid,
      premium: status.policy?.premium || 0,
      coefficients: status.policy?.coeffs || [],
      drivers: status.policy?.drivers || [],
      // PayLink нужно передать клиенту для оплаты
      // ...
    };
  }

  /**
   * Оформление пролонгации (продление полиса)
   */
  async executeProlongation(
    contractData: unknown,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    // TODO: Реализовать на основе сервиса prolongation
    throw new Error('Prolongation not implemented yet');
  }
}
```

---

## Примеры использования

### Пример 1: Базовое оформление

```typescript
import { SoglasieClient, type SoglasieConfig } from 'soglasie-eosago';

const config: SoglasieConfig = {
  login: 'PARTNER_LOGIN',
  password: 'PARTNER_PASSWORD',
  subUser: 'SUBUSER',
  subUserPassword: 'SUBUSER_PASSWORD',
  environment: 'test', // 'production' для боевой
};

const client = new SoglasieClient(config);

// Загрузка заявления
const application = {
  DeclarationDate: '2024-08-23T00:00:00',
  BeginDate: '2024-09-21T00:00:00',
  EndDate: '2025-09-20T23:59:59',
  Period1Begin: '2024-09-21',
  Period1End: '2025-09-20',
  IsTransCar: false,
  CarInfo: {
    VIN: 'JHMGD18486210131',
    LicensePlate: 'Х762КМ187',
    MarkModelCarCode: 21372,
    MarkPTS: 'Honda',
    ModelPTS: 'JAZZ',
    YearIssue: 2006,
    DocumentCar: {
      TypeRSA: '31',
      Serial: '4509',
      Number: '338463',
      Date: '2019-03-30',
    },
    EngCap: 83,
    GoalUse: 'Personal',
    Rented: false,
  },
  Insurer: {
    Phisical: {
      Resident: true,
      Surname: 'Кораблева',
      Name: 'Светлана',
      Patronymic: 'Алексан��ро��на',
      BirthDate: '1961-04-03',
      Sex: 'female',
      Documents: {
        Document: [{
          TypeRSA: '12',
          Serial: '8459',
          Number: '453284',
          Date: '2006-04-07',
          IsPrimary: true,
        }],
      },
      Addresses: {
        Address: [{
          Type: 'Registered',
          Country: '643',
          AddressCode: '77000000000739200',
          Hous: '24',
          IsPrimary: true,
        }],
      },
      Email: '48592521456@mail.ru',
    },
  },
  CarOwner: {
    Phisical: {
      Resident: true,
      Surname: 'Кораблева',
      Name: 'Светлана',
      Patronymic: 'Александровна',
      BirthDate: '1961-04-03',
      Sex: 'female',
      Documents: {
        Document: [{
          TypeRSA: '12',
          Serial: '8459',
          Number: '453284',
          Date: '2006-04-07',
          IsPrimary: true,
        }],
      },
      Addresses: {
        Address: [{
          Type: 'Registered',
          Country: '643',
          AddressCode: '77000000000739200',
          Hous: '24',
          IsPrimary: true,
        }],
      },
      Email: '48592521456@mail.ru',
    },
  },
  Drivers: {
    Driver: [{
      Face: {
        Resident: true,
        Surname: 'Кораблев',
        Name: 'Анатолий',
        Patronymic: 'Александрович',
        BirthDate: '1987-06-24',
        Sex: 'male',
        Documents: {
          Document: [{
            TypeRSA: 20,
            Serial: '4593',
            Number: '933881',
            Date: '2016-01-26',
          }],
        },
      },
      DrivingExpDate: '2006-01-27',
    }],
  },
  IKP1: ' ',
  CashPaymentOption: false,
};

// Загрузка
const result = await client.loadApplication(application);
console.log('policyId:', result.policyId);

// Мониторинг статуса
let attempts = 0;
while (attempts < 30) {
  const status = await client.getStatus(result.policyId);
  console.log('Status:', status.policy?.status, status.policy?.statusName);
  
  if (status.policy?.status === 'SIGNED') {
    console.log('Готово!');
    console.log('Polis:', status.policy.policyserial, status.policy.policyno);
    break;
  }
  
  await new Promise(r => setTimeout(r, 3000));
  attempts++;
}
```

### Пример 2: С КБМ

```typescript
// ЭТАП 1: Проверка КБМ
const kbmRequest = {
  vehicleId: { vin: 'XTA219020D4875665' },
  driverLimitIndicator: true,
  contractEffectiveDate: '2024-06-01',
  contractClosingDate: '2024-06-01',
  persons: [
    {
      driverLicense: {
        countryCode: '643',
        docType: 20,
        docSeries: '9900',
        docNumber: '878787',
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: 'Иванович',
        birthDate: '1969-02-29',
      },
    },
  ],
};

const kbmResult = await client.checkKbm(kbmRequest);
console.log('KBM:', kbmResult.processingResult?.calculatedKbmValue);

// Использовать requestId в заявлении
const requestId = kbmResult.requestId;
```

---

## Обработка ошибок

### Коды ошибок

| Error | Description | Action |
|-------|-------------|--------|
| RSA_CHECK_FAIL | Проверка в РСА не пройдена | Исправить данные, создать новое заявление |
| SK_CHECK_FAIL | Проверка в СК не пройдена | Связаться с куратором |
| DRAFT | Черновик (test=true) | Нельзя перейти к оплате |
| TIMEOUT | Превышен таймаут ожидания | Повторить проверку статуса |

### Error Handling Example

```typescript
try {
  const result = await client.loadApplication(application);
} catch (error) {
  if (error instanceof SoglasieError) {
    switch (error.statusCode) {
      case 400:
        console.error('Ошибка в данных:', error.details);
        break;
      case 401:
        console.error('Ошибка авторизации');
        break;
      case 403:
        console.error('Нет доступа');
        break;
      default:
        console.error('Ошибка:', error.message);
    }
  }
}
```

---

## Тестирование

### Требования для доступа к боевой среде

В будний день до 12:00 (кроме последних 3 дней месяца) необходимо загрузить:

1. **Полис с ограниченным числом водителей**
   - Минимум 3 водителя
   - 1 водитель НЕ должен быть в системе СК Согласие

2. **Мультидрайв полис**

Требования к данным:
- Реалистичные ФИО
- Реалистичные адреса
- Реалистичные данные документов

После тестирования предоставить:
- ПФ заявлений
- Логи обращений/ответов
- Номера созданных договоров

### Test Environment

```
Production: https://b2b.soglasie.ru
Test:        https://b2b.soglasie.ru/daily
Test (new):  https://b2b.soglasie.ru/upload-test
```

---

## Справочники

### Document Types (TypeRSA)

| TypeRSA | Type | Description |
|--------|------|-------------|
| 12 | 6 | Паспорт гражданина РФ |
| 20 | 15 | Водительское удостоверение РФ |
| 21 | 82 | Водительское удостоверение иностранное |
| 31 | 3 | СТС |
| 30 | 2 | ПТС |
| 53 | 14 | Диагностическая карта |

### Vehicle Document Types

| TypeRSA | Type | Suffix | Name |
|--------|------|--------|------|
| 33 | 1 | ТП | Техпаспорт |
| 30 | 2 | ПТС | Паспорт ТС |
| 31 | 3 | СТС | Свидетельство о регистрации ТС |
| 41 | 31 | ЭПТС | Электронный ПТС |

### GoalUse Values

| Value | Description |
|-------|-------------|
| Personal | Личные |
| RidingTraining | Учебная езда |
| Taxi | Такси |
| Rent | Прокат/аренда |
| RegularPassengers | Регулярные пассажирские перевозки |
| Other | Прочие |
| DangerousAndFlammable | Перевозка опасных грузов |

### Vehicle Types (ТипТСОСАГО)

| Code | Type |
|------|------|
| 1 | Мотоцикл |
| 2 | Легковой автомобиль |
| 3 | Грузовой автомобиль |
| 4 | Автобус |
| 5 | Трактор |

### Owner Types (ТипСобственникаТС)

| Code | Type |
|------|------|
| 1001 | Физическое лицо |
| 1002 | Юридическое лицо |
| 1003 | Индивидуальный предприниматель |
| 1004 | ПБОЮЛ |

### Catalog URLs

```
Модели ТС:        https://b2b.soglasie.ru/CCMC/catalog.jsp?catalog=1436
Типы ТС:          https://b2b.soglasie.ru/CCMC/catalog.jsp?catalog=1716
Цели использования: https://b2b.soglasie.ru/CCMC/catalog.jsp?catalog=1718
Сроки страхования:  https://b2b.soglasie.ru/CCMC/catalog.jsp?catalog=1722
Типы собственника: https://b2b.soglasie.ru/CCMC/catalog.jsp?catalog=1
```

---

## Version History

| Date | Change |
|------|-------|
| 20.02.2024 | МодельТС - обязательный параметр |
| 04.06.2025 | Добавлены адреса тестовой среды |
| 04.06.2025 | Добавлен статус DRAFT |
| 13.08.2025 | ��бновлены значения GoalUse |
| 17.10.2025 | Добавлены InsurerPay, SpecialConditions |
| 23.10.2025 | Добавлены параметры Body |
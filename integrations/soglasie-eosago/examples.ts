/**
 * E-OSAGO Examples
 * 
 * Примеры использования API Е-ОСАГО СК Согласие
 */

import { SoglasieClient, createClient, SoglasieError, ApplicationStatus } from './lib/client';
import { EosagoWorkflow, createWorkflow } from './lib/workflow';
import type { SoglasieConfig, EosagoApplication, KbmRequest } from './lib/types';

// ═══════════════════════════════════════════════════════════
// Пример 1: Базовое оформление
// ═══════════════════════════════════════════════════════════

async function basicExample() {
  const config: SoglasieConfig = {
    login: 'PARTNER_LOGIN',
    password: 'PARTNER_PASSWORD',
    subUser: 'SUBUSER',
    subUserPassword: 'SUBUSER_PASSWORD',
    environment: 'test',
  };

  const client = createClient(config);

  // Пример заявления
  const application: EosagoApplication = {
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
        Email: 'test@example.ru',
        PhoneMobile: '+79261231212',
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
        Email: 'test@example.ru',
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

  try {
    // Загрузка заявления
    const result = await client.loadApplication(application);
    console.log('policyId:', result.policyId);

    // Мониторинг статуса
    let attempts = 0;
    while (attempts < 30) {
      const status = await client.getStatus(result.policyId);
      console.log('Status:', status.policy?.status, status.policy?.statusName);

      if (status.policy?.status === ApplicationStatus.SIGNED) {
        console.log('Полис оформлен!');
        console.log('Серия:', status.policy.policyserial);
        console.log('Номер:', status.policy.policyno);
        console.log('Премия:', status.policy.premium);
        break;
      }

      if (status.policy?.status === ApplicationStatus.RSA_CHECK_OK ||
          status.policy?.status === ApplicationStatus.SK_CHECK_OK) {
        // Получить ссылку на оплату
        const payLink = await client.getPayLink(result.policyId);
        console.log('Ссылка на оплату:', payLink.PayLink);
        break;
      }

      await new Promise(r => setTimeout(r, 3000));
      attempts++;
    }
  } catch (error) {
    if (error instanceof SoglasieError) {
      console.error('Ошибка:', error.message, error.details);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Пример 2: С проверкой КБМ
// ═══════════════════════════════════════════════════════════

async function withKbmExample() {
  const config: SoglasieConfig = {
    login: 'PARTNER_LOGIN',
    password: 'PARTNER_PASSWORD',
    environment: 'test',
  };

  const client = createClient(config);

  // Запрос КБМ
  const kbmRequest: KbmRequest = {
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
  console.log('КБМ:', kbmResult.processingResult?.calculatedKbmValue);
  console.log('RequestId:', kbmResult.requestId);

  // Использовать requestId в заявлении...
}

// ═══════════════════════════════════════════════════════════
// Пример 3: Использование Workflow
// ═══════════════════════════════════════════════════════════

async function workflowExample() {
  const config: SoglasieConfig = {
    login: 'PARTNER_LOGIN',
    password: 'PARTNER_PASSWORD',
    subUser: 'SUBUSER',
    subUserPassword: 'SUBUSER_PASSWORD',
    environment: 'test',
  };

  const workflow = createWorkflow(config);

  const application: EosagoApplication = {
    // ... данные заявления
  } as EosagoApplication;

  try {
    // Выполнить оформление
    const result = await workflow.execute(application, {
      autoGetPayLink: true,
    });

    console.log('policyId:', result.policyId);
    console.log('��татус:', result.status);
    console.log('Премия:', result.premium);

    // Если нужен payLink - получить отдельно
    const payLink = await workflow.getPaymentLink(result.policyId);
    console.log('Оплата:', payLink);

    // После оплаты клиентом
    // await workflow.confirmPayment(result.policyId, result.premium, 'TXN123');

    // Ожидание подписания
    const signed = await workflow.waitForSigned(result.policyId);
    console.log('Полис:', signed.policySerial, signed.policyNumber);
  } catch (error) {
    console.error('Ошибка оформления:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// Пример 4: Пролонгация (продление)
// ═══════════════════════════════════════════════════════════

async function prolongationExample() {
  const config: SoglasieConfig = {
    login: 'PARTNER_LOGIN',
    password: 'PARTNER_PASSWORD',
    environment: 'test',
  };

  const client = createClient(config);

  // Для пролонгации нужно:
  // 1. Указать PrevPolicy с данными предыдущего полиса
  const application: EosagoApplication = {
    DeclarationDate: '2024-08-23T00:00:00',
    BeginDate: '2024-09-21T00:00:00',
    EndDate: '2025-09-20T23:59:59',
    Period1Begin: '2024-09-21',
    Period1End: '2025-09-20',
    IsTransCar: false,
    // Указываем предыдущий полис СК Согласие
    PrevPolicy: {
      Serial: 'XXX',
      Number: '0136648601',
    },
    // ... остальные данные
  } as EosagoApplication;

  const result = await client.loadApplication(application);
  console.log('policyId:', result.policyId);
}

// ═══════════════════════════════════════════════════════════
// Пример 5: Юридическое лицо
// ═══════════════════════════════════════════════════════════

async function juridicalExample() {
  const application: EosagoApplication = {
    DeclarationDate: '2024-08-23T00:00:00',
    BeginDate: '2024-09-21T00:00:00',
    EndDate: '2025-09-20T23:59:59',
    Period1Begin: '2024-09-21',
    Period1End: '2025-09-20',
    IsTransCar: false,
    CarInfo: {
      VIN: 'XTA219020D4875665',
      LicensePlate: 'А123АА77',
      MarkModelCarCode: 38110,
      MarkPTS: 'ВАЗ/Lada',
      ModelPTS: '2190/Granta',
      YearIssue: 2013,
      DocumentCar: {
        Type: 3,
        Serial: '77УТ',
        Number: '123456',
        Date: '2015-04-14',
      },
      EngCap: 106,
      GoalUse: 'Personal',
      Rented: false,
    },
    Insurer: {
      Juridical: {
        Resident: true,
        FullName: 'Общество с ограниченной ответственностью "Ромашка"',
        BriefName: 'ООО "Ромашка"',
        OPF: 'ООО',
        INN: '7701234567',
        Documents: {
          Document: [{
            Type: 31,
            Serial: '01',
            Number: '010101011',
            Date: '2006-04-07',
            IsPrimary: true,
          }],
        },
        Addresses: {
          Address: [{
            Type: 'Legal',
            Country: 643,
            AddressCode: '77000000000000100',
            Street: 'Тверская',
            Hous: '1',
          }],
        },
        Email: 'info@romashka.ru',
        Tel: '+74951234567',
      },
    },
    CarOwner: {
      Juridical: {
        Resident: true,
        FullName: 'Общество с ограниченной ответственностью "Ромашка"',
        BriefName: 'ООО "Ромашка"',
        OPF: 'ООО',
        INN: '7701234567',
        Documents: {
          Document: [{
            Type: 31,
            Serial: '01',
            Number: '010101011',
            Date: '2006-04-07',
            IsPrimary: true,
          }],
        },
        Addresses: {
          Address: [{
            Type: 'Legal',
            Country: 643,
            AddressCode: '77000000000000100',
            Street: 'Тверская',
            Hous: '1',
          }],
        },
      },
    },
    // Для ЮЛ обычно мультидрайв
    IKP1: ' ',
    CashPaymentOption: false,
  } as EosagoApplication;

  return application;
}

// ═══════════════════════════════════════════════════════════
// Пример 6: Обработка ошибок
// ═══════════════════════════════════════════════════════════

async function errorHandlingExample() {
  const config: SoglasieConfig = {
    login: 'PARTNER_LOGIN',
    password: 'PARTNER_PASSWORD',
    environment: 'test',
  };

  const client = createClient(config);

  const application: EosagoApplication = {
    // ... данные
  } as EosagoApplication;

  try {
    const result = await client.loadApplication(application);
    const status = await client.getStatus(result.policyId);

    switch (status.policy?.status) {
      case ApplicationStatus.RSA_CHECK_FAIL:
        // Данные не прошли проверку РСА
        console.log('Ошибки проверки:', status.rsacheck);
        // Исправить данные и создать новое заявление
        break;

      case ApplicationStatus.SK_CHECK_FAIL:
        // Проверка в СК не пройдена
        console.log('Ошибки:', status.lastError);
        // Связаться с куратором
        break;

      case ApplicationStatus.SIGNED:
        // Успех!
        console.log('Полис оформлен');
        break;

      default:
        console.log('Статус:', status.policy?.status);
    }
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
        case 404:
          console.error('Заявление не найдено');
          break;
        case 409:
          console.error('Конфликт данных');
          break;
        case 500:
          console.error('Ошибка сервера');
          break;
        default:
          console.error('Ошибка:', error.message);
      }
    }
  }
}

// Export all examples
export const examples = {
  basic: basicExample,
  withKbm: withKbmExample,
  workflow: workflowExample,
  prolongation: prolongationExample,
  juridical: juridicalExample,
  errorHandling: errorHandlingExample,
};
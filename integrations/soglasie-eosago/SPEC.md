# Е-ОСАГО API Integration Specification

## Overview

API интеграция с Страховой Компанией "Согласие" для оформления электронного полиса ОСАГО (Е-ОСАГО).

**Production URL:** `https://b2b.soglasie.ru`  
**Test URL:** `https://b2b.soglasie.ru/daily`  
**Test URL (new partners):** `https://b2b.soglasie.ru/upload-test`

**Support:** +7 495 739-01-01, доб. 2444

---

## Workflow (11 этапов)

```
Этап 01: Проверка КБМ 2.0 (опционально для мультидрайв)
Этап 02: Расчет премии
Этап 03: Загрузка заявления
Этап 04: Проверка статуса загруженного заявления
Этап 05: Скачивание ПФ Заявления (опционально)
Этап 06: Перевод заявления в статус "Оформление прекращено" (при необходимости)
Этап 07: Получение ссылки на оплату полиса
Этап 08: Запись данных об успешной оплате полиса
Этап 09: Создание, Поиск, Аннулирование и Оплата Счета (для ЮЛ)
Этап 10: Скачивание ПФ полиса (опционально)
Этап 11: Загрузка документов (опционально)
```

---

## Authentication

All requests require Basic Auth header:

```
Authorization: Basic base64encode(Login + ":" + Password)
```

For some services (loading application):
```
Authorization: Basic base64encode(Login + ":" + SubUser + ":" + SubUserPassword)
```

Content-Type: `application/json`

---

## Этап 1: Проверка КБМ 2.0

**Purpose:** Получение коэффициента КБМ водителей для расчета премии

**Endpoint:**
```
POST https://b2b.soglasie.ru/rsaproxy/api/osago/v1/kbm
POST https://b2b.soglasie.ru/daily/rsaproxy/api/osago/v1/kbm  (test)
POST https://b2b.soglasie.ru/upload-test/rsaproxy/api/osago/v1/kbm  (new partners test)
```

### Request

```json
{
  "vehicleId": {
    "vin": "XTA219020D4875665"
  },
  "driverLimitIndicator": true,
  "contractEffectiveDate": "2024-06-01",
  "contractClosingDate": "2024-06-01",
  "persons": [
    {
      "driverLicense": {
        "countryCode": "643",
        "docType": 20,
        "docSeries": "9900",
        "docNumber": "878787",
        "lastName": "Иванов",
        "firstName": "Иван",
        "middleName": "Иванович",
        "birthDate": "1969-02-29"
      }
    }
  ]
}
```

### Response

```json
{
  "requestId": "00000000-0000-0000-353f-ca13ec8935ea",
  "statusCode": 3,
  "processingResult": {
    "calculatedKbmValue": 0.83,
    "calculateKbmResponses": [
      {
        "partyRequestId": "477edf1b-c7be-74e1-ad32-091811e87da3",
        "kbm": 0.46,
        "originalKbm": 0.5
      }
    ]
  }
}
```

### Key Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| driverLimitIndicator | boolean | true = ограниченное число водителей, false = мультидрайв |
| vehicleId.vin | string | VIN ТС (17 символов) |
| vehicleId.licensePlate | string | Госномер |
| driverLicense.docType | int | Код типа ВУ (20 = РФ, 21 = международное) |
| contractEffectiveDate | string | Дата начала действия договора |
| contractClosingDate | string | Дата заключения договора |

---

## Этап 2: Расчет премии

**Purpose:** Расчет страховой премии перед оформлением

**Endpoint:**
```
SOAP: https://b2b.soglasie.ru/CCM/CCMService
WSDL: https://b2b.soglasie.ru/CCM/CCMPort.wsdl
```

### SOAP Request Example

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ccm="http://ccm.b2b.soglasie.ru/">
  <soapenv:Header/>
  <soapenv:Body>
    <ccm:calcProduct>
      <data>
        <subuser>subuser</subuser>
        <product>
          <brief>ОСАГО</brief>
        </product>
        <contract>
          <datebeg>2024-02-03T00:00:00</datebeg>
          <dateend>2025-02-02T23:59:59</dateend>
          <param>
            <brief>ВидДокумента</brief>
            <val>ДогСтрахЕОСАГО</val>
          </param>
          <param>
            <brief>ДопускБезОграничений</brief>
            <val>0</val>
          </param>
          <param>
            <brief>ИДРасчетаКБМ</brief>
            <val>00000000-0000-0000-87b8-a200181f2705</val>
          </param>
          <param>
            <brief>VIN</brief>
            <val>KNMCSHLMS6P616441</val>
          </param>
          <param>
            <brief>МодельТС</brief>
            <val>38372</val>
          </param>
          <param>
            <brief>Мощность</brief>
            <val>107.0</val>
          </param>
          <param>
            <brief>ПериодИсп</brief>
            <val>12</val>
          </param>
          <param>
            <brief>ПотокВвода</brief>
            <val>24</val>
          </param>
          <param>
            <brief>ПризнСтрахПрицеп</brief>
            <val>0</val>
          </param>
          <param>
            <brief>Пролонгация</brief>
            <val>0</val>
          </param>
          <param>
            <brief>СрокСтрах</brief>
            <val>8</val>
          </param>
          <param>
            <brief>ТерриторияИспользования</brief>
            <val>2200000900000</val>
          </param>
          <param>
            <brief>ТипСобственникаТС</brief>
            <val>1001</val>
          </param>
          <param>
            <brief>ТипТСОСАГО</brief>
            <val>2</val>
          </param>
          <param>
            <brief>ТранзитныйНомер</brief>
            <val>0</val>
          </param>
          <param>
            <brief>ТСИностранное</brief>
            <val>0</val>
          </param>
          <coeff>
            <brief>Кбм</brief>
            <val>0.85</val>
          </coeff>
          <datecalc>2024-02-01T00:00:00</datecalc>
        </contract>
        <calc>
          <saveOnError>true</saveOnError>
        </calc>
      </data>
    </ccm:calcProduct>
  </soapenv:Body>
</soapenv:Envelope>
```

### Key Parameters for Calculation

| ID | Parameter | Type | Required | Description |
|----|-----------|------|----------|-------------|
| 1128 | ДопускБезОграничений | int | Yes | 0 = ограниченные, 1 = мультидрайв |
| 5823 | ИДРасчетаКБМ | string | If limited | requestId от КБМ 2.0 |
| 687 | Кбм | double | Yes | КБМ от сервиса КБМ |
| 22 | МодельТС | int | Yes | Код модели из справочника |
| 3 | Мощность | double | Yes | Мощность двигателя |
| 1129 | ПериодИсп | int | Yes | Период использования в месяцах |
| 1322 | ПотокВвода | int | Yes | 24 для Е-ОСАГО |
| 1402 | ПризнСтрахПрицеп | int | Yes | 0 = нет, 1 = есть |
| 722 | Пролонгация | int | Yes | 0 = нет, 1 = да |
| 29 | СрокСтрах | int | Yes | Срок страхования |
| 1122 | ТерриторияИспользования | int | Yes | Код КЛАДР |
| 961 | ТипСобственникаТС | int | Yes | Код типа собственника |
| 642 | ТипТСОСАГО | int | Yes | Код типа ТС |
| 43 | ТСИностранное | int | Yes | 0 = РФ, 1 = иностранное |

---

## Этап 3: Загрузка заявления

**Purpose:** Загрузка заявления ЕОСАГО в систему

**Endpoint:**
```
POST https://b2b.soglasie.ru/online/api/eosago
POST https://b2b.soglasie.ru/daily/online/api/eosago  (test)
POST https://b2b.soglasie.ru/upload-test/online/api/eosago  (new partners test)
POST https://b2b.soglasie.ru/online/api/eosago?test=true  (draft mode, no RSA check)
```

### Request Structure

```json
{
  "DeclarationDate": "2024-08-23T00:00:00",
  "BeginDate": "2024-09-21T00:00:00",
  "EndDate": "2025-09-20T23:59:59",
  "PrevPolicy": {
    "Serial": "XXX",
    "Number": "0136648601"
  },
  "PrevPolicyOther": {
    "SerialOther": "XXX",
    "NumberOther": "0166775667"
  },
  "Period1Begin": "2024-09-21",
  "Period1End": "2025-09-20",
  "IsTransCar": false,
  "CarInfo": {
    "VIN": "JHMGD18486210131",
    "LicensePlate": "Х762КМ187",
    "MarkModelCarCode": 21372,
    "MarkPTS": "Honda",
    "ModelPTS": "JAZZ",
    "YearIssue": 2006,
    "DocumentCar": {
      "TypeRSA": "31",
      "Serial": "4509",
      "Number": "338463",
      "Date": "2019-03-30"
    },
    "EngCap": 83,
    "GoalUse": "Personal",
    "Rented": "false"
  },
  "Insurer": {
    "Phisical": {
      "Resident": true,
      "Surname": "Кораблева",
      "Name": "Светлана",
      "Patronymic": "Александровна",
      "BirthDate": "1961-04-03",
      "Sex": "female",
      "Documents": {
        "Document": [{
          "TypeRSA": "12",
          "Serial": "8459",
          "Number": "453284",
          "Date": "2006-04-07",
          "IsPrimary": true
        }]
      },
      "Addresses": {
        "Address": [{
          "Type": "Registered",
          "Country": "643",
          "AddressCode": "77000000000739200",
          "Hous": "24",
          "IsPrimary": true
        }]
      },
      "Email": "48592521456@mail.ru",
      "PhoneMobile": "+79261231212"
    }
  },
  "CarOwner": {
    "Phisical": { ... }
  },
  "Drivers": {
    "Driver": [{
      "Face": {
        "Resident": true,
        "Surname": "Кораблев",
        "Name": "Анатолий",
        "Patronymic": "Александрович",
        "BirthDate": "1987-06-24",
        "Sex": "male",
        "Documents": {
          "Document": [{
            "TypeRSA": 22,
            "Serial": "4593",
            "Number": "933881",
            "Date": "2016-01-26"
          }]
        }
      },
      "DrivingExpDate": "2006-01-27"
    }]
  },
  "IKP1": " ",
  "CashPaymentOption": false
}
```

### Response

```json
{
  "policyId": 81418729,
  "packageId": 123
}
```

### CarInfo Parameters

| Parameter | Type | Required | Description |
|------------|------|----------|-------------|
| VIN | string | No* | VIN (17 symbols) |
| BodyNumber | string | No* | Номер кузова |
| ChassisNumber | string | No* | Номер шасси |
| LicensePlate | string | No | Госномер |
| MarkModelCarCode | int | Yes | Код модели из справочника |
| MarkPTS | string | Yes | Марка по ПТС |
| ModelPTS | string | Yes | Модель по ПТС |
| YearIssue | int | Yes | Год выпуска |
| DocumentCar | object | Yes | Документ ТС (СТС) |
| EngCap | number | Yes | Мощность двигателя |
| GoalUse | string | Yes | Цель использования |
| Rented | boolean | Yes | Признак аренды |

### Insurer/CarOwner Structure

Supports both:
- **Phisical**: Физическое лицо (required for at least one)
- **Juridical**: Юридическое лицо (by agreement with curator)

For Phisical:
| Parameter | Type | Required |
|------------|------|-----------|
| Resident | boolean | Yes |
| PBOUL | boolean | No (true for IP) |
| Surname | string | Yes |
| Name | string | Yes |
| Patronymic | string | No |
| BirthDate | string | Yes |
| Sex | string | Yes (male/female) |
| INN | string | No |
| Documents | array | Yes |
| Addresses | array | No |
| Email | string | Yes (for Insurer) |
| PhoneMobile | string | Yes (for Insurer) |

### Drivers Structure

| Parameter | Type | Required |
|------------|------|----------|
| Face | object | Yes |
| Face.Resident | boolean | Yes |
| Face.Surname | string | Yes |
| Face.Name | string | Yes |
| Face.BirthDate | string | Yes |
| Face.Sex | string | Yes |
| Face.Documents | array | Yes (driver license) |
| DrivingExpDate | string | Yes |

---

## Этап 4: Проверка статуса заявления

**Purpose:** Проверка статуса загруженного заявления

**Endpoint:**
```
GET https://b2b.soglasie.ru/online/api/eosago/{policyId}/status
GET https://b2b.soglasie.ru/daily/online/api/eosago/{policyId}/status
GET https://b2b.soglasie.ru/upload-test/online/api/eosago/{policyId}/status
```

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| akv=true | Return AKV value |
| overlimit=true | Return overlimit flag |

### Response

```json
{
  "date": "2024-06-04T19:18:31",
  "policyId": 81418729,
  "status": "COMPLETE",
  "lastError": "Переведено в статус: Вступил в силу",
  "policy": {
    "status": "SIGNED",
    "statusName": "Вступил в силу",
    "policyserial": "ХХХ",
    "policyno": "0162041563",
    "premium": 21549.71,
    "surcharge": 0,
    "redirect": "0",
    "delivery": false,
    "drivers": [
      {
        "name": "Иванов Иван Иванович",
        "kbm": 0.46,
        "kbmClass": "13"
      }
    ],
    "coeffs": [
      {"brief": "БТ", "name": "Базовый тариф", "value": 7535},
      {"brief": "КТ", "name": "Коэффициент территориального использования", "value": 1.8},
      {"brief": "КБМ", "name": "Коэффициент Бонус-Малус", "value": 1.17}
    ]
  },
  "rsacheck": [...],
  "contractid": 282644084
}
```

### Status Values

| Status | Description | Next Action |
|--------|-------------|-------------|
| DRAFT | Предварительный | Wait for processing |
| RSA_CHECK | Отправлено в РСА | Wait |
| RSA_CHECK_FAIL | Не прошло проверку РСА | Fix and resubmit |
| RSA_CHECK_OK | Успешная проверка РСА | Go to payment |
| SK_CHECK | На проверке в СК | Wait |
| SK_CHECK_FAIL | Не прошло проверку СК | Fix and resubmit |
| SK_CHECK_OK | Успешная проверка СК | Go to payment |
| PAY_COMPLETE | Документ оплачен | Continue polling |
| RSA_SIGN | Отправлено на подписание | Wait |
| RSA_SIGNED | Подписано в РСА | Wait |
| SIGNED | Вступил в силу | Complete |
| SUSPENDED | Оформление прекращено | End |
| CANCELED | Досрочно прекращен | End |
| OTHER_SK | Передано в ЕГАРАНТ | Redirect to eGarant |

---

## Этап 7: Получение ссылки на оплату

**Purpose:** Получение ссылки для оплаты полиса

**Endpoint:**
```
GET https://b2b.soglasie.ru/online/api/eosago/{policyId}/paylink
GET https://b2b.soglasie.ru/daily/online/api/eosago/{policyId}/paylink
GET https://b2b.soglasie.ru/upload-test/online/api/eosago/{policyId}/paylink
```

### Response

```json
{
  "policyId": 81418729,
  "PayDate": "2024-06-04T19:18:31",
  "PayLink": "https://www.soglasie.ru/..."
}
```

---

## Этап 8: Запись успешной оплаты

**Purpose:** Запись данных об оплате через внешний эквайринг

**Endpoint:**
```
POST https://b2b.soglasie.ru/online/api/eosago/{policyId}/acquiring
POST https://b2b.soglasie.ru/daily/online/api/eosago/{policyId}/acquiring
POST https://b2b.soglasie.ru/upload-test/online/api/eosago/{policyId}/acquiring
```

### Request

```json
{
  "PaySum": 21549.71,
  "TransactionID": "TXN123456789",
  "OrderId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Response

HTTP 200 OK

---

## Справочники (Catalogs)

**Catalogs URL:** `https://b2b.soglasie.ru/CCMC/catalog.jsp`

| Catalog ID | Description |
|------------|-------------|
| 1436 | Модели ТС |
| 1716 | Типы ТС |
| 1718 | Цели использования ТС |
| 1722 | Сроки страхования |
| 1024 | Страны (ОКСМ) |
| 1 | Типы собственника ТС |

---

## Dictionaries

### Document Types (TypeRSA)

| Code | Description |
|------|-------------|
| 12 | Паспорт гражданина РФ |
| 20 | Водительское удостоверение РФ |
| 21 | Международное ВУ |
| 31 | Свидетельство о регистрации ТС (СТС) |
| 62 | Свидетельство о регистрации ЮЛ |
| 63 | Выписка ЕГРЮЛ |

### GoalUse Values

| Value | Description |
|-------|-------------|
| Personal | Личные |
| RidingTraining | Учебная езда |
| Taxi | Такси |
| Rent | Прокат/аренда |
| RegularPassengers | Регулярные пассажирские перевозки |
| Other | Прочие |

---

## Error Handling

### Error Response Structure

```json
{
  "error": "Текст ошибки",
  "errorInfo": "Описание ошибки",
  "errorData": "Данные запроса"
}
```

### Common Errors

- RSA_CHECK_FAIL: Проверка в РСА не пройдена - требуется исправить данные
- SK_CHECK_FAIL: Проверка в СК не пройдена - связаться с куратором
- DRAFT: Черновик - нельзя перейти к оплате

---

## Testing Requirements

Для доступа к боевой среде необходимо загрузить в будний день до 12:00 (кроме последних 3 дней месяца):

1. Полис с ограниченным числом водителей (минимум 3, 1 НЕ存在于 системе СК Согласие)
2. Мультидрайв полис

Требования к данным:
- Реалистичные ФИО
- Реалистичные адреса
- Реалистичные данные документов

После тестирования предоставить:
- ПФ заявлений
- Логи обращений/ответов
- Номера созданных договоров

---

## Version History

| Date | Change |
|------|--------|
| 20.02.2024 | МодельТС - обязательный |
| 04.06.2025 | Добавлены адреса для тестовой загрузки |
| 04.06.2025 | Добавлен статус DRAFT в описание |
| 13.08.2025 | Обновлены значения GoalUse |
| 17.10.2025 | Добавлены параметры InsurerPay, SpecialConditions |
| 23.10.2025 | Добавлены параметры Body |

---

## Notes

- Все даты в формате ISO 8601: `YYYY-MM-DD` или `YYYY-MM-DDTHH:MM:SS`
- Кодировка: UTF-8
- SubUser используется для разделения партнеров
- При ошибке RSA_CHECK_FAIL нужно исправить данные и загрузить новое заявление
- Полить можно только после статуса RSA_CHECK_OK или SK_CHECK_OK
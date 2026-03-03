export interface OcrResult {
  documentType: string;
  confidence: number;
  fields: Record<string, string>;
  rawText: string;
}

export const DOCUMENT_FIELDS: Record<string, string[]> = {
  passport: [
    'lastName', 'firstName', 'middleName', 'birthDate', 'birthPlace',
    'series', 'number', 'issuedBy', 'issuedDate', 'code', 'gender', 'registrationAddress',
  ],
  driver_license: [
    'lastName', 'firstName', 'middleName', 'birthDate', 'issueDate',
    'expiryDate', 'number', 'categories', 'experienceStartDate',
  ],
  vehicle_registration: [
    'series', 'number', 'licensePlate', 'vin', 'make', 'model',
    'year', 'color', 'category', 'ownerName',
  ],
  pts: [
    'series', 'number', 'vin', 'make', 'model', 'year',
    'engineNumber', 'bodyNumber', 'color', 'enginePower', 'ownerName',
  ],
  sts: [
    'series', 'number', 'licensePlate', 'vin', 'make', 'model',
    'year', 'color', 'category', 'ownerName',
  ],
  diagnostic_card: ['number', 'validUntil', 'vin', 'licensePlate'],
};

const FIELD_LABELS: Record<string, string> = {
  lastName: 'Фамилия',
  firstName: 'Имя',
  middleName: 'Отчество',
  birthDate: 'Дата рождения',
  birthPlace: 'Место рождения',
  series: 'Серия',
  number: 'Номер',
  issuedBy: 'Кем выдан',
  issuedDate: 'Дата выдачи',
  code: 'Код подразделения',
  gender: 'Пол',
  registrationAddress: 'Адрес регистрации',
  issueDate: 'Дата выдачи',
  expiryDate: 'Срок действия',
  categories: 'Категории',
  experienceStartDate: 'Начало стажа',
  licensePlate: 'Гос. номер',
  vin: 'VIN',
  make: 'Марка',
  model: 'Модель',
  year: 'Год выпуска',
  color: 'Цвет',
  category: 'Категория ТС',
  ownerName: 'Владелец',
  engineNumber: 'Номер двигателя',
  bodyNumber: 'Номер кузова',
  enginePower: 'Мощность двигателя',
  validUntil: 'Действительна до',
};

export { FIELD_LABELS };

const MOCK_DATA: Record<string, Record<string, string>> = {
  passport: {
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    birthDate: '15.03.1985',
    birthPlace: 'г. Москва',
    series: '4510',
    number: '123456',
    issuedBy: 'ОУФМС России по г. Москве в р-не Хамовники',
    issuedDate: '20.07.2015',
    code: '770-020',
    gender: 'Мужской',
    registrationAddress: 'г. Москва, ул. Ленина, д. 1, кв. 10',
  },
  driver_license: {
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    birthDate: '15.03.1985',
    issueDate: '10.05.2018',
    expiryDate: '10.05.2028',
    number: '77 ОО 123456',
    categories: 'B, C',
    experienceStartDate: '10.05.2005',
  },
  vehicle_registration: {
    series: '99 45',
    number: '123456',
    licensePlate: 'А123ВС77',
    vin: 'XWEJC411BC0001234',
    make: 'LADA',
    model: 'Vesta',
    year: '2021',
    color: 'Белый',
    category: 'B',
    ownerName: 'Иванов Иван Иванович',
  },
  pts: {
    series: '77 ОА',
    number: '123456',
    vin: 'XWEJC411BC0001234',
    make: 'LADA',
    model: 'Vesta',
    year: '2021',
    engineNumber: 'AB12345678',
    bodyNumber: 'XWEJC411BC0001234',
    color: 'Белый',
    enginePower: '106 л.с.',
    ownerName: 'Иванов Иван Иванович',
  },
  sts: {
    series: '99 45',
    number: '123456',
    licensePlate: 'А123ВС77',
    vin: 'XWEJC411BC0001234',
    make: 'LADA',
    model: 'Vesta',
    year: '2021',
    color: 'Белый',
    category: 'B',
    ownerName: 'Иванов Иван Иванович',
  },
  diagnostic_card: {
    number: '0012345678901234',
    validUntil: '31.12.2025',
    vin: 'XWEJC411BC0001234',
    licensePlate: 'А123ВС77',
  },
};

function generateMockOcrResult(documentType: string): OcrResult {
  const fields = MOCK_DATA[documentType] ?? MOCK_DATA['passport'];
  const rawParts = Object.entries(fields).map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`);
  return {
    documentType,
    confidence: 0.94,
    fields,
    rawText: rawParts.join('\n'),
  };
}

export async function recognizeDocument(imageData: string, documentType: string): Promise<OcrResult> {
  // Mock: задержка 1.5s + возврат реалистичных данных
  await new Promise(resolve => setTimeout(resolve, 1500));
  return generateMockOcrResult(documentType);
}

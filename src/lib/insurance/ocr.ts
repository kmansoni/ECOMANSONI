export interface OcrResult {
  documentType: string;
  confidence: number;
  fields: Record<string, string>;
  rawText: string;
  error?: string;
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

export async function recognizeDocument(_imageData: string, documentType: string): Promise<OcrResult> {
  // OCR-провайдер не подключён — пользователь заполняет вручную
  const fields = DOCUMENT_FIELDS[documentType] ?? DOCUMENT_FIELDS['passport'];
  const emptyFields: Record<string, string> = {};
  for (const f of fields) emptyFields[f] = '';

  return {
    documentType,
    confidence: 0,
    fields: emptyFields,
    rawText: '',
    error: 'OCR не настроен. Заполните данные вручную.',
  };
}

/** ФИАС / DaData types */

import { navText } from '@/lib/navigation/navigationUi';

export interface FiasAddress {
  /** Полный адрес строкой */
  value: string;
  /** Нестандартизированный полный адрес */
  unrestrictedValue: string;

  // ── Идентификаторы ────────────────────────────────────────────────
  fiasId: string | null;
  fiasLevel: string | null; // '1'-region … '8'-house … '9'-flat
  kladrId: string | null;

  // ── Иерархия ──────────────────────────────────────────────────────
  postalCode: string | null;
  country: string;
  regionFiasId: string | null;
  region: string | null;
  regionType: string | null; // "обл", "г", "край", "респ"
  cityFiasId: string | null;
  city: string | null;
  cityType: string | null;
  streetFiasId: string | null;
  street: string | null;
  streetType: string | null;
  house: string | null;
  houseType: string | null;
  block: string | null;
  blockType: string | null;
  flat: string | null;
  flatType: string | null;

  // ── Координаты ────────────────────────────────────────────────────
  geoLat: number | null;
  geoLon: number | null;

  // ── Коды ──────────────────────────────────────────────────────────
  okato: string | null;
  oktmo: string | null;
  timezone: string | null;

  // ── Качество ──────────────────────────────────────────────────────
  qcGeo: number | null;    // 0=точный, 1=ближайший дом, 2=улица, 3=город, 4=не определён
  qcComplete: number | null;
  qcHouse: number | null;
}

export interface DaDataSuggestion {
  value: string;
  unrestricted_value: string;
  data: DaDataAddressData;
}

export interface DaDataAddressData {
  postal_code: string | null;
  country: string;
  country_iso_code: string;
  region_fias_id: string | null;
  region_kladr_id: string | null;
  region_with_type: string | null;
  region_type: string | null;
  region: string | null;
  area_fias_id: string | null;
  area: string | null;
  city_fias_id: string | null;
  city_kladr_id: string | null;
  city_with_type: string | null;
  city_type: string | null;
  city: string | null;
  settlement_fias_id: string | null;
  settlement: string | null;
  street_fias_id: string | null;
  street_kladr_id: string | null;
  street_with_type: string | null;
  street_type: string | null;
  street: string | null;
  house_fias_id: string | null;
  house_kladr_id: string | null;
  house_type: string | null;
  house: string | null;
  block_type: string | null;
  block: string | null;
  flat_type: string | null;
  flat: string | null;
  fias_id: string | null;
  fias_level: string | null;
  kladr_id: string | null;
  capital_marker: string | null;
  okato: string | null;
  oktmo: string | null;
  timezone: string | null;
  geo_lat: string | null;
  geo_lon: string | null;
  qc_geo: string | null;
  qc_complete: string | null;
  qc_house: string | null;
}

export interface DaDataOrganization {
  value: string; // Краткое название
  unrestricted_value: string;
  data: {
    inn: string | null;
    ogrn: string | null;
    kpp: string | null;
    name: {
      full_with_opf: string;
      short_with_opf: string | null;
    };
    type: string; // "LEGAL" | "INDIVIDUAL"
    address: {
      value: string;
      unrestricted_value: string;
      data: DaDataAddressData;
    } | null;
    phones: Array<{ value: string }> | null;
    emails: Array<{ value: string }> | null;
    okved: string | null;
    okved_type: string | null;
    management?: {
      name: string;
      post: string;
    };
    state?: {
      status: string; // "ACTIVE", "LIQUIDATING", "LIQUIDATED"
      registration_date: number | null;
    };
  };
}

export interface DaDataOrgSuggestion {
  value: string;
  unrestricted_value: string;
  data: DaDataOrganization['data'];
}

export type POICategory =
  | 'shop'
  | 'cafe'
  | 'restaurant'
  | 'pharmacy'
  | 'fuel'
  | 'bank'
  | 'atm'
  | 'hospital'
  | 'hotel'
  | 'parking'
  | 'car_wash'
  | 'car_service'
  | 'beauty'
  | 'gym'
  | 'education'
  | 'office'
  | 'government'
  | 'other';

export const POI_CATEGORY_LABELS: Record<POICategory, string> = {
  shop: 'Магазин',
  cafe: 'Кафе',
  restaurant: 'Ресторан',
  pharmacy: 'Аптека',
  fuel: 'Заправка',
  bank: 'Банк',
  atm: 'Банкомат',
  hospital: 'Больница',
  hotel: 'Отель',
  parking: 'Парковка',
  car_wash: 'Автомойка',
  car_service: 'Автосервис',
  beauty: 'Красота',
  gym: 'Фитнес',
  education: 'Образование',
  office: 'Офис',
  government: 'Госучреждение',
  other: 'Другое',
};

export function getPoiCategoryLabel(category: POICategory, languageCode?: string | null): string {
  switch (category) {
    case 'shop': return navText('Магазин', 'Shop', languageCode);
    case 'cafe': return navText('Кафе', 'Cafe', languageCode);
    case 'restaurant': return navText('Ресторан', 'Restaurant', languageCode);
    case 'pharmacy': return navText('Аптека', 'Pharmacy', languageCode);
    case 'fuel': return navText('Заправка', 'Fuel', languageCode);
    case 'bank': return navText('Банк', 'Bank', languageCode);
    case 'atm': return navText('Банкомат', 'ATM', languageCode);
    case 'hospital': return navText('Больница', 'Hospital', languageCode);
    case 'hotel': return navText('Отель', 'Hotel', languageCode);
    case 'parking': return navText('Парковка', 'Parking', languageCode);
    case 'car_wash': return navText('Автомойка', 'Car wash', languageCode);
    case 'car_service': return navText('Автосервис', 'Auto service', languageCode);
    case 'beauty': return navText('Красота', 'Beauty', languageCode);
    case 'gym': return navText('Фитнес', 'Fitness', languageCode);
    case 'education': return navText('Образование', 'Education', languageCode);
    case 'office': return navText('Офис', 'Office', languageCode);
    case 'government': return navText('Госучреждение', 'Government', languageCode);
    case 'other':
    default:
      return navText('Другое', 'Other', languageCode);
  }
}

export const POI_CATEGORY_ICONS: Record<POICategory, string> = {
  shop: '🛒',
  cafe: '☕',
  restaurant: '🍽️',
  pharmacy: '💊',
  fuel: '⛽',
  bank: '🏦',
  atm: '💳',
  hospital: '🏥',
  hotel: '🏨',
  parking: '🅿️',
  car_wash: '🚿',
  car_service: '🔧',
  beauty: '💅',
  gym: '🏋️',
  education: '🎓',
  office: '🏢',
  government: '🏛️',
  other: '📍',
};

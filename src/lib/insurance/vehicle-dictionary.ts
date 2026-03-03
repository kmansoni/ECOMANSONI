export interface VehicleMake {
  id: string;
  name: string;
  nameRu: string;
  country: string;
  models: VehicleModel[];
}

export interface VehicleModel {
  id: string;
  name: string;
  nameRu?: string;
  years: { from: number; to: number };
  bodyTypes: ('sedan' | 'hatchback' | 'suv' | 'crossover' | 'wagon' | 'coupe' | 'convertible' | 'minivan' | 'pickup' | 'van')[];
  enginePowerRange: { min: number; max: number };
  priceRange: { min: number; max: number }; // в рублях
}

export interface VehicleType {
  id: string;
  name: string;
  nameRu: string;
  category: 'A' | 'B' | 'C' | 'D' | 'E' | 'Tb' | 'Tm';
  description: string;
}

export const VEHICLE_TYPES: VehicleType[] = [
  { id: 'motorcycle', name: 'Motorcycle', nameRu: 'Мотоцикл', category: 'A', description: 'Мотоциклы и мопеды' },
  { id: 'car', name: 'Car', nameRu: 'Легковой автомобиль', category: 'B', description: 'Легковые автомобили до 3.5 тонн' },
  { id: 'truck', name: 'Truck', nameRu: 'Грузовой автомобиль', category: 'C', description: 'Грузовые автомобили свыше 3.5 тонн' },
  { id: 'bus', name: 'Bus', nameRu: 'Автобус', category: 'D', description: 'Автобусы для перевозки пассажиров' },
  { id: 'trailer', name: 'Trailer', nameRu: 'Прицеп', category: 'E', description: 'Прицепы и полуприцепы' },
  { id: 'trolleybus', name: 'Trolleybus', nameRu: 'Троллейбус', category: 'Tb', description: 'Электрический городской транспорт' },
  { id: 'tram', name: 'Tram', nameRu: 'Трамвай', category: 'Tm', description: 'Рельсовый городской транспорт' },
];

export const VEHICLE_MAKES: VehicleMake[] = [
  {
    id: 'lada',
    name: 'LADA',
    nameRu: 'LADA (ВАЗ)',
    country: 'Россия',
    models: [
      { id: 'vesta', name: 'Vesta', years: { from: 2015, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 106, max: 145 }, priceRange: { min: 1200000, max: 2100000 } },
      { id: 'granta', name: 'Granta', years: { from: 2011, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 87, max: 106 }, priceRange: { min: 800000, max: 1400000 } },
      { id: 'niva_travel', name: 'Niva Travel', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 80, max: 80 }, priceRange: { min: 1300000, max: 1700000 } },
      { id: 'niva_legend', name: 'Niva Legend', nameRu: 'Нива Легенд', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 83, max: 83 }, priceRange: { min: 900000, max: 1100000 } },
      { id: 'largus', name: 'Largus', years: { from: 2012, to: 2024 }, bodyTypes: ['wagon', 'van'], enginePowerRange: { min: 84, max: 106 }, priceRange: { min: 900000, max: 1500000 } },
      { id: 'xray', name: 'XRAY', years: { from: 2016, to: 2022 }, bodyTypes: ['crossover'], enginePowerRange: { min: 90, max: 145 }, priceRange: { min: 900000, max: 1400000 } },
      { id: 'priora', name: 'Priora', nameRu: 'Приора', years: { from: 2007, to: 2018 }, bodyTypes: ['sedan', 'hatchback', 'wagon'], enginePowerRange: { min: 87, max: 98 }, priceRange: { min: 200000, max: 600000 } },
      { id: 'kalina', name: 'Kalina', nameRu: 'Калина', years: { from: 2004, to: 2018 }, bodyTypes: ['sedan', 'hatchback', 'wagon'], enginePowerRange: { min: 87, max: 98 }, priceRange: { min: 150000, max: 500000 } },
    ],
  },
  {
    id: 'kia',
    name: 'KIA',
    nameRu: 'KIA',
    country: 'Южная Корея',
    models: [
      { id: 'rio', name: 'Rio', years: { from: 2005, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 100, max: 123 }, priceRange: { min: 700000, max: 1600000 } },
      { id: 'ceed', name: 'Ceed', years: { from: 2006, to: 2024 }, bodyTypes: ['hatchback', 'wagon'], enginePowerRange: { min: 120, max: 204 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'sportage', name: 'Sportage', years: { from: 2004, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 132, max: 265 }, priceRange: { min: 1400000, max: 3500000 } },
      { id: 'seltos', name: 'Seltos', years: { from: 2019, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 123, max: 177 }, priceRange: { min: 1600000, max: 2800000 } },
      { id: 'k5', name: 'K5', years: { from: 2020, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 180, max: 290 }, priceRange: { min: 2500000, max: 4000000 } },
      { id: 'sorento', name: 'Sorento', years: { from: 2002, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 291 }, priceRange: { min: 2800000, max: 5500000 } },
      { id: 'carnival', name: 'Carnival', years: { from: 1999, to: 2024 }, bodyTypes: ['minivan'], enginePowerRange: { min: 200, max: 290 }, priceRange: { min: 4000000, max: 6000000 } },
      { id: 'soul', name: 'Soul', years: { from: 2008, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 120, max: 204 }, priceRange: { min: 1800000, max: 3200000 } },
    ],
  },
  {
    id: 'hyundai',
    name: 'Hyundai',
    nameRu: 'Хендай',
    country: 'Южная Корея',
    models: [
      { id: 'solaris', name: 'Solaris', years: { from: 2010, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 100, max: 123 }, priceRange: { min: 700000, max: 1600000 } },
      { id: 'creta', name: 'Creta', years: { from: 2016, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 114, max: 177 }, priceRange: { min: 1400000, max: 2800000 } },
      { id: 'tucson', name: 'Tucson', years: { from: 2004, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 130, max: 265 }, priceRange: { min: 2000000, max: 4000000 } },
      { id: 'santa_fe', name: 'Santa Fe', years: { from: 2000, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 155, max: 295 }, priceRange: { min: 3000000, max: 6000000 } },
      { id: 'sonata', name: 'Sonata', years: { from: 1998, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 150, max: 290 }, priceRange: { min: 2000000, max: 4500000 } },
      { id: 'elantra', name: 'Elantra', years: { from: 2000, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 128, max: 204 }, priceRange: { min: 1500000, max: 3000000 } },
      { id: 'i30', name: 'i30', years: { from: 2007, to: 2024 }, bodyTypes: ['hatchback', 'wagon'], enginePowerRange: { min: 120, max: 280 }, priceRange: { min: 1800000, max: 3500000 } },
      { id: 'palisade', name: 'Palisade', years: { from: 2018, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 191, max: 295 }, priceRange: { min: 4500000, max: 8000000 } },
    ],
  },
  {
    id: 'toyota',
    name: 'Toyota',
    nameRu: 'Тойота',
    country: 'Япония',
    models: [
      { id: 'camry', name: 'Camry', years: { from: 1992, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 150, max: 350 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'rav4', name: 'RAV4', years: { from: 1994, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 269 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'corolla', name: 'Corolla', years: { from: 1966, to: 2024 }, bodyTypes: ['sedan', 'hatchback', 'wagon'], enginePowerRange: { min: 122, max: 180 }, priceRange: { min: 1600000, max: 3000000 } },
      { id: 'lc200', name: 'Land Cruiser 200', years: { from: 2007, to: 2021 }, bodyTypes: ['suv'], enginePowerRange: { min: 235, max: 415 }, priceRange: { min: 5000000, max: 12000000 } },
      { id: 'lc300', name: 'Land Cruiser 300', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 227, max: 415 }, priceRange: { min: 8000000, max: 15000000 } },
      { id: 'prado', name: 'Land Cruiser Prado', years: { from: 1996, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 163, max: 282 }, priceRange: { min: 4500000, max: 10000000 } },
      { id: 'highlander', name: 'Highlander', years: { from: 2001, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 249, max: 313 }, priceRange: { min: 4000000, max: 8000000 } },
      { id: 'fortuner', name: 'Fortuner', years: { from: 2004, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 204 }, priceRange: { min: 3500000, max: 6000000 } },
    ],
  },
  {
    id: 'volkswagen',
    name: 'Volkswagen',
    nameRu: 'Фольксваген',
    country: 'Германия',
    models: [
      { id: 'polo', name: 'Polo', years: { from: 1975, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 80, max: 200 }, priceRange: { min: 800000, max: 2000000 } },
      { id: 'tiguan', name: 'Tiguan', years: { from: 2007, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 115, max: 320 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'touareg', name: 'Touareg', years: { from: 2002, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 190, max: 450 }, priceRange: { min: 5000000, max: 12000000 } },
      { id: 'golf', name: 'Golf', years: { from: 1974, to: 2024 }, bodyTypes: ['hatchback', 'wagon'], enginePowerRange: { min: 80, max: 320 }, priceRange: { min: 1500000, max: 4000000 } },
      { id: 'passat', name: 'Passat', years: { from: 1973, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 122, max: 280 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'jetta', name: 'Jetta', years: { from: 1979, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 110, max: 230 }, priceRange: { min: 1500000, max: 3500000 } },
      { id: 'taos', name: 'Taos', years: { from: 2021, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 110, max: 150 }, priceRange: { min: 2000000, max: 3500000 } },
      { id: 'id4', name: 'ID.4', years: { from: 2020, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 148, max: 299 }, priceRange: { min: 4000000, max: 7000000 } },
    ],
  },
  {
    id: 'skoda',
    name: 'Skoda',
    nameRu: 'Шкода',
    country: 'Чехия',
    models: [
      { id: 'octavia', name: 'Octavia', years: { from: 1996, to: 2024 }, bodyTypes: ['sedan', 'wagon', 'hatchback'], enginePowerRange: { min: 86, max: 245 }, priceRange: { min: 1500000, max: 4000000 } },
      { id: 'rapid', name: 'Rapid', years: { from: 2012, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 85, max: 150 }, priceRange: { min: 900000, max: 2000000 } },
      { id: 'kodiaq', name: 'Kodiaq', years: { from: 2016, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 125, max: 245 }, priceRange: { min: 3000000, max: 6000000 } },
      { id: 'karoq', name: 'Karoq', years: { from: 2017, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 115, max: 190 }, priceRange: { min: 2000000, max: 4000000 } },
      { id: 'superb', name: 'Superb', years: { from: 2001, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 150, max: 280 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'fabia', name: 'Fabia', years: { from: 1999, to: 2024 }, bodyTypes: ['hatchback', 'wagon'], enginePowerRange: { min: 65, max: 150 }, priceRange: { min: 1000000, max: 2500000 } },
    ],
  },
  {
    id: 'renault',
    name: 'Renault',
    nameRu: 'Рено',
    country: 'Франция',
    models: [
      { id: 'duster', name: 'Duster', years: { from: 2010, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 102, max: 150 }, priceRange: { min: 900000, max: 2000000 } },
      { id: 'logan', name: 'Logan', years: { from: 2004, to: 2022 }, bodyTypes: ['sedan'], enginePowerRange: { min: 75, max: 113 }, priceRange: { min: 500000, max: 1200000 } },
      { id: 'sandero', name: 'Sandero', years: { from: 2007, to: 2022 }, bodyTypes: ['hatchback'], enginePowerRange: { min: 75, max: 113 }, priceRange: { min: 500000, max: 1200000 } },
      { id: 'kaptur', name: 'Kaptur', years: { from: 2016, to: 2022 }, bodyTypes: ['crossover'], enginePowerRange: { min: 114, max: 150 }, priceRange: { min: 1000000, max: 2000000 } },
      { id: 'arkana', name: 'Arkana', years: { from: 2019, to: 2022 }, bodyTypes: ['crossover'], enginePowerRange: { min: 114, max: 150 }, priceRange: { min: 1200000, max: 2200000 } },
      { id: 'koleos', name: 'Koleos', years: { from: 2007, to: 2022 }, bodyTypes: ['suv'], enginePowerRange: { min: 135, max: 175 }, priceRange: { min: 1500000, max: 3000000 } },
    ],
  },
  {
    id: 'nissan',
    name: 'Nissan',
    nameRu: 'Ниссан',
    country: 'Япония',
    models: [
      { id: 'qashqai', name: 'Qashqai', years: { from: 2006, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 115, max: 190 }, priceRange: { min: 1800000, max: 3500000 } },
      { id: 'xtrail', name: 'X-Trail', years: { from: 2001, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 130, max: 224 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'almera', name: 'Almera', years: { from: 1995, to: 2020 }, bodyTypes: ['sedan'], enginePowerRange: { min: 80, max: 107 }, priceRange: { min: 300000, max: 1000000 } },
      { id: 'terrano', name: 'Terrano', years: { from: 2014, to: 2022 }, bodyTypes: ['crossover'], enginePowerRange: { min: 102, max: 135 }, priceRange: { min: 700000, max: 1500000 } },
      { id: 'murano', name: 'Murano', years: { from: 2002, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 185, max: 260 }, priceRange: { min: 2500000, max: 5500000 } },
      { id: 'pathfinder', name: 'Pathfinder', years: { from: 1985, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 170, max: 285 }, priceRange: { min: 3500000, max: 7000000 } },
      { id: 'juke', name: 'Juke', years: { from: 2010, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 86, max: 200 }, priceRange: { min: 1500000, max: 3500000 } },
    ],
  },
  {
    id: 'bmw',
    name: 'BMW',
    nameRu: 'БМВ',
    country: 'Германия',
    models: [
      { id: '3series', name: '3 Series', years: { from: 1975, to: 2024 }, bodyTypes: ['sedan', 'wagon', 'coupe', 'convertible'], enginePowerRange: { min: 156, max: 374 }, priceRange: { min: 2500000, max: 7000000 } },
      { id: '5series', name: '5 Series', years: { from: 1972, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 184, max: 530 }, priceRange: { min: 4000000, max: 10000000 } },
      { id: 'x3', name: 'X3', years: { from: 2003, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 184, max: 360 }, priceRange: { min: 4000000, max: 9000000 } },
      { id: 'x5', name: 'X5', years: { from: 1999, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 245, max: 530 }, priceRange: { min: 7000000, max: 18000000 } },
      { id: 'x1', name: 'X1', years: { from: 2009, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 136, max: 306 }, priceRange: { min: 2500000, max: 6000000 } },
      { id: '7series', name: '7 Series', years: { from: 1977, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 272, max: 544 }, priceRange: { min: 9000000, max: 25000000 } },
      { id: 'x6', name: 'X6', years: { from: 2008, to: 2024 }, bodyTypes: ['suv', 'coupe'], enginePowerRange: { min: 265, max: 530 }, priceRange: { min: 8000000, max: 20000000 } },
      { id: 'x7', name: 'X7', years: { from: 2018, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 340, max: 530 }, priceRange: { min: 10000000, max: 22000000 } },
    ],
  },
  {
    id: 'mercedes',
    name: 'Mercedes-Benz',
    nameRu: 'Мерседес-Бенц',
    country: 'Германия',
    models: [
      { id: 'c_class', name: 'C-Class', years: { from: 1993, to: 2024 }, bodyTypes: ['sedan', 'wagon', 'coupe', 'convertible'], enginePowerRange: { min: 156, max: 510 }, priceRange: { min: 3000000, max: 9000000 } },
      { id: 'e_class', name: 'E-Class', years: { from: 1976, to: 2024 }, bodyTypes: ['sedan', 'wagon', 'coupe', 'convertible'], enginePowerRange: { min: 194, max: 612 }, priceRange: { min: 5000000, max: 14000000 } },
      { id: 'glc', name: 'GLC', years: { from: 2015, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 194, max: 476 }, priceRange: { min: 5000000, max: 12000000 } },
      { id: 'gle', name: 'GLE', years: { from: 2015, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 245, max: 612 }, priceRange: { min: 7000000, max: 18000000 } },
      { id: 's_class', name: 'S-Class', years: { from: 1972, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 286, max: 630 }, priceRange: { min: 12000000, max: 35000000 } },
      { id: 'a_class', name: 'A-Class', years: { from: 1997, to: 2024 }, bodyTypes: ['hatchback', 'sedan'], enginePowerRange: { min: 109, max: 421 }, priceRange: { min: 2000000, max: 6000000 } },
      { id: 'gla', name: 'GLA', years: { from: 2013, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 136, max: 421 }, priceRange: { min: 3000000, max: 7000000 } },
      { id: 'glb', name: 'GLB', years: { from: 2019, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 163, max: 306 }, priceRange: { min: 4000000, max: 8000000 } },
    ],
  },
  {
    id: 'audi',
    name: 'Audi',
    nameRu: 'Ауди',
    country: 'Германия',
    models: [
      { id: 'a3', name: 'A3', years: { from: 1996, to: 2024 }, bodyTypes: ['hatchback', 'sedan'], enginePowerRange: { min: 110, max: 400 }, priceRange: { min: 2000000, max: 6000000 } },
      { id: 'a4', name: 'A4', years: { from: 1994, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 122, max: 450 }, priceRange: { min: 3000000, max: 8000000 } },
      { id: 'a6', name: 'A6', years: { from: 1994, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 190, max: 450 }, priceRange: { min: 4500000, max: 12000000 } },
      { id: 'q3', name: 'Q3', years: { from: 2011, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 300 }, priceRange: { min: 3000000, max: 6000000 } },
      { id: 'q5', name: 'Q5', years: { from: 2008, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 190, max: 450 }, priceRange: { min: 4500000, max: 10000000 } },
      { id: 'q7', name: 'Q7', years: { from: 2006, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 218, max: 450 }, priceRange: { min: 6000000, max: 14000000 } },
      { id: 'q8', name: 'Q8', years: { from: 2018, to: 2024 }, bodyTypes: ['suv', 'coupe'], enginePowerRange: { min: 286, max: 600 }, priceRange: { min: 9000000, max: 20000000 } },
      { id: 'a8', name: 'A8', years: { from: 1994, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 250, max: 500 }, priceRange: { min: 10000000, max: 25000000 } },
    ],
  },
  {
    id: 'mazda',
    name: 'Mazda',
    nameRu: 'Мазда',
    country: 'Япония',
    models: [
      { id: 'cx5', name: 'CX-5', years: { from: 2012, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 231 }, priceRange: { min: 2500000, max: 4500000 } },
      { id: 'm3', name: '3', years: { from: 2003, to: 2024 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 120, max: 186 }, priceRange: { min: 1500000, max: 3500000 } },
      { id: 'm6', name: '6', years: { from: 2002, to: 2023 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 150, max: 231 }, priceRange: { min: 2000000, max: 4000000 } },
      { id: 'cx9', name: 'CX-9', years: { from: 2006, to: 2023 }, bodyTypes: ['suv'], enginePowerRange: { min: 231, max: 250 }, priceRange: { min: 4000000, max: 7000000 } },
      { id: 'cx30', name: 'CX-30', years: { from: 2019, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 122, max: 186 }, priceRange: { min: 2000000, max: 4000000 } },
      { id: 'mx5', name: 'MX-5', years: { from: 1989, to: 2024 }, bodyTypes: ['convertible', 'coupe'], enginePowerRange: { min: 131, max: 184 }, priceRange: { min: 2500000, max: 4000000 } },
    ],
  },
  {
    id: 'honda',
    name: 'Honda',
    nameRu: 'Хонда',
    country: 'Япония',
    models: [
      { id: 'cr_v', name: 'CR-V', years: { from: 1995, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 272 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'civic', name: 'Civic', years: { from: 1972, to: 2024 }, bodyTypes: ['sedan', 'hatchback', 'coupe'], enginePowerRange: { min: 122, max: 320 }, priceRange: { min: 1500000, max: 4000000 } },
      { id: 'accord', name: 'Accord', years: { from: 1976, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 150, max: 272 }, priceRange: { min: 2500000, max: 5500000 } },
      { id: 'hr_v', name: 'HR-V', years: { from: 2015, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 129, max: 182 }, priceRange: { min: 1800000, max: 3500000 } },
      { id: 'pilot', name: 'Pilot', years: { from: 2008, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 280, max: 290 }, priceRange: { min: 4500000, max: 8000000 } },
    ],
  },
  {
    id: 'mitsubishi',
    name: 'Mitsubishi',
    nameRu: 'Мицубиси',
    country: 'Япония',
    models: [
      { id: 'outlander', name: 'Outlander', years: { from: 2001, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 145, max: 230 }, priceRange: { min: 2000000, max: 5000000 } },
      { id: 'asx', name: 'ASX', years: { from: 2010, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 117, max: 167 }, priceRange: { min: 1500000, max: 3000000 } },
      { id: 'pajero_sport', name: 'Pajero Sport', years: { from: 1996, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 170, max: 220 }, priceRange: { min: 3500000, max: 6500000 } },
      { id: 'l200', name: 'L200', years: { from: 1978, to: 2024 }, bodyTypes: ['pickup'], enginePowerRange: { min: 150, max: 190 }, priceRange: { min: 3000000, max: 5000000 } },
      { id: 'eclipse_cross', name: 'Eclipse Cross', years: { from: 2017, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 150, max: 224 }, priceRange: { min: 2500000, max: 4500000 } },
    ],
  },
  {
    id: 'ford',
    name: 'Ford',
    nameRu: 'Форд',
    country: 'США',
    models: [
      { id: 'focus', name: 'Focus', years: { from: 1998, to: 2022 }, bodyTypes: ['sedan', 'hatchback', 'wagon'], enginePowerRange: { min: 85, max: 250 }, priceRange: { min: 600000, max: 2000000 } },
      { id: 'kuga', name: 'Kuga', years: { from: 2008, to: 2022 }, bodyTypes: ['suv'], enginePowerRange: { min: 120, max: 240 }, priceRange: { min: 1500000, max: 3500000 } },
      { id: 'explorer', name: 'Explorer', years: { from: 1990, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 170, max: 450 }, priceRange: { min: 4500000, max: 9000000 } },
      { id: 'mondeo', name: 'Mondeo', years: { from: 1993, to: 2022 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 120, max: 240 }, priceRange: { min: 1200000, max: 3000000 } },
      { id: 'ecosport', name: 'EcoSport', years: { from: 2013, to: 2022 }, bodyTypes: ['crossover'], enginePowerRange: { min: 100, max: 180 }, priceRange: { min: 800000, max: 1800000 } },
    ],
  },
  {
    id: 'chevrolet',
    name: 'Chevrolet',
    nameRu: 'Шевроле',
    country: 'США',
    models: [
      { id: 'cruze', name: 'Cruze', years: { from: 2008, to: 2019 }, bodyTypes: ['sedan', 'hatchback'], enginePowerRange: { min: 109, max: 163 }, priceRange: { min: 500000, max: 1500000 } },
      { id: 'niva', name: 'Niva', nameRu: 'Нива', years: { from: 2002, to: 2020 }, bodyTypes: ['suv'], enginePowerRange: { min: 80, max: 80 }, priceRange: { min: 400000, max: 900000 } },
      { id: 'cobalt', name: 'Cobalt', years: { from: 2011, to: 2019 }, bodyTypes: ['sedan'], enginePowerRange: { min: 105, max: 105 }, priceRange: { min: 400000, max: 900000 } },
      { id: 'tahoe', name: 'Tahoe', years: { from: 1992, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 270, max: 420 }, priceRange: { min: 6000000, max: 12000000 } },
      { id: 'trailblazer', name: 'TrailBlazer', years: { from: 2001, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 195, max: 308 }, priceRange: { min: 3000000, max: 6000000 } },
    ],
  },
  {
    id: 'haval',
    name: 'Haval',
    nameRu: 'Хавал',
    country: 'Китай',
    models: [
      { id: 'jolion', name: 'Jolion', years: { from: 2021, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 150, max: 190 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'f7', name: 'F7', years: { from: 2019, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 190, max: 245 }, priceRange: { min: 2000000, max: 3500000 } },
      { id: 'h9', name: 'H9', years: { from: 2014, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 218, max: 286 }, priceRange: { min: 4000000, max: 7000000 } },
      { id: 'dargo', name: 'Dargo', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 190, max: 245 }, priceRange: { min: 2500000, max: 4000000 } },
      { id: 'f7x', name: 'F7x', years: { from: 2020, to: 2024 }, bodyTypes: ['suv', 'coupe'], enginePowerRange: { min: 190, max: 245 }, priceRange: { min: 2000000, max: 3500000 } },
    ],
  },
  {
    id: 'chery',
    name: 'Chery',
    nameRu: 'Чери',
    country: 'Китай',
    models: [
      { id: 'tiggo7pro', name: 'Tiggo 7 Pro', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 147, max: 197 }, priceRange: { min: 1800000, max: 3000000 } },
      { id: 'tiggo4pro', name: 'Tiggo 4 Pro', years: { from: 2021, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 113, max: 147 }, priceRange: { min: 1400000, max: 2200000 } },
      { id: 'tiggo8pro', name: 'Tiggo 8 Pro', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 197, max: 254 }, priceRange: { min: 2500000, max: 4000000 } },
      { id: 'arrizo8', name: 'Arrizo 8', years: { from: 2022, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 197, max: 254 }, priceRange: { min: 2500000, max: 4000000 } },
    ],
  },
  {
    id: 'geely',
    name: 'Geely',
    nameRu: 'Джили',
    country: 'Китай',
    models: [
      { id: 'coolray', name: 'Coolray', years: { from: 2019, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 177, max: 177 }, priceRange: { min: 1800000, max: 3000000 } },
      { id: 'atlas_pro', name: 'Atlas Pro', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 177, max: 238 }, priceRange: { min: 2200000, max: 3800000 } },
      { id: 'monjaro', name: 'Monjaro', years: { from: 2022, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 238, max: 295 }, priceRange: { min: 3500000, max: 5500000 } },
      { id: 'tugella', name: 'Tugella', years: { from: 2019, to: 2024 }, bodyTypes: ['suv', 'coupe'], enginePowerRange: { min: 238, max: 238 }, priceRange: { min: 3000000, max: 4500000 } },
      { id: 'emgrand', name: 'Emgrand', years: { from: 2009, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 122, max: 177 }, priceRange: { min: 1200000, max: 2200000 } },
    ],
  },
  {
    id: 'changan',
    name: 'Changan',
    nameRu: 'Чанган',
    country: 'Китай',
    models: [
      { id: 'cs55plus', name: 'CS55 Plus', years: { from: 2021, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 147, max: 189 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'cs75plus', name: 'CS75 Plus', years: { from: 2019, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 175, max: 233 }, priceRange: { min: 2000000, max: 3500000 } },
      { id: 'cs95', name: 'CS95', years: { from: 2017, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 225, max: 287 }, priceRange: { min: 3000000, max: 5000000 } },
      { id: 'uni_k', name: 'UNI-K', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 233, max: 255 }, priceRange: { min: 2500000, max: 4500000 } },
      { id: 'uni_v', name: 'UNI-V', years: { from: 2022, to: 2024 }, bodyTypes: ['sedan', 'coupe'], enginePowerRange: { min: 189, max: 233 }, priceRange: { min: 2200000, max: 3800000 } },
    ],
  },
  {
    id: 'omoda',
    name: 'OMODA',
    nameRu: 'Омода',
    country: 'Китай',
    models: [
      { id: 'c5', name: 'C5', years: { from: 2022, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 147, max: 197 }, priceRange: { min: 1800000, max: 3000000 } },
      { id: 's5', name: 'S5', years: { from: 2023, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 197, max: 254 }, priceRange: { min: 2500000, max: 4000000 } },
    ],
  },
  {
    id: 'exeed',
    name: 'EXEED',
    nameRu: 'Эксид',
    country: 'Китай',
    models: [
      { id: 'txl', name: 'TXL', years: { from: 2019, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 197, max: 254 }, priceRange: { min: 2800000, max: 4500000 } },
      { id: 'vx', name: 'VX', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 254, max: 300 }, priceRange: { min: 4000000, max: 6500000 } },
      { id: 'lx', name: 'LX', years: { from: 2022, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 147, max: 197 }, priceRange: { min: 2200000, max: 3500000 } },
    ],
  },
  {
    id: 'gaz',
    name: 'GAZ',
    nameRu: 'ГАЗ',
    country: 'Россия',
    models: [
      { id: 'gazelle_next', name: 'ГАЗель Next', years: { from: 2013, to: 2024 }, bodyTypes: ['van'], enginePowerRange: { min: 107, max: 150 }, priceRange: { min: 1500000, max: 3000000 } },
      { id: 'gazelle_business', name: 'ГАЗель Business', years: { from: 2010, to: 2023 }, bodyTypes: ['van'], enginePowerRange: { min: 90, max: 107 }, priceRange: { min: 1200000, max: 2200000 } },
      { id: 'sobol', name: 'Соболь', years: { from: 1998, to: 2024 }, bodyTypes: ['van'], enginePowerRange: { min: 90, max: 107 }, priceRange: { min: 1000000, max: 2000000 } },
      { id: 'valdai', name: 'Валдай', years: { from: 2004, to: 2024 }, bodyTypes: ['van'], enginePowerRange: { min: 115, max: 130 }, priceRange: { min: 2000000, max: 4000000 } },
    ],
  },
  {
    id: 'uaz',
    name: 'UAZ',
    nameRu: 'УАЗ',
    country: 'Россия',
    models: [
      { id: 'patriot', name: 'Patriot', years: { from: 2005, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 128, max: 150 }, priceRange: { min: 900000, max: 1500000 } },
      { id: 'hunter', name: 'Hunter', nameRu: 'Хантер', years: { from: 2003, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 112, max: 128 }, priceRange: { min: 700000, max: 1100000 } },
      { id: 'profi', name: 'Profi', years: { from: 2017, to: 2024 }, bodyTypes: ['pickup', 'van'], enginePowerRange: { min: 113, max: 150 }, priceRange: { min: 1200000, max: 2000000 } },
      { id: 'buhanka', name: 'Буханка', years: { from: 1965, to: 2024 }, bodyTypes: ['van'], enginePowerRange: { min: 90, max: 112 }, priceRange: { min: 600000, max: 1000000 } },
    ],
  },
  {
    id: 'lexus',
    name: 'Lexus',
    nameRu: 'Лексус',
    country: 'Япония',
    models: [
      { id: 'rx', name: 'RX', years: { from: 1998, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 200, max: 450 }, priceRange: { min: 4000000, max: 10000000 } },
      { id: 'nx', name: 'NX', years: { from: 2014, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 173, max: 304 }, priceRange: { min: 3500000, max: 7000000 } },
      { id: 'lx', name: 'LX', years: { from: 1996, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 309, max: 416 }, priceRange: { min: 10000000, max: 20000000 } },
      { id: 'es', name: 'ES', years: { from: 1989, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 218, max: 305 }, priceRange: { min: 3500000, max: 7000000 } },
      { id: 'is', name: 'IS', years: { from: 1999, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 204, max: 472 }, priceRange: { min: 3000000, max: 8000000 } },
      { id: 'ux', name: 'UX', years: { from: 2018, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 178, max: 272 }, priceRange: { min: 2800000, max: 5000000 } },
    ],
  },
  {
    id: 'infiniti',
    name: 'Infiniti',
    nameRu: 'Инфинити',
    country: 'Япония',
    models: [
      { id: 'qx50', name: 'QX50', years: { from: 2014, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 211, max: 268 }, priceRange: { min: 3000000, max: 5500000 } },
      { id: 'qx60', name: 'QX60', years: { from: 2012, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 245, max: 295 }, priceRange: { min: 4500000, max: 8000000 } },
      { id: 'qx80', name: 'QX80', years: { from: 2010, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 400, max: 420 }, priceRange: { min: 7000000, max: 15000000 } },
      { id: 'q50', name: 'Q50', years: { from: 2013, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 211, max: 405 }, priceRange: { min: 2500000, max: 5000000 } },
    ],
  },
  {
    id: 'volvo',
    name: 'Volvo',
    nameRu: 'Вольво',
    country: 'Швеция',
    models: [
      { id: 'xc60', name: 'XC60', years: { from: 2008, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 190, max: 455 }, priceRange: { min: 4500000, max: 10000000 } },
      { id: 'xc90', name: 'XC90', years: { from: 2002, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 235, max: 455 }, priceRange: { min: 6000000, max: 14000000 } },
      { id: 's60', name: 'S60', years: { from: 2000, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 190, max: 505 }, priceRange: { min: 3000000, max: 7000000 } },
      { id: 'v60', name: 'V60', years: { from: 2010, to: 2024 }, bodyTypes: ['wagon'], enginePowerRange: { min: 190, max: 455 }, priceRange: { min: 3500000, max: 8000000 } },
      { id: 'xc40', name: 'XC40', years: { from: 2017, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 163, max: 408 }, priceRange: { min: 3000000, max: 7000000 } },
    ],
  },
  {
    id: 'peugeot',
    name: 'Peugeot',
    nameRu: 'Пежо',
    country: 'Франция',
    models: [
      { id: 'p408', name: '408', years: { from: 2010, to: 2023 }, bodyTypes: ['sedan', 'crossover'], enginePowerRange: { min: 130, max: 225 }, priceRange: { min: 1500000, max: 3500000 } },
      { id: 'p3008', name: '3008', years: { from: 2009, to: 2023 }, bodyTypes: ['suv'], enginePowerRange: { min: 130, max: 300 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'p5008', name: '5008', years: { from: 2009, to: 2023 }, bodyTypes: ['suv'], enginePowerRange: { min: 130, max: 225 }, priceRange: { min: 3000000, max: 5500000 } },
      { id: 'p2008', name: '2008', years: { from: 2013, to: 2023 }, bodyTypes: ['crossover'], enginePowerRange: { min: 100, max: 225 }, priceRange: { min: 1500000, max: 3500000 } },
    ],
  },
  {
    id: 'citroen',
    name: 'Citroen',
    nameRu: 'Ситроен',
    country: 'Франция',
    models: [
      { id: 'c4', name: 'C4', years: { from: 2004, to: 2023 }, bodyTypes: ['hatchback', 'sedan', 'crossover'], enginePowerRange: { min: 100, max: 225 }, priceRange: { min: 1200000, max: 2800000 } },
      { id: 'c5_aircross', name: 'C5 Aircross', years: { from: 2019, to: 2023 }, bodyTypes: ['suv'], enginePowerRange: { min: 130, max: 225 }, priceRange: { min: 2500000, max: 4500000 } },
      { id: 'c3_aircross', name: 'C3 Aircross', years: { from: 2017, to: 2023 }, bodyTypes: ['crossover'], enginePowerRange: { min: 82, max: 130 }, priceRange: { min: 1200000, max: 2500000 } },
    ],
  },
  {
    id: 'subaru',
    name: 'Subaru',
    nameRu: 'Субару',
    country: 'Япония',
    models: [
      { id: 'forester', name: 'Forester', years: { from: 1997, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 150, max: 241 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'outback', name: 'Outback', years: { from: 1996, to: 2024 }, bodyTypes: ['wagon', 'suv'], enginePowerRange: { min: 150, max: 260 }, priceRange: { min: 3000000, max: 6000000 } },
      { id: 'xv', name: 'XV', years: { from: 2012, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 114, max: 156 }, priceRange: { min: 2000000, max: 3500000 } },
      { id: 'impreza', name: 'Impreza', years: { from: 1992, to: 2024 }, bodyTypes: ['sedan', 'hatchback', 'wagon'], enginePowerRange: { min: 114, max: 156 }, priceRange: { min: 1800000, max: 3500000 } },
      { id: 'wrx', name: 'WRX', years: { from: 1994, to: 2024 }, bodyTypes: ['sedan', 'wagon'], enginePowerRange: { min: 268, max: 400 }, priceRange: { min: 3500000, max: 7000000 } },
    ],
  },
  {
    id: 'suzuki',
    name: 'Suzuki',
    nameRu: 'Сузуки',
    country: 'Япония',
    models: [
      { id: 'vitara', name: 'Vitara', years: { from: 1988, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 112, max: 192 }, priceRange: { min: 1800000, max: 3500000 } },
      { id: 'sx4', name: 'SX4', years: { from: 2006, to: 2024 }, bodyTypes: ['crossover', 'sedan'], enginePowerRange: { min: 112, max: 140 }, priceRange: { min: 1500000, max: 3000000 } },
      { id: 'jimny', name: 'Jimny', years: { from: 1970, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 102, max: 129 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'swift', name: 'Swift', years: { from: 1983, to: 2024 }, bodyTypes: ['hatchback'], enginePowerRange: { min: 83, max: 140 }, priceRange: { min: 1000000, max: 2000000 } },
    ],
  },
  {
    id: 'porsche',
    name: 'Porsche',
    nameRu: 'Порше',
    country: 'Германия',
    models: [
      { id: 'cayenne', name: 'Cayenne', years: { from: 2002, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 250, max: 680 }, priceRange: { min: 8000000, max: 25000000 } },
      { id: 'macan', name: 'Macan', years: { from: 2014, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 245, max: 440 }, priceRange: { min: 6000000, max: 15000000 } },
      { id: 'panamera', name: 'Panamera', years: { from: 2009, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 330, max: 700 }, priceRange: { min: 10000000, max: 30000000 } },
      { id: 'p911', name: '911', years: { from: 1963, to: 2024 }, bodyTypes: ['coupe', 'convertible'], enginePowerRange: { min: 385, max: 700 }, priceRange: { min: 12000000, max: 40000000 } },
    ],
  },
  {
    id: 'land_rover',
    name: 'Land Rover',
    nameRu: 'Ленд Ровер',
    country: 'Великобритания',
    models: [
      { id: 'range_rover', name: 'Range Rover', years: { from: 1970, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 300, max: 615 }, priceRange: { min: 12000000, max: 35000000 } },
      { id: 'range_rover_sport', name: 'Range Rover Sport', years: { from: 2005, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 249, max: 580 }, priceRange: { min: 8000000, max: 22000000 } },
      { id: 'discovery', name: 'Discovery', years: { from: 1989, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 249, max: 360 }, priceRange: { min: 7000000, max: 15000000 } },
      { id: 'defender', name: 'Defender', years: { from: 1948, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 249, max: 525 }, priceRange: { min: 6000000, max: 18000000 } },
    ],
  },
  {
    id: 'jeep',
    name: 'Jeep',
    nameRu: 'Джип',
    country: 'США',
    models: [
      { id: 'grand_cherokee', name: 'Grand Cherokee', years: { from: 1992, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 239, max: 528 }, priceRange: { min: 5000000, max: 12000000 } },
      { id: 'wrangler', name: 'Wrangler', years: { from: 1986, to: 2024 }, bodyTypes: ['suv', 'convertible'], enginePowerRange: { min: 272, max: 470 }, priceRange: { min: 5000000, max: 12000000 } },
      { id: 'compass', name: 'Compass', years: { from: 2006, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 130, max: 200 }, priceRange: { min: 2500000, max: 5000000 } },
      { id: 'renegade', name: 'Renegade', years: { from: 2014, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 120, max: 200 }, priceRange: { min: 2000000, max: 4000000 } },
    ],
  },
  {
    id: 'tesla',
    name: 'Tesla',
    nameRu: 'Тесла',
    country: 'США',
    models: [
      { id: 'model3', name: 'Model 3', years: { from: 2017, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 283, max: 480 }, priceRange: { min: 3500000, max: 7000000 } },
      { id: 'model_y', name: 'Model Y', years: { from: 2020, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 283, max: 480 }, priceRange: { min: 4000000, max: 8000000 } },
      { id: 'model_s', name: 'Model S', years: { from: 2012, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 450, max: 1020 }, priceRange: { min: 8000000, max: 18000000 } },
      { id: 'model_x', name: 'Model X', years: { from: 2015, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 450, max: 1020 }, priceRange: { min: 9000000, max: 20000000 } },
    ],
  },
  {
    id: 'jac',
    name: 'JAC',
    nameRu: 'Джак',
    country: 'Китай',
    models: [
      { id: 'js4', name: 'JS4', years: { from: 2021, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 147, max: 149 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'js6', name: 'JS6', years: { from: 2022, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 147, max: 197 }, priceRange: { min: 2200000, max: 3500000 } },
      { id: 'j7', name: 'J7', years: { from: 2020, to: 2024 }, bodyTypes: ['sedan'], enginePowerRange: { min: 147, max: 197 }, priceRange: { min: 1800000, max: 3000000 } },
    ],
  },
  {
    id: 'dfm',
    name: 'DFM',
    nameRu: 'ДФМ (Dongfeng)',
    country: 'Китай',
    models: [
      { id: 'dfm580', name: '580', years: { from: 2016, to: 2023 }, bodyTypes: ['suv'], enginePowerRange: { min: 143, max: 143 }, priceRange: { min: 1000000, max: 2000000 } },
      { id: 'dfm_ix5', name: 'ix5', years: { from: 2016, to: 2023 }, bodyTypes: ['crossover'], enginePowerRange: { min: 128, max: 143 }, priceRange: { min: 900000, max: 1800000 } },
    ],
  },
  {
    id: 'faw',
    name: 'FAW',
    nameRu: 'ФАВ',
    country: 'Китай',
    models: [
      { id: 'bestune_t77', name: 'Bestune T77', years: { from: 2018, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 163, max: 197 }, priceRange: { min: 1500000, max: 2800000 } },
      { id: 'bestune_t99', name: 'Bestune T99', years: { from: 2020, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 245, max: 300 }, priceRange: { min: 3000000, max: 5000000 } },
    ],
  },
  {
    id: 'tank',
    name: 'Tank',
    nameRu: 'Танк',
    country: 'Китай',
    models: [
      { id: 'tank300', name: '300', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 224, max: 263 }, priceRange: { min: 4000000, max: 6000000 } },
      { id: 'tank500', name: '500', years: { from: 2022, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 349, max: 386 }, priceRange: { min: 6000000, max: 10000000 } },
    ],
  },
  {
    id: 'jetour',
    name: 'Jetour',
    nameRu: 'Джетур',
    country: 'Китай',
    models: [
      { id: 'x70plus', name: 'X70 Plus', years: { from: 2021, to: 2024 }, bodyTypes: ['suv'], enginePowerRange: { min: 147, max: 147 }, priceRange: { min: 1300000, max: 2200000 } },
      { id: 'dashing', name: 'Dashing', years: { from: 2022, to: 2024 }, bodyTypes: ['crossover'], enginePowerRange: { min: 197, max: 197 }, priceRange: { min: 2000000, max: 3500000 } },
    ],
  },
  {
    id: 'great_wall',
    name: 'Great Wall',
    nameRu: 'Грейт Волл',
    country: 'Китай',
    models: [
      { id: 'wingle', name: 'Wingle', years: { from: 2006, to: 2024 }, bodyTypes: ['pickup'], enginePowerRange: { min: 143, max: 163 }, priceRange: { min: 1500000, max: 2500000 } },
      { id: 'poer', name: 'Poer', years: { from: 2020, to: 2024 }, bodyTypes: ['pickup'], enginePowerRange: { min: 163, max: 224 }, priceRange: { min: 2500000, max: 4000000 } },
    ],
  },
];

// Вспомогательные функции
export function findMakeById(id: string): VehicleMake | undefined {
  return VEHICLE_MAKES.find(m => m.id === id);
}

export function getModelsForMake(makeId: string): VehicleModel[] {
  return findMakeById(makeId)?.models ?? [];
}

export function getMakeOptions(): { value: string; label: string }[] {
  return VEHICLE_MAKES.map(m => ({ value: m.id, label: m.nameRu }));
}

export function getModelOptions(makeId: string): { value: string; label: string }[] {
  return getModelsForMake(makeId).map(m => ({ value: m.id, label: m.name }));
}

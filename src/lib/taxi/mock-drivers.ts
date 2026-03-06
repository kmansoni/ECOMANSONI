import type { Driver } from '@/types/taxi';
import { DEFAULT_MAP_CENTER } from './constants';

/**
 * Генерирует mock-водителя рядом с заданной позицией
 */
export function generateMockDriver(nearPosition = DEFAULT_MAP_CENTER): Driver {
  const drivers = [
    {
      id: 'driver_1',
      name: 'Алексей Смирнов',
      photo: undefined,
      rating: 4.9,
      tripsCount: 2847,
      yearsOnPlatform: 4,
      car: {
        make: 'Toyota',
        model: 'Camry',
        color: 'Белый',
        plateNumber: 'А123ВС777',
        year: 2022,
        class: 'comfort' as const,
      },
      phone: '+7 (916) ***-**-34',
      comment: 'Всегда вовремя, тихая поездка',
    },
    {
      id: 'driver_2',
      name: 'Михаил Петров',
      photo: undefined,
      rating: 4.7,
      tripsCount: 1543,
      yearsOnPlatform: 2,
      car: {
        make: 'Kia',
        model: 'K5',
        color: 'Серый',
        plateNumber: 'В456КМ799',
        year: 2023,
        class: 'comfort' as const,
      },
      phone: '+7 (925) ***-**-78',
      comment: 'Чистый автомобиль, кондиционер',
    },
    {
      id: 'driver_3',
      name: 'Дмитрий Козлов',
      photo: undefined,
      rating: 4.8,
      tripsCount: 3210,
      yearsOnPlatform: 5,
      car: {
        make: 'Mercedes',
        model: 'E-Class',
        color: 'Чёрный',
        plateNumber: 'С789ОР197',
        year: 2021,
        class: 'business' as const,
      },
      phone: '+7 (903) ***-**-12',
      comment: 'Бизнес-класс, вода в наличии',
    },
    {
      id: 'driver_4',
      name: 'Сергей Иванов',
      photo: undefined,
      rating: 4.6,
      tripsCount: 985,
      yearsOnPlatform: 1,
      car: {
        make: 'Hyundai',
        model: 'Solaris',
        color: 'Белый',
        plateNumber: 'Т321УФ750',
        year: 2023,
        class: 'economy' as const,
      },
      phone: '+7 (967) ***-**-56',
      comment: '',
    },
    {
      id: 'driver_5',
      name: 'Артём Николаев',
      photo: undefined,
      rating: 4.9,
      tripsCount: 4125,
      yearsOnPlatform: 6,
      car: {
        make: 'BMW',
        model: '5 Series',
        color: 'Тёмно-синий',
        plateNumber: 'Х654ЦЧ777',
        year: 2022,
        class: 'premium' as const,
      },
      phone: '+7 (499) ***-**-90',
      comment: 'Профессиональный водитель',
    },
  ];

  const driver = drivers[Math.floor(Math.random() * drivers.length)];

  // Ставим водителя рядом с пассажиром (в радиусе 500м)
  const offsetLat = (Math.random() - 0.5) * 0.008;
  const offsetLng = (Math.random() - 0.5) * 0.008;

  return {
    ...driver,
    location: {
      lat: nearPosition.lat + offsetLat,
      lng: nearPosition.lng + offsetLng,
    },
    eta: 3 + Math.floor(Math.random() * 7), // 3-10 минут
  };
}

/**
 * Генерирует список mock поездок для истории
 */
export function generateMockTripHistory() {
  return [
    {
      id: 'trip_1',
      pickup: {
        id: 'p1',
        address: 'Москва, Арбат, 4',
        shortAddress: 'Арбат',
        coordinates: { lat: 55.7518, lng: 37.5964 },
      },
      destination: {
        id: 'd1',
        address: 'Аэропорт Шереметьево (SVO)',
        shortAddress: 'Шереметьево',
        coordinates: { lat: 55.9727, lng: 37.4146 },
      },
      tariff: 'comfort' as const,
      tariffName: 'Комфорт',
      price: 1250,
      duration: 45,
      distance: 35.2,
      driver: { name: 'Алексей Смирнов', rating: 4.9 },
      vehicle: { make: 'Toyota', model: 'Camry', color: 'Белый', plateNumber: 'А123ВС777' },
      userRating: 5,
      tip: 100,
      date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'completed' as const,
    },
    {
      id: 'trip_2',
      pickup: {
        id: 'p2',
        address: 'Москва, Тверская ул., 15',
        shortAddress: 'Тверская',
        coordinates: { lat: 55.7633, lng: 37.6106 },
      },
      destination: {
        id: 'd2',
        address: 'Москва, ВДНХ',
        shortAddress: 'ВДНХ',
        coordinates: { lat: 55.8204, lng: 37.6402 },
      },
      tariff: 'economy' as const,
      tariffName: 'Эконом',
      price: 380,
      duration: 22,
      distance: 9.4,
      driver: { name: 'Сергей Иванов', rating: 4.6 },
      vehicle: { make: 'Hyundai', model: 'Solaris', color: 'Белый', plateNumber: 'Т321УФ750' },
      date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      status: 'completed' as const,
    },
    {
      id: 'trip_3',
      pickup: {
        id: 'p3',
        address: 'Москва, Кутузовский проспект, 30',
        shortAddress: 'Кутузовский пр.',
        coordinates: { lat: 55.7415, lng: 37.5428 },
      },
      destination: {
        id: 'd3',
        address: 'Москва, Сити, башня Федерация',
        shortAddress: 'Москва Сити',
        coordinates: { lat: 55.7479, lng: 37.5373 },
      },
      tariff: 'business' as const,
      tariffName: 'Бизнес',
      price: 950,
      duration: 15,
      distance: 5.8,
      driver: { name: 'Дмитрий Козлов', rating: 4.8 },
      vehicle: { make: 'Mercedes', model: 'E-Class', color: 'Чёрный', plateNumber: 'С789ОР197' },
      userRating: 5,
      tip: 200,
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed' as const,
    },
    {
      id: 'trip_4',
      pickup: {
        id: 'p4',
        address: 'Москва, Красная площадь',
        shortAddress: 'Красная площадь',
        coordinates: { lat: 55.7539, lng: 37.6208 },
      },
      destination: {
        id: 'd4',
        address: 'ТРЦ Мега Химки',
        shortAddress: 'Мега Химки',
        coordinates: { lat: 55.9089, lng: 37.3856 },
      },
      tariff: 'economy' as const,
      tariffName: 'Эконом',
      price: 680,
      duration: 40,
      distance: 24.3,
      driver: { name: 'Михаил Петров', rating: 4.7 },
      vehicle: { make: 'Kia', model: 'K5', color: 'Серый', plateNumber: 'В456КМ799' },
      userRating: 4,
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed' as const,
    },
    {
      id: 'trip_5',
      pickup: {
        id: 'p5',
        address: 'Москва, Лубянская площадь',
        shortAddress: 'Лубянка',
        coordinates: { lat: 55.7588, lng: 37.6262 },
      },
      destination: {
        id: 'd5',
        address: 'Москва, Садовая-Кольцевая, 5',
        shortAddress: 'Садовое кольцо',
        coordinates: { lat: 55.7631, lng: 37.6038 },
      },
      tariff: 'economy' as const,
      tariffName: 'Эконом',
      price: 0,
      duration: 0,
      distance: 0,
      driver: { name: 'Сергей Иванов', rating: 4.6 },
      vehicle: { make: 'Hyundai', model: 'Solaris', color: 'Белый', plateNumber: 'Т321УФ750' },
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'cancelled' as const,
    },
  ];
}

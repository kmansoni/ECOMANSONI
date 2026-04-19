# ПЛАН ЭКСПОРТА ДАННЫХ НАВИГАТОРА — ВЕСЬ МИР

## ДИАГНОСТИКА

### Текущее состояние

| Компонент | Статус | Файл |
|-----------|--------|------|
| GeoNames allCountries.txt | ✅ Есть (13M записей) | `public/data/osm/world/sources/geonames/allCountries.txt` |
| Страны (countryInfo.txt) | ✅ Есть | `public/data/osm/world/sources/geonames/countryInfo.txt` |
| Административные коды | ✅ Есть | `admin1CodesASCII.txt`, `admin2Codes.txt` |
| **Settlements (RU)** | ❌ НЕТ | Нужно экспортировать |
| **Settlements (другие страны)** | ❌ НЕТ | Нужно экспортировать |
| Addresses (addresses.json) | ⚠️ Частично | Только Москва |

### Проблема
Скрипт `process-world-geodata.mjs` запускался с фильтром `--country=AD` (Андорра), поэтому данные только для Андорры.

---

## ПЛАН РЕАЛИЗАЦИИ

### Фаза 1: Экспорт населённых пунктов мира (GeoNames)

```bash
# Вариант 1: Экспорт всех стран последовательно
for code in $(cat countrycodes.txt); do
  node scripts/process-world-geodata.mjs --country=$code --min-population=500
done

# Вариант 2: Параллельные джобы (20 стран одновременно)
```

**Целевой формат:**
- `public/data/osm/world/processed/settlements/RU.json` — ~45,000 записей
- `public/data/osm/world/processed/settlements/AE.json` — ~4,000 записей  
- и т.д. для всех 250 стран

**Скрипт:** `scripts/process-world-geodata.mjs`
- Аргументы: `--country=RU --min-population=1000`

---

### Фаза 2: Экспорт адресов из OSM (PBF)

**Источник:** Geofabrik (уже настроено в `export-world-geodata.mjs`)

**Страны с PBF:**
- `russia-latest.osm.pbf` (~200MB)
- `united-arab-emirates-latest.osm.pbf`
- и др.

**Инструменты:**
1. `osmium` — для фильтрации адресов из PBF
2. `osm2pgsql` — для импорта в PostgreSQL

**Пример команды:**
```bash
osmium tags-filter russia-latest.osm.pbf addr:street -o russia-addresses.osm.pbf
osmium export russia-addresses.osm.pbf --format=json --geometry-type=point > addresses.json
```

---

### Фаза 3: Оптимизация для навигатора

#### 3.1. Объединённый индекс
```typescript
// search_index.json — единый файл для быстрого поиска
[
  { id: "1", type: "city", name: "Москва", country: "RU", lat: 55.75, lon: 37.61, population: 12500000 },
  { id: "2", type: "city", name: "Kazan", country: "RU", lat: 55.79, lon: 49.12, population: 1250000 },
  { id: "3", type: "city", name: "Dubai", country: "AE", lat: 25.07, lon: 55.30, population: 3500000 },
]
```

#### 3.2. Группировка по регионам
```typescript
// regions.json
{
  "RU": { name: "Россия", cities: 45000, bounds: [20, 40, 180, 80] },
  "AE": { name: "ОАЭ", cities: 4000, bounds: [...] },
  ...
}
```

---

### Фаза 4: Обновление кода навигатора

#### 4.1. offlineSearch.ts
```typescript
// Текущая загрузка (проблема)
const addresses = await fetch('/data/osm/processed/addresses.json');

// Новая загрузка (по регионам)
async function loadRegion(countryCode: string) {
  const resp = await fetch(`/data/osm/world/processed/settlements/${countryCode}.json`);
  return resp.json();
}
```

#### 4.2. Автоопределение региона
```typescript
// При старте навигатора — определяем регион по GPS
const countryCode = getCountryCode(position.lat, position.lon);
// Загружаем данные для этого региона
```

---

## ПРИОРИТЕТЫ

| # | Задача | Время | Объём |
|---|--------|-------|-------|
| 1 | Экспорт RU (Россия) | 5 мин | 45K городов |
| 2 | Экспорт AE (ОАЭ) | 1 мин | 4K городов |
| 3 | Экспорт всех остальных | ~30 мин | 200+ стран |
| 4 | Тест поиска | 5 мин | — |

---

## РЕЗУЛЬТАТ ПОСЛЕ ВНЕДРЕНИЯ

- ✅ Поиск "Москва" — найдено
- ✅ Поиск "Казань" — найдено  
- ✅ Поиск "Ростов-на-Дону" — найдено
- ✅ Поиск "Дубай" — найдено
- ✅ Поиск "Великент" — найдено
- ✅ Поиск "Красная площадь" — нужен OSM PBF экспорт

---

## БЕЗОПАСНОСТЬ И СТОИМОСТЬ

| Параметр | Значение |
|----------|----------|
| Стоимость | **БЕСПЛАТНО** (GeoNames + OSM — открытые данные) |
| Объём данных | ~2GB (все страны) |
| Обновление | Ручное/по расписанию |
| Лицензия | CC BY 4.0 (GeoNames), ODbL (OSM) |
# ПЛАН ЭКСПОРТА ДАННЫХ НАВИГАТОРА — ВЕСЬ МИР

## ДИАГНОСТИКА

### Текущее состояние

| Компонент | Статус | Файл |
|-----------|--------|------|
| GeoNames allCountries.zip | ✅ Есть | `public/data/osm/world/sources/geonames/allCountries.zip` |
| GeoNames allCountries.txt | ✅ Есть после extract | `public/data/osm/world/sources/geonames/allCountries.txt` |
| Страны (countryInfo.txt) | ✅ Есть | `public/data/osm/world/sources/geonames/countryInfo.txt` |
| Административные коды | ✅ Есть | `admin1CodesASCII.txt`, `admin2Codes.txt` |
| **Settlements (world)** | ✅ Есть | `world/processed/settlements/*.json`, 237 shard-файлов |
| Settlements manifest | ✅ Есть | `world/processed/settlements-manifest.json` |
| **World addresses** | ❌ НЕТ | `world/processed/addresses/*.json` отсутствуют |
| Address manifest | ❌ НЕТ | `world/processed/address-manifest.json` отсутствует |
| Local `processed/addresses.json` | ⚠️ Частично | Локальный/региональный слой, не мировой |

### Проблема
Изначально `process-world-geodata.mjs` действительно был прогнан только с `--country=AD`, поэтому runtime видел лишь Андорру. Сейчас этот перекос исправлен: на static host уже опубликован полноценный world settlements слой. Оставшийся пробел теперь другой: street-level мировой address layer по-прежнему не сгенерирован и не разложен по shard-файлам.

### Что уже сделано

- `process-world-geodata.mjs` успешно прогнан на полном GeoNames дампе с `--min-population=1000`
- На AdminVPS разложено `237` settlement-shard файлов в `/opt/mansoni/static-data/osm/world/processed/settlements`
- Публичная раздача подтверждена через `https://mansoni.ru/data/osm/world/processed/settlements-manifest.json`
- В frontend убран безусловный московский bias голосового поиска
- В `offlineSearch.ts` добавлена поддержка world address shards, если они появятся на static host
- В голосовом поиске включён нормальный мировой online fallback по умолчанию

### Что ещё отсутствует

- Нет `world/processed/addresses/*.json`
- Нет `world/processed/address-manifest.json`
- Нет штатного planet-scale exporter-а street-address слоя в текущем repo
- Поэтому мировой offline street-address поиск пока возможен только там, где появятся world address shards; иначе используется global online fallback (Photon/Nominatim/DaData)

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

**Статус:** не реализовано в production data pipeline. В репозитории нет готового экспортера, который уже сегодня генерирует `world/processed/addresses/<CC>.json` + `address-manifest.json`.

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
// Текущая база всегда включает локальный processed/addresses.json
const addresses = await fetch('/data/osm/processed/addresses.json');

// Дополнительно поддерживается мировой address layer, если он разложен на static host
async function loadRegion(countryCode: string) {
  const resp = await fetch(`/data/osm/world/processed/settlements/${countryCode}.json`);
  return resp.json();
}

async function loadWorldAddresses(countryCode: string) {
  const resp = await fetch(`/data/osm/world/processed/addresses/${countryCode}.json`);
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
- ⚠️ Поиск "Красная площадь" / street-level world address — требует world address layer или online fallback

---

## ФАКТИЧЕСКАЯ PROD-СХЕМА НА СЕЙЧАС

1. Offline local search: `processed/search_index.json` + `processed/addresses.json`
2. World city fallback: `world/processed/settlements/*.json`
3. World address fallback: `world/processed/addresses/*.json` только если данные появятся
4. Online global fallback: Photon / Nominatim / DaData

Именно поэтому после текущих изменений навигатор уже перестал быть `Moscow-only`, но полностью planet-scale offline street-address search ещё упирается в отсутствие самих datasets, а не в UI или ранжирование.

---

## БЕЗОПАСНОСТЬ И СТОИМОСТЬ

| Параметр | Значение |
|----------|----------|
| Стоимость | **БЕСПЛАТНО** (GeoNames + OSM — открытые данные) |
| Объём данных | ~2GB (все страны) |
| Обновление | Ручное/по расписанию |
| Лицензия | CC BY 4.0 (GeoNames), ODbL (OSM) |
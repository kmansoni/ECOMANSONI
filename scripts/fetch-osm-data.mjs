/**
 * fetch-osm-data.mjs — Downloads POI, addresses, road graph, speed cameras,
 * traffic lights, speed bumps, and road signs from Overpass API (OpenStreetMap)
 * for offline autonomous navigation.
 *
 * Usage: node scripts/fetch-osm-data.mjs [--region moscow|spb|russia-cities] [--roads-only] [--extra]
 *
 * Outputs:
 *   public/data/osm/processed/pois.json             — POI database
 *   public/data/osm/processed/addresses.json         — Address database
 *   public/data/osm/processed/speed_cameras.json     — Speed camera database
 *   public/data/osm/processed/traffic_lights.json    — Traffic lights
 *   public/data/osm/processed/speed_bumps.json       — Speed bumps / calming
 *   public/data/osm/processed/road_signs.json        — Road signs
 *   public/data/osm/graph.json                       — Road graph for routing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'osm', 'processed');
const GRAPH_PATH = path.join(ROOT, 'public', 'data', 'osm', 'graph.json');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// ─── Regions ────────────────────────────────────────────────────────────────
const REGIONS = {
  moscow: {
    name: 'Москва (все округа включая Новую Москву)',
    bbox: [55.14, 36.80, 56.02, 37.97], // Вся Москва включая ТиНАО, Троицк, Зеленоград
  },
  'moscow-center': {
    name: 'Центр Москвы (МКАД)',
    bbox: [55.55, 37.3, 55.95, 37.85],
  },
  'moscow-region': {
    name: 'Московская область',
    bbox: [54.65, 35.60, 56.95, 40.20],
  },
  spb: {
    name: 'Санкт-Петербург',
    bbox: [59.7, 29.4, 60.2, 30.8],
  },
  'russia-cities': {
    name: 'Крупные города РФ',
    cities: [
      { name: 'Москва', bbox: [55.14, 36.80, 56.02, 37.97] },
      { name: 'СПб', bbox: [59.8, 30.0, 60.1, 30.6] },
      { name: 'Казань', bbox: [55.7, 48.9, 55.9, 49.3] },
      { name: 'Новосибирск', bbox: [54.85, 82.7, 55.1, 83.15] },
      { name: 'Екатеринбург', bbox: [56.7, 60.4, 56.95, 60.8] },
      { name: 'Нижний Новгород', bbox: [56.2, 43.7, 56.4, 44.1] },
      { name: 'Краснодар', bbox: [44.95, 38.85, 45.15, 39.15] },
      { name: 'Ростов-на-Дону', bbox: [47.15, 39.5, 47.35, 39.85] },
      { name: 'Сочи', bbox: [43.5, 39.6, 43.7, 39.9] },
      { name: 'Воронеж', bbox: [51.55, 39.05, 51.75, 39.35] },
      { name: 'Самара', bbox: [53.1, 50.0, 53.3, 50.3] },
      { name: 'Уфа', bbox: [54.65, 55.85, 54.85, 56.15] },
      { name: 'Пермь', bbox: [57.9, 55.95, 58.1, 56.35] },
      { name: 'Волгоград', bbox: [48.55, 44.3, 48.85, 44.65] },
      { name: 'Челябинск', bbox: [55.05, 61.3, 55.25, 61.55] },
      { name: 'Омск', bbox: [54.9, 73.2, 55.1, 73.5] },
      { name: 'Красноярск', bbox: [55.95, 92.7, 56.1, 93.1] },
      { name: 'Тюмень', bbox: [57.1, 65.4, 57.25, 65.7] },
    ],
  },
};

// ─── Overpass queries ───────────────────────────────────────────────────────

function poiQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:120];
(
  // Еда и напитки
  node["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"](${s},${w},${n},${e});
  // Магазины
  node["shop"~"supermarket|convenience|mall|clothes|electronics|pharmacy|bakery|butcher|florist|hardware|beauty|car_parts|car_repair|mobile_phone|optician|shoes|stationery"](${s},${w},${n},${e});
  // Транспорт
  node["amenity"~"fuel|parking|charging_station|car_wash|car_rental|bicycle_rental"](${s},${w},${n},${e});
  // Финансы
  node["amenity"~"bank|atm|bureau_de_change"](${s},${w},${n},${e});
  // Здоровье
  node["amenity"~"hospital|clinic|dentist|doctors|pharmacy|veterinary"](${s},${w},${n},${e});
  // Образование
  node["amenity"~"school|university|college|kindergarten|library"](${s},${w},${n},${e});
  // Гостиницы
  node["tourism"~"hotel|hostel|motel|guest_house|apartment"](${s},${w},${n},${e});
  // Культура
  node["tourism"~"museum|gallery|attraction|viewpoint|zoo"](${s},${w},${n},${e});
  node["amenity"~"theatre|cinema|arts_centre|nightclub"](${s},${w},${n},${e});
  // Спорт
  node["leisure"~"fitness_centre|sports_centre|swimming_pool|stadium"](${s},${w},${n},${e});
  // Госуслуги
  node["amenity"~"post_office|police|fire_station|courthouse|townhall"](${s},${w},${n},${e});
  // Связь
  node["amenity"~"telephone|internet_cafe"](${s},${w},${n},${e});
  node["office"~"telecommunication"](${s},${w},${n},${e});
);
out body;`;
}

function addressQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:300];
(
  // Стандартные адреса (улица + дом)
  node["addr:housenumber"]["addr:street"](${s},${w},${n},${e});
  way["addr:housenumber"]["addr:street"](${s},${w},${n},${e});
  relation["addr:housenumber"]["addr:street"](${s},${w},${n},${e});
  // Адреса с addr:place (населённые пункты без улиц)
  node["addr:housenumber"]["addr:place"](${s},${w},${n},${e});
  way["addr:housenumber"]["addr:place"](${s},${w},${n},${e});
  // Именованные здания
  way["building"]["name"](${s},${w},${n},${e});
);
out center body;`;
}

function speedCameraQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  node["highway"="speed_camera"](${s},${w},${n},${e});
  node["enforcement"="maxspeed"](${s},${w},${n},${e});
  node["man_made"="surveillance"]["surveillance:type"="camera"]["surveillance"="traffic"](${s},${w},${n},${e});
);
out body;`;
}

function roadGraphQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:300];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;`;
}

/** Detailed road data: lanes, turn:lanes, surface, width — for lane assist & markings */
function roadDetailsQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:300];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"]["lanes"](${s},${w},${n},${e});
  way["highway"~"motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"]["turn:lanes"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;`;
}

function trafficLightsQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  node["highway"="traffic_signals"](${s},${w},${n},${e});
  node["crossing"="traffic_signals"](${s},${w},${n},${e});
);
out body;`;
}

function speedBumpsQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  node["traffic_calming"~"bump|hump|table|cushion|rumble_strip"](${s},${w},${n},${e});
  way["traffic_calming"~"bump|hump|table|cushion"](${s},${w},${n},${e});
);
out center body;`;
}

function roadSignsQuery(bbox) {
  const [s, w, n, e] = bbox;
  return `
[out:json][timeout:60];
(
  node["highway"="stop"](${s},${w},${n},${e});
  node["highway"="give_way"](${s},${w},${n},${e});
  node["highway"="crossing"](${s},${w},${n},${e});
  node["traffic_sign"](${s},${w},${n},${e});
  node["highway"="speed_camera"]["maxspeed"](${s},${w},${n},${e});
);
out body;`;
}

// ─── Fetch with retries ─────────────────────────────────────────────────────

async function overpassFetch(query, label, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`  [${label}] Запрос Overpass... (попытка ${i + 1})`);

      // Clean up query — remove excess whitespace, normalize
      const cleanQuery = query.replace(/\n\s*/g, '\n').trim();

      const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'MansoniNavigator/1.0 (offline-data-fetch)',
          'Accept': '*/*',
        },
        body: `data=${encodeURIComponent(cleanQuery)}`,
      });

      if (resp.status === 429 || resp.status === 504) {
        const wait = resp.status === 429 ? 30000 : 15000;
        console.log(`  [${label}] ${resp.status}, жду ${wait/1000}с...`);
        await sleep(wait);
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
      }

      const data = await resp.json();
      console.log(`  [${label}] Получено ${data.elements?.length ?? 0} элементов`);
      return data.elements || [];
    } catch (err) {
      console.error(`  [${label}] Ошибка: ${err.message}`);
      if (i < retries - 1) {
        const wait = 10000 + i * 5000;
        console.log(`  [${label}] Повтор через ${wait/1000}с...`);
        await sleep(wait);
      }
    }
  }
  return [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Parsers ────────────────────────────────────────────────────────────────

function parsePOI(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:ru'] || tags['name:en'] || '';
  if (!name && !tags.amenity && !tags.shop && !tags.tourism && !tags.leisure) return null;

  const category = tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || 'other';
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  return {
    id: String(el.id),
    name: name || category,
    category,
    lat,
    lon,
    address: formatAddress(tags),
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    opening_hours: tags.opening_hours || null,
    cuisine: tags.cuisine || null,
    brand: tags.brand || null,
    tags: {
      'addr:street': tags['addr:street'],
      'addr:housenumber': tags['addr:housenumber'],
      'addr:city': tags['addr:city'],
    },
  };
}

function formatAddress(tags) {
  const parts = [];
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  return parts.join(', ') || null;
}

function parseAddress(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const street = tags['addr:street'] || tags['addr:place'] || '';
  const house = tags['addr:housenumber'] || '';
  const buildingName = tags.name || '';

  // Нужен хотя бы улица+дом или название здания
  if (!street && !buildingName) return null;
  if (street && !house && !buildingName) return null;

  const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:district'] || '';
  const postcode = tags['addr:postcode'] || '';

  // Формируем полный адрес
  const parts = [];
  if (city) parts.push(city);
  if (street) parts.push(street);
  if (house) parts.push(house);
  if (buildingName && !street) parts.push(buildingName);
  const full = parts.join(', ');

  return {
    id: String(el.id),
    full,
    street: street || buildingName,
    house: house || '',
    city,
    postcode,
    lat,
    lon,
  };
}

function parseSpeedCamera(el) {
  const tags = el.tags || {};
  const lat = el.lat;
  const lon = el.lon;
  if (!lat || !lon) return null;

  const maxspeed = parseInt(tags.maxspeed || tags['maxspeed:forward'] || '60', 10);
  const direction = parseFloat(tags.direction || '0');

  return {
    id: `osm-cam-${el.id}`,
    lat,
    lon,
    speedLimit: isNaN(maxspeed) ? 60 : maxspeed,
    direction: isNaN(direction) ? 0 : direction,
    type: tags.enforcement === 'average_speed' ? 'average' : 'fixed',
  };
}

function parseTrafficLight(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const tags = el.tags || {};
  return {
    id: `tl-${el.id}`,
    lat,
    lon,
    crossing: tags.crossing === 'traffic_signals',
    button: tags.button_operated === 'yes',
  };
}

function parseSpeedBump(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const tags = el.tags || {};
  return {
    id: `bump-${el.id}`,
    lat,
    lon,
    type: tags.traffic_calming || 'bump',
    surface: tags.surface || null,
  };
}

function parseRoadSign(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const tags = el.tags || {};
  let signType = 'unknown';
  if (tags.highway === 'stop') signType = 'stop';
  else if (tags.highway === 'give_way') signType = 'give_way';
  else if (tags.highway === 'crossing') signType = 'pedestrian_crossing';
  else if (tags.traffic_sign) {
    const sign = tags.traffic_sign.toLowerCase();
    if (sign.includes('stop')) signType = 'stop';
    else if (sign.includes('speed')) signType = 'speed_limit';
    else if (sign.includes('no_entry')) signType = 'no_entry';
    else if (sign.includes('no_overtaking')) signType = 'no_overtaking';
    else if (sign.includes('children') || sign.includes('school')) signType = 'children';
    else if (sign.includes('works')) signType = 'road_works';
    else signType = sign.split(';')[0].trim();
  }

  return {
    id: `sign-${el.id}`,
    lat,
    lon,
    signType,
    direction: parseFloat(tags.direction || '0') || 0,
    maxspeed: parseInt(tags.maxspeed || '0', 10) || null,
  };
}

function buildRoadGraph(elements) {
  const nodes = {};
  const ways = [];

  for (const el of elements) {
    if (el.type === 'node') {
      nodes[String(el.id)] = { lat: el.lat, lon: el.lon };
    } else if (el.type === 'way' && el.nodes?.length >= 2) {
      ways.push(el);
    }
  }

  const SPEED_MAP = {
    motorway: 110, trunk: 90, primary: 70, secondary: 60,
    tertiary: 50, residential: 30, unclassified: 40,
    motorway_link: 80, trunk_link: 70, primary_link: 60,
    secondary_link: 50, tertiary_link: 40,
  };

  const edges = [];
  const usedNodeIds = new Set();

  for (const way of ways) {
    const tags = way.tags || {};
    const highway = tags.highway || 'unclassified';
    const speed = parseInt(tags.maxspeed || '0', 10) || SPEED_MAP[highway] || 40;
    const name = tags.name || tags['name:ru'] || '';
    const oneway = tags.oneway === 'yes' || tags.oneway === '1';
    const lanes = parseInt(tags.lanes || '0', 10) || 0;
    const turnLanes = tags['turn:lanes'] || '';
    const surface = tags.surface || '';

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const fromId = String(way.nodes[i]);
      const toId = String(way.nodes[i + 1]);
      const fromNode = nodes[fromId];
      const toNode = nodes[toId];

      if (!fromNode || !toNode) continue;

      usedNodeIds.add(fromId);
      usedNodeIds.add(toId);

      const dist = haversine(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);

      edges.push({
        fromNode: fromId,
        toNode: toId,
        distance: dist,
        speed,
        highway,
        name,
        ...(lanes && { lanes }),
        ...(turnLanes && { turnLanes }),
        ...(surface && { surface }),
      });

      if (!oneway) {
        edges.push({
          fromNode: toId,
          toNode: fromId,
          distance: dist,
          speed,
          highway,
          name,
          ...(lanes && { lanes }),
          ...(turnLanes && { turnLanes }),
          ...(surface && { surface }),
        });
      }
    }
  }

  // Keep only used nodes
  const filteredNodes = {};
  for (const id of usedNodeIds) {
    if (nodes[id]) filteredNodes[id] = nodes[id];
  }

  return { nodes: filteredNodes, edges };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const regionArg = process.argv.find(a => a.startsWith('--region='))?.split('=')[1] || 'moscow';
  const roadsOnly = process.argv.includes('--roads-only');
  const extraData = process.argv.includes('--extra');
  const region = REGIONS[regionArg];

  if (!region) {
    console.error(`Регион не найден: ${regionArg}. Доступные: ${Object.keys(REGIONS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🗺️  Скачивание данных OSM: ${region.name}${roadsOnly ? ' (только дороги)' : ''}${extraData ? ' + доп. данные' : ''}\n`);

  // Ensure output dirs
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(GRAPH_PATH), { recursive: true });

  const bboxes = region.cities
    ? region.cities.map(c => ({ name: c.name, bbox: c.bbox }))
    : [{ name: region.name, bbox: region.bbox }];

  let allPOIs = [];
  let allAddresses = [];
  let allCameras = [];
  let allTrafficLights = [];
  let allSpeedBumps = [];
  let allRoadSigns = [];
  let allGraphElements = [];
  let allRoadDetails = [];

  for (const { name, bbox } of bboxes) {
    console.log(`\n📍 ${name} [${bbox.join(', ')}]\n`);

    // POIs
    if (!roadsOnly) {
      const poiElements = await overpassFetch(poiQuery(bbox), `${name} POI`);
      const pois = poiElements.map(parsePOI).filter(Boolean);
      allPOIs.push(...pois);
      console.log(`  ✅ POI: ${pois.length}`);

      await sleep(2000); // respect rate limits

      // Addresses
      const addrElements = await overpassFetch(addressQuery(bbox), `${name} Адреса`);
      const addresses = addrElements.map(parseAddress).filter(Boolean);
      allAddresses.push(...addresses);
      console.log(`  ✅ Адреса: ${addresses.length}`);

      await sleep(2000);

      // Speed cameras
      const camElements = await overpassFetch(speedCameraQuery(bbox), `${name} Камеры`);
      const cameras = camElements.map(parseSpeedCamera).filter(Boolean);
      allCameras.push(...cameras);
      console.log(`  ✅ Камеры: ${cameras.length}`);

      await sleep(2000);

      // Traffic lights
      const tlElements = await overpassFetch(trafficLightsQuery(bbox), `${name} Светофоры`);
      const lights = tlElements.map(parseTrafficLight).filter(Boolean);
      allTrafficLights.push(...lights);
      console.log(`  ✅ Светофоры: ${lights.length}`);

      await sleep(2000);

      // Speed bumps
      const bumpElements = await overpassFetch(speedBumpsQuery(bbox), `${name} Лежачие полицейские`);
      const bumps = bumpElements.map(parseSpeedBump).filter(Boolean);
      allSpeedBumps.push(...bumps);
      console.log(`  ✅ Лежачие полицейские: ${bumps.length}`);

      await sleep(2000);

      // Road signs
      const signElements = await overpassFetch(roadSignsQuery(bbox), `${name} Дорожные знаки`);
      const signs = signElements.map(parseRoadSign).filter(Boolean);
      allRoadSigns.push(...signs);
      console.log(`  ✅ Дорожные знаки: ${signs.length}`);

      await sleep(2000);
    }

    // Road graph — split into tiles (full city is too large for one query)
    console.log(`\n  🛣️  Скачивание дорожного графа по тайлам...`);
    const GRID = 4; // 4x4 = 16 tiles
    const latStep = (bbox[2] - bbox[0]) / GRID;
    const lonStep = (bbox[3] - bbox[1]) / GRID;

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const tileBbox = [
          bbox[0] + row * latStep,
          bbox[1] + col * lonStep,
          bbox[0] + (row + 1) * latStep,
          bbox[1] + (col + 1) * lonStep,
        ];
        const tileLabel = `${name} Дороги [${row},${col}]`;
        const tileElements = await overpassFetch(roadGraphQuery(tileBbox), tileLabel);
        allGraphElements.push(...tileElements);
        await sleep(3000);
      }
    }
    console.log(`  ✅ Всего дорожных элементов: ${allGraphElements.length}`);

    // Road details (lanes, turn:lanes, surface)
    if (extraData || !roadsOnly) {
      console.log(`\n  🚦 Скачивание данных о полосах движения...`);
      const detailElements = await overpassFetch(roadDetailsQuery(bbox), `${name} Полосы`);
      const details = detailElements
        .filter(el => el.type === 'way' && el.tags)
        .map(el => ({
          id: el.id,
          lanes: parseInt(el.tags.lanes || '0', 10) || 0,
          turnLanes: el.tags['turn:lanes'] || '',
          turnLanesForward: el.tags['turn:lanes:forward'] || '',
          turnLanesBackward: el.tags['turn:lanes:backward'] || '',
          surface: el.tags.surface || '',
          width: parseFloat(el.tags.width || '0') || 0,
          highway: el.tags.highway || '',
          name: el.tags.name || el.tags['name:ru'] || '',
          maxspeed: parseInt(el.tags.maxspeed || '0', 10) || 0,
        }))
        .filter(d => d.lanes > 0 || d.turnLanes);
      allRoadDetails.push(...details);
      console.log(`  ✅ Дороги с полосами: ${details.length}`);
      await sleep(3000);
    }

    await sleep(5000); // longer pause between cities
  }

  // Deduplicate
  allPOIs = dedup(allPOIs);
  allAddresses = dedup(allAddresses);
  allCameras = dedup(allCameras);
  allTrafficLights = dedup(allTrafficLights);
  allSpeedBumps = dedup(allSpeedBumps);
  allRoadSigns = dedup(allRoadSigns);

  // Build road graph
  console.log('\n🔧 Построение дорожного графа...');
  const graph = buildRoadGraph(allGraphElements);
  console.log(`  Узлов: ${Object.keys(graph.nodes).length}, Рёбер: ${graph.edges.length}`);

  // Write files
  console.log('\n💾 Сохранение...');

  if (!roadsOnly) {
    writeJSON(path.join(OUT_DIR, 'pois.json'), allPOIs);
    console.log(`  ✅ pois.json — ${allPOIs.length} объектов (${fileSize(path.join(OUT_DIR, 'pois.json'))})`);

    writeJSON(path.join(OUT_DIR, 'addresses.json'), allAddresses);
    console.log(`  ✅ addresses.json — ${allAddresses.length} адресов (${fileSize(path.join(OUT_DIR, 'addresses.json'))})`);

    writeJSON(path.join(OUT_DIR, 'speed_cameras.json'), allCameras);
    console.log(`  ✅ speed_cameras.json — ${allCameras.length} камер (${fileSize(path.join(OUT_DIR, 'speed_cameras.json'))})`);

    writeJSON(path.join(OUT_DIR, 'traffic_lights.json'), allTrafficLights);
    console.log(`  ✅ traffic_lights.json — ${allTrafficLights.length} светофоров (${fileSize(path.join(OUT_DIR, 'traffic_lights.json'))})`);

    writeJSON(path.join(OUT_DIR, 'speed_bumps.json'), allSpeedBumps);
    console.log(`  ✅ speed_bumps.json — ${allSpeedBumps.length} лежачих полицейских (${fileSize(path.join(OUT_DIR, 'speed_bumps.json'))})`);

    writeJSON(path.join(OUT_DIR, 'road_signs.json'), allRoadSigns);
    console.log(`  ✅ road_signs.json — ${allRoadSigns.length} дорожных знаков (${fileSize(path.join(OUT_DIR, 'road_signs.json'))})`);
  }
  writeJSON(GRAPH_PATH, graph);
  console.log(`  ✅ graph.json — ${Object.keys(graph.nodes).length} узлов (${fileSize(GRAPH_PATH)})`);

  // Write road details (lane data)
  if (allRoadDetails.length > 0) {
    const ROAD_DETAILS_PATH = path.join(OUT_DIR, 'road_details.json');
    writeJSON(ROAD_DETAILS_PATH, allRoadDetails);
    console.log(`  ✅ road_details.json — ${allRoadDetails.length} дорог с данными о полосах (${fileSize(ROAD_DETAILS_PATH)})`);
  }
  // Build search index
  if (!roadsOnly) {
    console.log('\n📇 Построение поискового индекса...');
    const searchIndex = buildSearchIndex(allPOIs, allAddresses);
    writeJSON(path.join(OUT_DIR, 'search_index.json'), searchIndex);
    console.log(`  ✅ search_index.json — ${searchIndex.length} записей (${fileSize(path.join(OUT_DIR, 'search_index.json'))})`);
  }

  console.log('\n✅ Готово! Данные сохранены в public/data/osm/\n');

  // Summary
  console.log('═══════════════════════════════════════');
  if (!roadsOnly) {
    console.log(`  POI:         ${allPOIs.length.toLocaleString()}`);
    console.log(`  Адреса:      ${allAddresses.length.toLocaleString()}`);
    console.log(`  Камеры:      ${allCameras.length.toLocaleString()}`);
    console.log(`  Светофоры:   ${allTrafficLights.length.toLocaleString()}`);
    console.log(`  Лежачие п.:  ${allSpeedBumps.length.toLocaleString()}`);
    console.log(`  Дор. знаки:  ${allRoadSigns.length.toLocaleString()}`);
  }
  console.log(`  Узлы:     ${Object.keys(graph.nodes).length.toLocaleString()}`);
  console.log(`  Рёбра:    ${graph.edges.length.toLocaleString()}`);
  console.log('═══════════════════════════════════════\n');
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildSearchIndex(pois, addresses) {
  const index = [];

  for (const poi of pois) {
    const tokens = tokenize(`${poi.name} ${poi.category} ${poi.address || ''} ${poi.brand || ''} ${poi.cuisine || ''}`);
    index.push({
      id: poi.id,
      type: 'poi',
      name: poi.name,
      display: poi.address ? `${poi.name}, ${poi.address}` : poi.name,
      tokens,
      lat: poi.lat,
      lon: poi.lon,
      category: poi.category,
    });
  }

  for (const addr of addresses) {
    const tokens = tokenize(`${addr.full} ${addr.street} ${addr.house} ${addr.city} ${addr.postcode}`);
    index.push({
      id: addr.id,
      type: 'address',
      name: addr.full,
      display: addr.full,
      tokens,
      lat: addr.lat,
      lon: addr.lon,
      category: 'address',
    });
  }

  return index;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\wа-яёА-ЯЁ\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .slice(0, 20); // limit per entry
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
}

function fileSize(filePath) {
  const bytes = fs.statSync(filePath).size;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

main().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});

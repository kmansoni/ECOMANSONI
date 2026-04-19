import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Test data verification
const cities = [
  { code: 'RU', name: 'Moscow', russian: 'Москва' },
  { code: 'RU', name: 'Kazan', russian: 'Казань' },
  { code: 'RU', name: 'Rostov-on-Don', russian: 'Ростов-на-Дону' },
  { code: 'RU', name: 'Velikent', russian: 'Великент' },
  { code: 'AE', name: 'Dubai', russian: 'Дубай' },
];

const SETTLEMENTS_DIR = path.resolve('public/data/osm/world/processed/settlements');

async function checkCity(filePath, cityName) {
  try {
    const content = await readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    
    const found = data.find(item => 
      item.name === cityName || 
      item.asciiName === cityName ||
      item.alternateNames?.includes(cityName)
    );
    
    return found ? { found: true, population: found.population } : { found: false };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('=== ПРОВЕРКА ДАННЫХ НАВИГАТОРА ===\n');
  
  for (const city of cities) {
    const filePath = path.join(SETTLEMENTS_DIR, `${city.code}.json`);
    const result = await checkCity(filePath, city.name);
    
    if (result.error) {
      console.log(`❌ ${city.name} (${city.code}): Ошибка - ${result.error}`);
    } else if (result.found) {
      console.log(`✅ ${city.name} (${city.russian}) [${city.code}]: найден, население ${result.population?.toLocaleString()}`);
    } else {
      console.log(`❌ ${city.name} (${city.code}): НЕ НАЙДЕН`);
    }
  }
  
  console.log('\n=== ГОТОВО ===');
}

main().catch(console.error);
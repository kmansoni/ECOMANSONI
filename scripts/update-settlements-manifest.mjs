import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SETTLEMENTS_DIR = path.resolve('public/data/osm/world/processed/settlements');
const COUNTRY_INFO = path.resolve('public/data/osm/world/sources/geonames/countryInfo.txt');
const OUTPUT = path.resolve('public/data/osm/world/processed/settlements-manifest.json');

const countryNames = new Map();

async function loadCountryNames() {
  const content = await readFile(COUNTRY_INFO, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts[0] && parts[3]) {
      countryNames.set(parts[0], parts[3]);
    }
  }
}

async function main() {
  await loadCountryNames();
  
  const files = await readdir(SETTLEMENTS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
  
  const manifest = [];
  
  for (const file of jsonFiles) {
    const countryCode = file.replace('.json', '');
    const filePath = path.join(SETTLEMENTS_DIR, file);
    
    try {
      const content = await readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      let topPlace = null;
      let topPopulation = 0;
      
      for (const item of data) {
        if (item.population && item.population > topPopulation) {
          topPopulation = item.population;
          topPlace = item.name || item.asciiName;
        }
      }
      
      manifest.push({
        countryCode,
        countryName: countryNames.get(countryCode) || countryCode,
        count: data.length,
        target: `settlements/${file}`,
        topPlace,
        topPopulation
      });
      
      console.log(`${countryCode}: ${data.length} settlements, top: ${topPlace} (${topPopulation})`);
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }
  
  await writeFile(OUTPUT, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nWritten manifest with ${manifest.length} countries to ${OUTPUT}`);
}

main().catch(console.error);
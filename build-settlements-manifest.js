const fs = require('fs');
const path = require('path');

const BASE_DIR = process.cwd(); // Current working directory

const SETTLEMENTS_DIR = path.join(BASE_DIR, 'public/data/osm/world/processed/settlements');
const COUNTRY_INFO_PATH = path.join(BASE_DIR, 'public/data/osm/world/sources/geonames/countryInfo.txt');
const OUTPUT_PATH = path.join(BASE_DIR, 'public/data/osm/world/processed/settlements-manifest.json');

console.log('Building settlements manifest...');
console.log(`Working dir: ${BASE_DIR}`);

// Parse countryInfo.txt (tab-separated, skip comment lines starting with #)
const countryMap = new Map(); // ISO2 → { name }

const rawLines = fs.readFileSync(COUNTRY_INFO_PATH, 'utf-8').split('\n');
for (const rawLine of rawLines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;

  // Tab-separated fields
  const parts = line.split('\t');
  if (parts.length >= 5) {
    const iso2 = parts[0].trim();
    const countryName = parts[4].trim();
    if (iso2 && /^[A-Z]{2}$/.test(iso2)) {
      countryMap.set(iso2, countryName);
    }
  }
}

console.log(`✓ Loaded ${countryMap.size} countries`);

// Get all settlement files
const allFiles = fs.readdirSync(SETTLEMENTS_DIR)
  .filter(name => name.endsWith('.json'))
  .sort();

console.log(`✓ Found ${allFiles.length} settlement files`);

const results = [];

// Process each file
for (let i = 0; i < allFiles.length; i++) {
  const filename = allFiles[i];
  const countryCode = filename.slice(0, -5); // remove .json
  const filepath = path.join(SETTLEMENTS_DIR, filename);

  try {
    // For very large files, process in streaming fashion
    const content = fs.readFileSync(filepath, 'utf-8');
    const settlements = JSON.parse(content);

    if (!Array.isArray(settlements)) {
      console.warn(`SKIP ${countryCode}: not an array`);
      continue;
    }

    const count = settlements.length;

    // Find city with max population
    let topName = '';
    let topPop = 0;

    for (const s of settlements) {
      const pop = Number(s.population) || 0;
      if (pop > topPop) {
        topPop = pop;
        topName = s.name || '';
      }
    }

    const countryName = countryMap.get(countryCode) || 'Unknown';

    results.push({
      countryCode,
      countryName,
      count,
      target: `settlements/${filename}`,
      topPlace: topName,
      topPopulation: topPop
    });

    if ((i + 1) % 50 === 0 || i === allFiles.length - 1) {
      console.log(`  ${i + 1}/${allFiles.length} processed`);
    }

  } catch (err) {
    console.error(`ERROR ${countryCode}: ${err.message}`);
  }
}

// Sort by countryCode
results.sort((a, b) => a.countryCode.localeCompare(b.countryCode));

// Write output
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
console.log(`✓ Manifest written: ${OUTPUT_PATH}`);
console.log(`✓ Total countries: ${results.length}`);

// Summary stats
const totalSettlements = results.reduce((sum, r) => sum + r.count, 0);
console.log(`✓ Total settlements: ${totalSettlements.toLocaleString()}`);

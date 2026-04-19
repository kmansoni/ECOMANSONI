import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_WORLD_DIR = path.resolve('public/data/osm/world');
const DEFAULT_OUTPUT_DIR = path.resolve('public/data/osm/world/processed');
const GEONAMES_ZIP_NAME = 'allCountries.zip';
const GEONAMES_TEXT_NAME = 'allCountries.txt';

function printUsage() {
  console.log(`
Usage:
  node scripts/process-world-geodata.mjs [options]

Options:
  --world-dir=PATH                Base world data directory. Default: public/data/osm/world
  --output-dir=PATH               Processed output directory. Default: public/data/osm/world/processed
  --country=CODE                  Restrict settlement export to one ISO alpha-2 country code
  --min-population=NUMBER         Filter settlements below this population. Default: 0
  --keep-non-settlements          Include non-populated-place records from GeoNames
  --skip-extract                  Assume allCountries.txt already exists next to the zip
  --help                          Show this help.

Examples:
  node scripts/process-world-geodata.mjs
  node scripts/process-world-geodata.mjs --country=RU --min-population=1000
`);
}

function parseArgs(argv) {
  const options = {
    worldDir: DEFAULT_WORLD_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    country: null,
    minPopulation: 0,
    keepNonSettlements: false,
    skipExtract: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--keep-non-settlements') {
      options.keepNonSettlements = true;
      continue;
    }

    if (arg === '--skip-extract') {
      options.skipExtract = true;
      continue;
    }

    if (arg.startsWith('--world-dir=')) {
      options.worldDir = path.resolve(arg.slice('--world-dir='.length));
      continue;
    }

    if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(arg.slice('--output-dir='.length));
      continue;
    }

    if (arg.startsWith('--country=')) {
      options.country = arg.slice('--country='.length).trim().toUpperCase() || null;
      continue;
    }

    if (arg.startsWith('--min-population=')) {
      const value = Number(arg.slice('--min-population='.length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --min-population value: ${arg}`);
      }
      options.minPopulation = Math.trunc(value);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function extractGeonamesText(zipPath, destinationDir) {
  if (process.platform === 'win32') {
    const psScript = [
      '$ErrorActionPreference = "Stop"',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
    ].join('; ');
    await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript]);
    return;
  }

  await runCommand('unzip', ['-o', zipPath, '-d', destinationDir]);
}

async function ensureGeonamesText(worldDir, skipExtract) {
  const geonamesDir = path.join(worldDir, 'sources', 'geonames');
  const zipPath = path.join(geonamesDir, GEONAMES_ZIP_NAME);
  const textPath = path.join(geonamesDir, GEONAMES_TEXT_NAME);

  if (await exists(textPath)) {
    return textPath;
  }

  if (skipExtract) {
    throw new Error(`Missing ${GEONAMES_TEXT_NAME} and --skip-extract was provided`);
  }

  if (!(await exists(zipPath))) {
    throw new Error(`Missing GeoNames archive: ${zipPath}`);
  }

  console.log(`Extracting ${zipPath}`);
  await extractGeonamesText(zipPath, geonamesDir);

  if (!(await exists(textPath))) {
    throw new Error(`Expected extracted file not found: ${textPath}`);
  }

  return textPath;
}

async function readCountryInfo(filePath, onlyCountry) {
  const countries = [];
  const byCode = new Map();
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split('\t');
    const countryCode = parts[0]?.trim();
    if (!countryCode) continue;
    if (onlyCountry && countryCode !== onlyCountry) continue;

    const country = {
      isoA2: countryCode,
      isoA3: parts[1]?.trim() || null,
      isoNumeric: parts[2]?.trim() || null,
      fips: parts[3]?.trim() || null,
      name: parts[4]?.trim() || null,
      capital: parts[5]?.trim() || null,
      areaSqKm: Number(parts[6] || 0),
      population: Number(parts[7] || 0),
      continent: parts[8]?.trim() || null,
      tld: parts[9]?.trim() || null,
      currencyCode: parts[10]?.trim() || null,
      currencyName: parts[11]?.trim() || null,
      phone: parts[12]?.trim() || null,
      postalCodeFormat: parts[13]?.trim() || null,
      postalCodeRegex: parts[14]?.trim() || null,
      languages: parts[15]?.trim()?.split(',').filter(Boolean) ?? [],
      geonameId: parts[16]?.trim() || null,
      neighbors: parts[17]?.trim()?.split(',').filter(Boolean) ?? [],
      equivalentFipsCode: parts[18]?.trim() || null,
    };

    countries.push(country);
    byCode.set(countryCode, country);
  }

  return { countries, byCode };
}

async function readAdminCodes(filePath, level, onlyCountry) {
  const records = [];
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split('\t');
    const code = parts[0]?.trim();
    if (!code) continue;

    const codeParts = code.split('.');
    const countryCode = codeParts[0] || null;
    if (onlyCountry && countryCode !== onlyCountry) continue;

    records.push({
      code,
      countryCode,
      admin1Code: codeParts[1] || null,
      admin2Code: codeParts[2] || null,
      name: parts[1]?.trim() || null,
      asciiName: parts[2]?.trim() || null,
      geonameId: parts[3]?.trim() || null,
      level,
    });
  }

  return records;
}

function createSettlementFilter(options) {
  return (record) => {
    if (options.country && record.countryCode !== options.country) return false;
    if (!options.keepNonSettlements && record.featureClass !== 'P') return false;
    if (record.population < options.minPopulation) return false;
    return true;
  };
}

function parseGeonamesRecord(line) {
  const parts = line.split('\t');
  return {
    geonameId: parts[0] || null,
    name: parts[1] || null,
    asciiName: parts[2] || null,
    alternateNames: parts[3] ? parts[3].split(',').filter(Boolean) : [],
    latitude: Number(parts[4] || 0),
    longitude: Number(parts[5] || 0),
    featureClass: parts[6] || null,
    featureCode: parts[7] || null,
    countryCode: parts[8] || null,
    cc2: parts[9] ? parts[9].split(',').filter(Boolean) : [],
    admin1Code: parts[10] || null,
    admin2Code: parts[11] || null,
    admin3Code: parts[12] || null,
    admin4Code: parts[13] || null,
    population: Number(parts[14] || 0),
    elevationMeters: parts[15] ? Number(parts[15]) : null,
    demMeters: parts[16] ? Number(parts[16]) : null,
    timezone: parts[17] || null,
    modificationDate: parts[18] || null,
  };
}

function writeToStream(stream, chunk) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      stream.off('drain', handleDrain);
      reject(error);
    };
    const handleDrain = () => {
      stream.off('error', handleError);
      resolve();
    };

    stream.once('error', handleError);
    const ok = stream.write(chunk, 'utf8', () => {
      stream.off('error', handleError);
      if (ok) {
        resolve();
      }
    });

    if (!ok) {
      stream.once('drain', handleDrain);
    }
  });
}

function endStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.end(resolve);
  });
}

async function getCountryWriter(outputDir, countryCode, writers) {
  let writer = writers.get(countryCode);
  if (writer) return writer;

  const shardPath = path.join(outputDir, 'settlements', `${countryCode}.json`);
  await mkdir(path.dirname(shardPath), { recursive: true });
  const stream = createWriteStream(shardPath, { encoding: 'utf8' });
  await writeToStream(stream, '[\n');
  writer = {
    countryCode,
    shardPath,
    stream,
    isFirst: true,
    count: 0,
    topPlace: null,
    topPopulation: 0,
  };
  writers.set(countryCode, writer);
  return writer;
}

async function processSettlements(textPath, options, countryMeta) {
  const filter = createSettlementFilter(options);
  const statsByCountry = new Map();
  const writers = new Map();

  const rl = createInterface({ input: createReadStream(textPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let totalRecords = 0;
  let keptRecords = 0;

  for await (const rawLine of rl) {
    if (!rawLine) continue;
    totalRecords += 1;
    const record = parseGeonamesRecord(rawLine);
    if (!filter(record)) continue;

    keptRecords += 1;
    const countryCode = record.countryCode || 'ZZ';
    const writer = await getCountryWriter(options.outputDir, countryCode, writers);
    const serialized = JSON.stringify(record, null, 2);
    const prefix = writer.isFirst ? '' : ',\n';
    await writeToStream(writer.stream, `${prefix}${serialized}`);
    writer.isFirst = false;
    writer.count += 1;
    if (record.population > writer.topPopulation) {
      writer.topPopulation = record.population;
      writer.topPlace = record.name;
    }

    const existingStats = statsByCountry.get(countryCode) ?? {
      countryCode,
      countryName: countryMeta.byCode.get(countryCode)?.name ?? null,
      count: 0,
      populatedCount: 0,
      maxPopulation: 0,
    };
    existingStats.count += 1;
    if (record.featureClass === 'P') {
      existingStats.populatedCount += 1;
    }
    if (record.population > existingStats.maxPopulation) {
      existingStats.maxPopulation = record.population;
    }
    statsByCountry.set(countryCode, existingStats);
  }

  const shardManifest = [];
  for (const [countryCode, writer] of writers) {
    await writeToStream(writer.stream, '\n]\n');
    await endStream(writer.stream);
    shardManifest.push({
      countryCode,
      countryName: countryMeta.byCode.get(countryCode)?.name ?? null,
      count: writer.count,
      target: `settlements/${countryCode}.json`,
      topPlace: writer.topPlace,
      topPopulation: writer.topPopulation,
    });
  }

  shardManifest.sort((left, right) => left.countryCode.localeCompare(right.countryCode));
  const countryStats = Array.from(statsByCountry.values()).sort((left, right) => left.countryCode.localeCompare(right.countryCode));

  return {
    totalRecords,
    keptRecords,
    shardManifest,
    countryStats,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  await mkdir(options.outputDir, { recursive: true });

  const geonamesDir = path.join(options.worldDir, 'sources', 'geonames');
  const allCountriesTextPath = await ensureGeonamesText(options.worldDir, options.skipExtract);
  const countryInfoPath = path.join(geonamesDir, 'countryInfo.txt');
  const admin1Path = path.join(geonamesDir, 'admin1CodesASCII.txt');
  const admin2Path = path.join(geonamesDir, 'admin2Codes.txt');

  const countryMeta = await readCountryInfo(countryInfoPath, options.country);
  const [admin1, admin2, settlementResults] = await Promise.all([
    readAdminCodes(admin1Path, 1, options.country),
    readAdminCodes(admin2Path, 2, options.country),
    processSettlements(allCountriesTextPath, options, countryMeta),
  ]);

  const worldStats = {
    generatedAt: new Date().toISOString(),
    source: {
      geonamesText: path.relative(options.worldDir, allCountriesTextPath).replace(/\\/g, '/'),
      countryInfo: path.relative(options.worldDir, countryInfoPath).replace(/\\/g, '/'),
      admin1: path.relative(options.worldDir, admin1Path).replace(/\\/g, '/'),
      admin2: path.relative(options.worldDir, admin2Path).replace(/\\/g, '/'),
    },
    filters: {
      country: options.country,
      minPopulation: options.minPopulation,
      keepNonSettlements: options.keepNonSettlements,
    },
    totals: {
      scannedGeonamesRecords: settlementResults.totalRecords,
      exportedRecords: settlementResults.keptRecords,
      countries: countryMeta.countries.length,
      admin1: admin1.length,
      admin2: admin2.length,
      settlementShards: settlementResults.shardManifest.length,
    },
  };

  await Promise.all([
    writeJson(path.join(options.outputDir, 'countries.json'), countryMeta.countries),
    writeJson(path.join(options.outputDir, 'admin1.json'), admin1),
    writeJson(path.join(options.outputDir, 'admin2.json'), admin2),
    writeJson(path.join(options.outputDir, 'settlements-manifest.json'), settlementResults.shardManifest),
    writeJson(path.join(options.outputDir, 'country-stats.json'), settlementResults.countryStats),
    writeJson(path.join(options.outputDir, 'world-stats.json'), worldStats),
  ]);

  console.log(`Processed GeoNames records: scanned=${settlementResults.totalRecords}, exported=${settlementResults.keptRecords}`);
  console.log(`Countries exported: ${countryMeta.countries.length}`);
  console.log(`Settlement shards written: ${settlementResults.shardManifest.length}`);
  console.log(`Processed output saved to ${options.outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
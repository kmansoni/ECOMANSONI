import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GEOFABRIK_INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const GEONAMES_BASE_URL = 'https://download.geonames.org/export/dump';

const GEONAMES_DATASETS = {
  allCountries: {
    url: `${GEONAMES_BASE_URL}/allCountries.zip`,
    target: 'sources/geonames/allCountries.zip',
    description: 'Full GeoNames dump. Includes populated places and non-settlement features.',
  },
  cities500: {
    url: `${GEONAMES_BASE_URL}/cities500.zip`,
    target: 'sources/geonames/cities500.zip',
    description: 'Cities and settlements with population >= 500.',
  },
  cities1000: {
    url: `${GEONAMES_BASE_URL}/cities1000.zip`,
    target: 'sources/geonames/cities1000.zip',
    description: 'Cities and settlements with population >= 1000.',
  },
  cities5000: {
    url: `${GEONAMES_BASE_URL}/cities5000.zip`,
    target: 'sources/geonames/cities5000.zip',
    description: 'Cities and settlements with population >= 5000.',
  },
  cities15000: {
    url: `${GEONAMES_BASE_URL}/cities15000.zip`,
    target: 'sources/geonames/cities15000.zip',
    description: 'Cities and settlements with population >= 15000.',
  },
  countryInfo: {
    url: `${GEONAMES_BASE_URL}/countryInfo.txt`,
    target: 'sources/geonames/countryInfo.txt',
    description: 'Country metadata including ISO codes, population, area, and neighbors.',
  },
  admin1CodesASCII: {
    url: `${GEONAMES_BASE_URL}/admin1CodesASCII.txt`,
    target: 'sources/geonames/admin1CodesASCII.txt',
    description: 'First-order administrative divisions.',
  },
  admin2Codes: {
    url: `${GEONAMES_BASE_URL}/admin2Codes.txt`,
    target: 'sources/geonames/admin2Codes.txt',
    description: 'Second-order administrative divisions.',
  },
  featureCodes: {
    url: `${GEONAMES_BASE_URL}/featureCodes_en.txt`,
    target: 'sources/geonames/featureCodes_en.txt',
    description: 'GeoNames feature code reference.',
  },
};

function printUsage() {
  console.log(`
Usage:
  node scripts/export-world-geodata.mjs [options]

Options:
  --output-dir=PATH               Output directory. Default: public/data/osm/world
  --manifest-only                 Generate manifests only. Do not download GeoNames source files.
  --download-geonames=list        Comma-separated datasets: allCountries,cities500,cities1000,cities5000,cities15000,countryInfo,admin1CodesASCII,admin2Codes,featureCodes
  --include-subregions=false      Keep only top-level country extracts in the main manifest.
  --write-raw-index=false         Skip saving the raw Geofabrik index JSON.
  --help                          Show this help.

Examples:
  node scripts/export-world-geodata.mjs --manifest-only
  node scripts/export-world-geodata.mjs --download-geonames=countryInfo,admin1CodesASCII,admin2Codes
  node scripts/export-world-geodata.mjs --download-geonames=allCountries,countryInfo
`);
}

function parseBoolean(value, defaultValue = true) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseArgs(argv) {
  const options = {
    outputDir: path.resolve('public/data/osm/world'),
    manifestOnly: false,
    includeSubregions: true,
    writeRawIndex: true,
    downloadGeonames: [],
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--manifest-only') {
      options.manifestOnly = true;
      continue;
    }

    if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(arg.slice('--output-dir='.length));
      continue;
    }

    if (arg.startsWith('--download-geonames=')) {
      options.downloadGeonames = arg
        .slice('--download-geonames='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    if (arg.startsWith('--include-subregions=')) {
      options.includeSubregions = parseBoolean(arg.slice('--include-subregions='.length));
      continue;
    }

    if (arg.startsWith('--write-raw-index=')) {
      options.writeRawIndex = parseBoolean(arg.slice('--write-raw-index='.length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const invalidDatasets = options.downloadGeonames.filter((name) => !GEONAMES_DATASETS[name]);
  if (invalidDatasets.length > 0) {
    throw new Error(`Unknown GeoNames dataset(s): ${invalidDatasets.join(', ')}`);
  }

  return options;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'mansoni-world-export/1.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JSON ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'mansoni-world-export/1.0',
      Accept: '*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, Buffer.from(arrayBuffer));
}

function extractFeatureList(indexJson) {
  if (!indexJson || !Array.isArray(indexJson.features)) {
    throw new Error('Unexpected Geofabrik index format: missing features array');
  }

  return indexJson.features
    .filter((feature) => feature?.properties?.urls?.pbf)
    .map((feature) => {
      const properties = feature.properties ?? {};
      const isoA2 = properties['iso3166-1:alpha2'] ?? null;
      const isoA3 = properties['iso3166-1:alpha3'] ?? null;
      const level = Number(properties.level ?? 0) || null;

      return {
        id: properties.id,
        parent: properties.parent ?? null,
        name: properties.name ?? properties.id,
        isoA2,
        isoA3,
        level,
        pbfUrl: properties.urls?.pbf ?? null,
        shpUrl: properties.urls?.shp ?? null,
        historyUrl: properties.urls?.history ?? null,
        updatesUrl: properties.urls?.updates ?? null,
        geometryType: feature.geometry?.type ?? null,
      };
    })
    .filter((entry) => entry.id && entry.pbfUrl)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function buildGeofabrikTargetPath(entry) {
  const pathSegments = ['sources', 'geofabrik'];

  if (entry.parent && entry.parent !== 'root') {
    pathSegments.push(entry.parent);
  }

  pathSegments.push(`${entry.id}.osm.pbf`);
  return pathSegments.join('/');
}

function buildGeofabrikDownloadManifest(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    parent: entry.parent,
    isoA2: entry.isoA2,
    isoA3: entry.isoA3,
    pbfUrl: entry.pbfUrl,
    target: buildGeofabrikTargetPath(entry),
  }));
}

function buildAria2Input(entries) {
  return entries
    .map((entry) => {
      const target = buildGeofabrikTargetPath(entry);
      const targetDir = path.posix.dirname(target);
      const outName = path.posix.basename(target);
      return `${entry.pbfUrl}\n  dir=${targetDir}\n  out=${outName}`;
    })
    .join('\n\n');
}

function buildPowerShellDownloader(entries) {
  const manifestArray = entries
    .map((entry) => {
      const safeUrl = String(entry.pbfUrl).replace(/'/g, "''");
      const safeTarget = buildGeofabrikTargetPath(entry).replace(/'/g, "''");
      return `    @{ Url = '${safeUrl}'; Target = '${safeTarget}' }`;
    })
    .join(',\n');

  return [
    '$ErrorActionPreference = "Stop"',
    '$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$projectRoot = Resolve-Path (Join-Path $root "..")',
    '$downloads = @(',
    manifestArray,
    ')',
    '',
    'foreach ($item in $downloads) {',
    '    $destination = Join-Path $projectRoot $item.Target',
    '    $directory = Split-Path -Parent $destination',
    '    if (-not (Test-Path $directory)) {',
    '        New-Item -ItemType Directory -Path $directory -Force | Out-Null',
    '    }',
    '    if (Test-Path $destination) {',
    '        Write-Host "Skip existing $destination"',
    '        continue',
    '    }',
    '    Write-Host "Downloading $($item.Url)"',
    '    Invoke-WebRequest -Uri $item.Url -OutFile $destination',
    '}',
    '',
    'Write-Host "Geofabrik download batch completed."',
  ].join('\n');
}

function buildSummaryText({ extracts, countries, geonamesDatasets, manifestOnly }) {
  const lines = [
    'World geodata export summary',
    '',
    `Geofabrik extracts: ${extracts.length}`,
    `Country-level extracts: ${countries.length}`,
    `GeoNames datasets requested: ${geonamesDatasets.length > 0 ? geonamesDatasets.join(', ') : 'none'}`,
    `Manifest only: ${manifestOnly ? 'yes' : 'no'}`,
    '',
    'Generated files:',
    '- geofabrik-extracts.json',
    '- geofabrik-countries.json',
    '- geofabrik-download-manifest.json',
    '- geofabrik-download.aria2.txt',
    '- download-geofabrik.ps1',
    '- geonames-manifest.json',
  ];

  return `${lines.join('\n')}\n`;
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

  console.log(`Fetching Geofabrik index from ${GEOFABRIK_INDEX_URL}`);
  const geofabrikIndex = await fetchJson(GEOFABRIK_INDEX_URL);
  const allExtracts = extractFeatureList(geofabrikIndex);
  const geofabrikExtracts = options.includeSubregions
    ? allExtracts
    : allExtracts.filter((entry) => entry.isoA2 || entry.parent === 'root');
  const geofabrikCountries = geofabrikExtracts.filter((entry) => entry.isoA2);
  const geofabrikDownloadManifest = buildGeofabrikDownloadManifest(geofabrikExtracts);

  const geonamesManifest = Object.entries(GEONAMES_DATASETS).map(([name, dataset]) => ({
    name,
    url: dataset.url,
    target: dataset.target,
    description: dataset.description,
    selected: options.downloadGeonames.includes(name),
  }));

  await mkdir(options.outputDir, { recursive: true });

  if (options.writeRawIndex) {
    await writeJson(path.join(options.outputDir, 'geofabrik-index.json'), geofabrikIndex);
  }

  await Promise.all([
    writeJson(path.join(options.outputDir, 'geofabrik-extracts.json'), geofabrikExtracts),
    writeJson(path.join(options.outputDir, 'geofabrik-countries.json'), geofabrikCountries),
    writeJson(path.join(options.outputDir, 'geofabrik-download-manifest.json'), geofabrikDownloadManifest),
    writeJson(path.join(options.outputDir, 'geonames-manifest.json'), geonamesManifest),
    writeFile(path.join(options.outputDir, 'geofabrik-download.aria2.txt'), `${buildAria2Input(geofabrikExtracts)}\n`, 'utf8'),
    writeFile(path.join(options.outputDir, 'download-geofabrik.ps1'), `${buildPowerShellDownloader(geofabrikExtracts)}\n`, 'utf8'),
    writeFile(
      path.join(options.outputDir, 'README.txt'),
      buildSummaryText({
        extracts: geofabrikExtracts,
        countries: geofabrikCountries,
        geonamesDatasets: options.downloadGeonames,
        manifestOnly: options.manifestOnly,
      }),
      'utf8',
    ),
  ]);

  if (!options.manifestOnly) {
    for (const datasetName of options.downloadGeonames) {
      const dataset = GEONAMES_DATASETS[datasetName];
      const destination = path.join(options.outputDir, dataset.target);
      console.log(`Downloading GeoNames dataset ${datasetName} -> ${destination}`);
      await downloadFile(dataset.url, destination);
    }
  }

  console.log(`Saved ${geofabrikExtracts.length} Geofabrik extract records to ${options.outputDir}`);
  console.log(`Saved ${geofabrikCountries.length} country-level records to ${path.join(options.outputDir, 'geofabrik-countries.json')}`);
  if (options.manifestOnly) {
    console.log('Manifest-only mode enabled. No GeoNames source files were downloaded.');
  } else if (options.downloadGeonames.length === 0) {
    console.log('No GeoNames source files requested. Use --download-geonames=... to fetch raw settlement datasets.');
  } else {
    console.log(`Downloaded GeoNames datasets: ${options.downloadGeonames.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
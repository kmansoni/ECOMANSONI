# Mansoni Offline Navigation System

## Python Dependencies

```txt
requests>=2.28.0
psycopg2-binary>=2.9.0
Pillow>=10.0.0
```

Optional (for GDAL-based rendering):
```txt
GDAL>=3.5.0
```

For osmium (faster PBF parsing):
```txt
osmium>=3.7.0
```

## Quick Start

### 1. Download OSM Data

```bash
python scripts/download_osm_data.py russia
python scripts/download_osm_data.py moscow
python scripts/download_osm_data.py --list  # Show available regions
```

### 2. Process OSM Data

```bash
# Extract roads, POIs, and build routing graph
python scripts/process_osm.py data/osm/russia.pbf --graph

# Optional: Save to PostgreSQL
python scripts/process_osm.py data/osm/russia.pbf --db \
  --host localhost --dbname osm --user postgres --password secret
```

### 3. Generate Tiles

```bash
# Generate tiles from zoom 1 to 14
python scripts/generate_tiles.py --osm-dir data/osm/processed \
  --output data/tiles --min-zoom 1 --max-zoom 14

# Or serve tiles directly (for development)
python scripts/generate_tiles.py --serve --port 8080
```

### 4. Build & Run

The system works completely offline:

- **Tiles**: Load from `data/tiles/{z}/{x}/{y}.png`
- **Routing**: Uses `data/osm/graph.json` (Dijkstra algorithm)
- **POI Search**: Uses `data/osm/processed/pois.json`

## File Structure

```
data/
├── osm/
│   ├── russia.pbf              # Raw OSM data
│   ├── processed/
│   │   ├── nodes.json          # Map nodes
│   │   ├── roads.json          # Extracted roads
│   │   └── pois.json           # Points of interest
│   └── graph/
│       └── graph.json          # Routing graph
└── tiles/
    ├── 1/0/0.png
    ├── 2/0/0.png
    └── ...
```

## Configuration

Edit `src/lib/navigation/offlineConfig.ts` to customize:
- `tileBasePath` - Path to tiles directory
- `graphPath` - Path to routing graph
- `poisPath` - Path to POI data
- `enabled` - Enable/disable offline mode
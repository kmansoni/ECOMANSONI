#!/usr/bin/env python3
"""
Генерация карточных тайлов из OSM данных
Использует GDAL/Mapnik для рендеринга PNG тайлов
"""

import os
import sys
import argparse
import json
from pathlib import Path
from typing import Optional, List, Tuple, Dict
import math
import sqlite3

try:
    from osgeo import gdal, osr
    HAS_GDAL = True
except ImportError:
    HAS_GDAL = False

TILE_SIZE = 256
MAX_ZOOM = 17
MIN_ZOOM = 1

WEB_MERCATOR_EARTH_RADIUS = 6378137.0

class TileGenerator:
    def __init__(self, osm_dir: str, output_dir: str = 'data/tiles'):
        self.osm_dir = Path(osm_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.db_path = self.osm_dir / 'cache.db'
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tiles (
                z INTEGER,
                x INTEGER,
                y INTEGER,
                data BLOB,
                PRIMARY KEY (z, x, y)
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS road_cache (
                id INTEGER PRIMARY KEY,
                name TEXT,
                highway TEXT,
                nodes BLOB
            )
        """)
        
        conn.commit()
        conn.close()

    def lat_lon_to_tile(self, lat: float, lon: float, zoom: int) -> Tuple[int, int]:
        lat_rad = math.radians(lat)
        n = 2.0 ** zoom
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
        return x, y

    def tile_to_lat_lon(self, x: int, y: int, zoom: int) -> Tuple[float, float, float, float]:
        n = 2.0 ** zoom
        lon = x / n * 360.0 - 180.0
        lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
        lat = math.degrees(lat_rad)
        
        x2 = (x + 1) / n * 360.0 - 180.0
        lat_rad2 = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))
        lat2 = math.degrees(lat_rad2)
        
        return lat, lon, lat2, lon2

    def generate_tiles(self, min_zoom: int = 1, max_zoom: int = 14, 
                       bbox: Optional[Tuple[float, float, float, float]] = None):
        roads_file = self.osm_dir / 'roads.json'
        if not roads_file.exists():
            print(f"No roads file found: {roads_file}")
            return

        with open(roads_file, 'r') as f:
            roads = json.load(f)

        nodes_file = self.osm_dir / 'nodes.json'
        if nodes_file.exists():
            with open(nodes_file, 'r') as f:
                nodes = json.load(f)
        else:
            nodes = {}

        print(f"Loaded {len(roads)} roads, {len(nodes)} nodes")

        if bbox:
            lat_min, lon_min, lat_max, lon_max = bbox
        else:
            lat_min, lon_min = 90, 180
            lat_max, lon_max = -90, -180
            for road in roads:
                for node_ref in road.get('nodes', [])[:100]:
                    node = nodes.get(str(node_ref))
                    if node:
                        lat_min = min(lat_min, node.get('lat', 90))
                        lon_min = min(lon_min, node.get('lon', 180))
                        lat_max = max(lat_max, node.get('lat', -90))
                        lat_max = max(lat_max, node.get('lon', -180))

        for zoom in range(min_zoom, max_zoom + 1):
            print(f"Generating zoom level {zoom}...")
            
            x_min, y_max = self.lat_lon_to_tile(lat_min, lon_min, zoom)
            x_max, y_min = self.lat_lon_to_tile(lat_max, lon_max, zoom)

            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    lat1, lon1, lat2, lon2 = self.tile_to_lat_lon(x, y, zoom)
                    tile = self._render_tile(roads, nodes, zoom, x, y, lat1, lon1, lat2, lon2)
                    
                    if tile:
                        self._save_tile(zoom, x, y, tile)

        print(f"Tiles saved to {self.output_dir}")

    def _render_tile(self, roads: List[Dict], nodes: Dict, 
                    zoom: int, x: int, y: int,
                    lat1: float, lon1: float, 
                    lat2: float, lon2: float) -> Optional[bytes]:
        from PIL import Image, ImageDraw
        
        width, height = TILE_SIZE, TILE_SIZE
        img = Image.new('RGB', (width, height), (255, 255, 255))
        draw = ImageDraw.Draw(img)

        colors = {
            'motorway': (255, 165, 0),
            'trunk': (255, 140, 0),
            'primary': (255, 200, 0),
            'secondary': (255, 255, 0),
            'tertiary': (200, 200, 100),
            'residential': (150, 150, 150),
            'service': (180, 180, 180),
            'footway': (100, 100, 100),
            'path': (100, 100, 100)
        }

        line_width = max(1, zoom - 6) if zoom < 12 else 4

        for road in roads:
            highway = road.get('tags', {}).get('highway', 'unknown')
            color = colors.get(highway, (150, 150, 150))
            
            points = []
            for node_ref in road.get('nodes', []):
                node = nodes.get(str(node_ref))
                if not node:
                    continue
                    
                lat, lon = node.get('lat', 0), node.get('lon', 0)
                if lat < min(lat1, lat2) or lat > max(lat1, lat2):
                    continue
                if lon < min(lon1, lon2) or lon > max(lon1, lon2):
                    continue
                
                px = int((lon - lon1) / (lon2 - lon1) * width)
                py = int((lat2 - lat) / (lat2 - lat1) * height)
                px = max(0, min(width - 1, px))
                py = max(0, min(height - 1, py))
                points.append((px, py))
            
            if len(points) >= 2:
                draw.line(points, fill=color, width=line_width)

        if zoom >= 15:
            pois_file = self.osm_dir.parent / 'processed' / 'pois.json'
            if pois_file.exists():
                with open(pois_file, 'r') as f:
                    pois = json.load(f)
                
                for poi in pois:
                    lat = poi.get('lat')
                    lon = poi.get('lon')
                    if lat and lon:
                        if lat >= min(lat1, lat2) and lat <= max(lat1, lat2) and \
                           lon >= min(lon1, lon2) and lon <= max(lon1, lon2):
                            px = int((lon - lon1) / (lon2 - lon1) * width)
                            py = int((lat2 - lat) / (lat2 - lat1) * height)
                            px = max(0, min(width - 1, px))
                            py = max(0, min(height - 1, py))
                            draw.ellipse([px-3, py-3, px+3, py+3], fill=(255, 0, 0))

        return img.tobytes()

    def _save_tile(self, z: int, x: int, y: int, data: bytes):
        tile_dir = self.output_dir / str(z) / str(x)
        tile_dir.mkdir(parents=True, exist_ok=True)
        tile_file = tile_dir / f"{y}.png"
        
        from PIL import Image
        img = Image.frombytes('RGB', (TILE_SIZE, TILE_SIZE), data)
        img.save(tile_file, 'PNG')

    def get_tile_path(self, z: int, x: int, y: int) -> Optional[Path]:
        return self.output_dir / str(z) / str(x) / f"{y}.png"

    def serve_tiles(self, host: str = '0.0.0.0', port: int = 8080):
        print(f"Starting tile server on {host}:{port}")
        print(f"Tile directory: {self.output_dir}")
        
        try:
            from http.server import HTTPServer, SimpleHTTPRequestHandler
            import threading
            
            os.chdir(self.output_dir)
            
            class TileHandler(SimpleHTTPRequestHandler):
                def end_headers(self):
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Cache-Control', 'max-age=86400')
                    SimpleHTTPRequestHandler.end_headers(self)
            
            server = HTTPServer((host, port), TileHandler)
            thread = threading.Thread(target=server.serve_forever)
            thread.daemon = True
            thread.start()
            
            print(f"Tile server running at http://{host}:{port}")
            print("Press Ctrl+C to stop")
            
            import time
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                server.shutdown()
        except ImportError:
            print("SimpleHTTPRequestHandler not available, serving via Python file protocol")
            print(f"Tiles available at: file://{self.output_dir.absolute()}")


class AdvancedTileGenerator(TileGenerator):
    def __init__(self, osm_dir: str, output_dir: str = 'data/tiles'):
        super().__init__(osm_dir, output_dir)
        
        if HAS_GDAL:
            self.gdal_driver = gdal.GetDriverByName('PNG')
        else:
            self.gdal_driver = None

    def _render_tile_gdal(self, roads: List[Dict], nodes: Dict],
                         zoom: int, x: int, y: int,
                         lat1: float, lon1: float,
                         lat2: float, lon2: float) -> Optional[bytes]:
        if not self.gdal_driver:
            return None
        
        width, height = TILE_SIZE, TILE_SIZE
        dataset = self.gdal_driver.Create('', width, height, 3, gdal.GDT_Byte)
        
        band_r = dataset.GetRasterBand(1)
        band_g = dataset.GetRasterBand(2)
        band_b = dataset.GetRasterBand(3)
        
        band_r.WriteRaster(0, 0, width, height, [255] * width * height)
        band_g.WriteRaster(0, 0, width, height, [255] * width * height)
        band_b.WriteRaster(0, 0, width, height, [255] * width * height)
        
        dataset = None
        
        return b''


def main():
    parser = argparse.ArgumentParser(description='Generate map tiles from OSM data')
    parser.add_argument('--osm-dir', default='data/osm/processed', help='OSM processed data directory')
    parser.add_argument('--output', default='data/tiles', help='Output tiles directory')
    parser.add_argument('--min-zoom', type=int, default=1, help='Minimum zoom level')
    parser.add_argument('--max-zoom', type=int, default=14, help='Maximum zoom level')
    parser.add_argument('--bbox', nargs=4, type=float, metavar=('LAT1', 'LON1', 'LAT2', 'LON2'),
                       help='Bounding box (min_lat min_lon max_lat max_lon)')
    parser.add_argument('--serve', action='store_true', help='Start tile server')
    parser.add_argument('--port', type=int, default=8080, help='Server port')
    
    args = parser.parse_args()
    
    generator = AdvancedTileGenerator(args.osm_dir, args.output)
    
    if args.serve:
        generator.serve_tiles(port=args.port)
    else:
        generator.generate_tiles(args.min_zoom, args.max_zoom, args.bbox)


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""
Обработка OSM PBF данных
- Извлечение дорог (highway=*)
- Экспорт в формат для routing графа
- Извлечение POI (amenity, shop, tourism)
- Сохранение в PostgreSQL
"""

import os
import sys
import argparse
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
import psycopg2
from psycopg2.extras import execute_batch
import xml.etree.ElementTree as ET

HIGHWAY_TAGS = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'unclassified', 'residential',
    'living_street', 'service', 'footway', 'path', 'track',
    'cycleway', 'bridleway', 'steps'
}

POI_TAGS = {
    'amenity': {'restaurant', 'cafe', 'bar', 'fast_food', 'bank', 'atm', 
                'hospital', 'pharmacy', 'fuel', 'parking', 'school', 'university',
                'library', 'theatre', 'cinema', 'hospital', 'clinic', 'dentist'},
    'shop': {'supermarket', 'convenience', 'clothes', 'shoes', 'electronics',
             'hardware', 'furniture', 'books', 'gift', 'jewelry', 'beauty'},
    'tourism': {'hotel', 'hostel', 'guest_house', 'museum', 'attraction',
                'viewpoint', 'information', 'camp_site', 'caravan_site'},
    'leisure': {'park', 'playground', 'sports_centre', 'swimming_pool', 'fitness'},
    'highway': {'bus_stop'}
}

class OSMProcessor:
    def __init__(self, pbf_file: str, db_params: Optional[Dict] = None):
        self.pbf_file = Path(pbf_file)
        self.db_params = db_params
        self.nodes: Dict[int, Dict] = {}
        self.ways: Dict[int, Dict] = {}
        self.pois: List[Dict] = []
        self.roads: List[Dict] = []

    def parse_pbf(self) -> bool:
        print(f"Parsing {self.pbf_file}...")
        try:
            import sqlite3
            return self._parse_with_osmium()
        except ImportError:
            print("osmium not found, trying xml parsing...")
            return self._parse_xml()
    
    def _parse_with_osmium(self) -> bool:
        try:
            from osmium import osmium, SimpleHandler
            class Handler(SimpleHandler):
                def __init__(self):
                    super().__init__()
                    self.nodes = {}
                    self.ways = {}
                    self.pois = []
                    self.roads = []
                
                def node(self, n):
                    self.nodes[n.id] = {
                        'id': n.id,
                        'lat': n.location.lat,
                        'lon': n.location.lon,
                        'tags': {k: v for k, v in n.tags}
                    }
                
                def way(self, w):
                    tags = {k: v for k, v in w.tags}
                    highway = tags.get('highway')
                    is_road = highway in HIGHWAY_TAGS
                    is_poi = any(tags.get(k) in v for k, vals in POI_TAGS.items() for v in vals)
                    
                    if is_road:
                        self.roads.append({
                            'id': w.id,
                            'nodes': [n.ref for n in w.nodes],
                            'tags': tags
                        })
                    elif is_poi:
                        nodes = [n.ref for n in w.nodes]
                        if nodes:
                            self.pois.append({
                                'id': w.id,
                                'type': tags.get('amenity') or tags.get('shop') or tags.get('tourism') or tags.get('leisure'),
                                'name': tags.get('name', ''),
                                'tags': tags
                            })
            
            handler = Handler()
            handler.apply_file(str(self.pbf_file), locations=True)
            self.nodes = handler.nodes
            self.roads = handler.roads
            self.pois = handler.pois
            return True
        except Exception as e:
            print(f"osmium error: {e}")
            return self._parse_xml()
    
    def _parse_xml(self) -> bool:
        try:
            context = ET.iterparse(str(self.pbf_file), events=('end',))
            for event, elem in context:
                if elem.tag == 'node':
                    lat = float(elem.get('lat', 0))
                    lon = float(elem.get('lon', 0))
                    tags = {child.get('k'): child.get('v') for child in elem.findall('tag')}
                    
                    self.nodes[int(elem.get('id'))] = {
                        'id': int(elem.get('id')),
                        'lat': lat,
                        'lon': lon,
                        'tags': tags
                    }
                    
                    poi_type = None
                    for k, vals in POI_TAGS.items():
                        if tags.get(k) in vals:
                            poi_type = tags[k]
                            break
                    
                    if poi_type:
                        self.pois.append({
                            'id': int(elem.get('id')),
                            'type': poi_type,
                            'name': tags.get('name', ''),
                            'lat': lat,
                            'lon': lon,
                            'tags': tags
                        })
                
                elif elem.tag == 'way':
                    tags = {child.get('k'): child.get('v') for child in elem.findall('tag')}
                    highway = tags.get('highway')
                    
                    if highway in HIGHWAY_TAGS:
                        node_refs = [int(n.get('ref')) for n in elem.findall('nd')]
                        self.roads.append({
                            'id': int(elem.get('id')),
                            'nodes': node_refs,
                            'tags': tags
                        })
                    else:
                        for k, vals in POI_TAGS.items():
                            if tags.get(k) in vals:
                                node_refs = [int(n.get('ref')) for n in elem.findall('nd')]
                                if node_refs:
                                    first_node = self.nodes.get(node_refs[0])
                                    if first_node:
                                        self.pois.append({
                                            'id': int(elem.get('id')),
                                            'type': tags[k],
                                            'name': tags.get('name', ''),
                                            'lat': first_node['lat'],
                                            'lon': first_node['lon'],
                                            'tags': tags
                                        })
                                break
                
                elem.clear()
            
            return True
        except Exception as e:
            print(f"XML parse error: {e}")
            return False

    def export_to_json(self, output_dir: str = 'data/osm/processed'):
        output = Path(output_dir)
        output.mkdir(parents=True, exist_ok=True)
        
        nodes_file = output / 'nodes.json'
        roads_file = output / 'roads.json'
        pois_file = output / 'pois.json'
        
        print(f"Exporting to {output}...")
        
        with open(roads_file, 'w') as f:
            json.dump(self.roads, f, indent=2)
        
        with open(pois_file, 'w') as f:
            json.dump(self.pois, f, indent=2)
        
        nodes_data = {str(k): v for k, v in self.nodes.items()}
        with open(nodes_file, 'w') as f:
            json.dump(nodes_data, f, indent=2)
        
        print(f"Exported: {len(self.roads)} roads, {len(self.pois)} POIs, {len(self.nodes)} nodes")
        return output

    def save_to_postgres(self):
        if not self.db_params:
            print("No database params provided")
            return
        
        print("Saving to PostgreSQL...")
        conn = psycopg2.connect(**self.db_params)
        cur = conn.cursor()
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS osm_roads (
                id BIGINT PRIMARY KEY,
                nodes BIGINT[],
                highway VARCHAR(50),
                name VARCHAR(500),
                ref VARCHAR(100),
                maxspeed INTEGER,
                oneway BOOLEAN,
                geometry GEOMETRY(MultiLineString, 4326)
            )
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS osm_pois (
                id BIGINT PRIMARY KEY,
                type VARCHAR(100),
                name VARCHAR(500),
                lat FLOAT,
                lon FLOAT,
                tags JSONB,
                geometry GEOMETRY(Point, 4326)
            )
        """)
        
        cur.execute("CREATE INDEX IF NOT EXISTS idx_roads_highway ON osm_roads(highway)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_pois_type ON osm_pois(type)")
        
        road_data = []
        for road in self.roads:
            nodes_coords = [(self.nodes[n]['lon'], self.nodes[n]['lat']) 
                          for n in road['nodes'] if n in self.nodes]
            if len(nodes_coords) >= 2:
                road_data.append((
                    road['id'],
                    road['nodes'],
                    road['tags'].get('highway'),
                    road['tags'].get('name', ''),
                    road['tags'].get('ref', ''),
                    int(road['tags'].get('maxspeed', 0)) or None,
                    road['tags'].get('oneway') == 'yes',
                    f'MultiLineString({nodes_coords})'
                ))
        
        execute_batch(cur, """
            INSERT INTO osm_roads (id, nodes, highway, name, ref, maxspeed, oneway, geometry)
            VALUES (%s, %s, %s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326))
            ON CONFLICT (id) DO UPDATE SET
                nodes = EXCLUDED.nodes,
                highway = EXCLUDED.highway,
                name = EXCLUDED.name,
                geometry = EXCLUDED.geometry
        """, road_data, page_size=1000)
        
        poi_data = []
        for poi in self.pois:
            if 'lat' in poi and 'lon' in poi:
                poi_data.append((
                    poi['id'],
                    poi['type'],
                    poi['name'],
                    poi['lat'],
                    poi['lon'],
                    json.dumps(poi.get('tags', {})),
                    f"POINT({poi['lon']} {poi['lat']})"
                ))
        
        execute_batch(cur, """
            INSERT INTO osm_pois (id, type, name, lat, lon, tags, geometry)
            VALUES (%s, %s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326))
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                geometry = EXCLUDED.geometry
        """, poi_data, page_size=1000)
        
        conn.commit()
        cur.close()
        conn.close()
        print(f"Saved {len(road_data)} roads and {len(poi_data)} POIs to PostgreSQL")

    def build_graph(self, output_dir: str = 'data/osm/graph') -> Path:
        output = Path(output_dir)
        output.mkdir(parents=True, exist_ok=True)
        
        print("Building routing graph...")
        
        graph = {
            'nodes': {},
            'edges': []
        }
        
        node_index = {}
        for node_id, node in self.nodes.items():
            node_index[node_id] = len(node_index)
            graph['nodes'][str(node_id)] = {
                'lat': node['lat'],
                'lon': node['lon']
            }
        
        for road in self.roads:
            nodes = road['nodes']
            tags = road['tags']
            
            highway = tags.get('highway', 'unknown')
            speed = {
                'motorway': 120, 'trunk': 100, 'primary': 80,
                'secondary': 60, 'tertiary': 50, 'residential': 30,
                'service': 20, 'footway': 5
            }.get(highway, 40)
            
            maxspeed = tags.get('maxspeed')
            if maxspeed and maxspeed.isdigit():
                speed = int(maxspeed)
            
            oneway = tags.get('oneway') == 'yes'
            
            for i in range(len(nodes) - 1):
                n1, n2 = nodes[i], nodes[i + 1]
                if n1 in node_index and n2 in node_index:
                    distance = self._haversine(
                        self.nodes[n1]['lat'], self.nodes[n1]['lon'],
                        self.nodes[n2]['lat'], self.nodes[n2]['lon']
                    )
                    
                    graph['edges'].append({
                        'fromNode': str(n1),
                        'toNode': str(n2),
                        'distance': round(distance, 2),
                        'speed': speed,
                        'highway': highway,
                        'name': tags.get('name', '')
                    })
                    
                    if not oneway:
                        graph['edges'].append({
                            'fromNode': str(n2),
                            'toNode': str(n1),
                            'distance': round(distance, 2),
                            'speed': speed,
                            'highway': highway,
                            'name': tags.get('name', '')
                        })
        
        graph_file = output / 'graph.json'
        with open(graph_file, 'w') as f:
            json.dump(graph, f, indent=2)
        
        print(f"Graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
        return output

    def _haversine(self, lat1, lon1, lat2, lon2):
        import math
        R = 6371000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
        return R * 2 * math.asin(math.sqrt(a))

def main():
    parser = argparse.ArgumentParser(description='Process OSM PBF data')
    parser.add_argument('pbf_file', help='Path to PBF file')
    parser.add_argument('--output', default='data/osm/processed', help='Output directory')
    parser.add_argument('--db', action='store_true', help='Save to PostgreSQL')
    parser.add_argument('--host', default='localhost', help='PostgreSQL host')
    parser.add_argument('--port', default=5432, type=int, help='PostgreSQL port')
    parser.add_argument('--dbname', default='osm', help='Database name')
    parser.add_argument('--user', default='postgres', help='Database user')
    parser.add_argument('--password', default='', help='Database password')
    parser.add_argument('--graph', action='store_true', help='Build routing graph')
    
    args = parser.parse_args()
    
    db_params = None
    if args.db:
        db_params = {
            'host': args.host,
            'port': args.port,
            'dbname': args.dbname,
            'user': args.user,
            'password': args.password
        }
    
    processor = OSMProcessor(args.pbf_file, db_params)
    
    if not processor.parse_pbf():
        print("Failed to parse PBF file")
        sys.exit(1)
    
    processor.export_to_json(args.output)
    
    if args.graph:
        processor.build_graph()
    
    if args.db:
        processor.save_to_postgres()

if __name__ == '__main__':
    main()
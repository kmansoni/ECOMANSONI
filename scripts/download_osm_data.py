#!/usr/bin/env python3
"""
Скрипт для скачивания OSM данных (PBF) с Geofabrik
Поддержка регионов: Россия, Москва, Санкт-Петербург, СНГ, Европа
"""

import os
import sys
import argparse
import hashlib
import requests
from pathlib import Path
from typing import Optional, Dict
import time

REGIONS: Dict[str, str] = {
    'russia': 'russia',
    'moscow': 'russia/central_federal_district/moscow',
    'saint-petersburg': 'russia/northwestern_federal_district/saint_petersburg',
    'cnis': 'cis',
    'europe': 'europe',
}

BASE_URL = 'https://download.geofabrik.de'

class OSMDownloader:
    def __init__(self, data_dir: str = 'data/osm'):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'MansoniOSM/1.0 (Offline Navigation)'
        })

    def get_download_url(self, region: str) -> str:
        if region not in REGIONS:
            raise ValueError(f"Unknown region: {region}. Available: {list(REGIONS.keys())}")
        return f"{BASE_URL}/{REGIONS[region]}-latest.osm.pbf"

    def get_file_size(self, url: str) -> Optional[int]:
        try:
            response = self.session.head(url, timeout=10)
            if response.status_code == 200:
                return int(response.headers.get('content-length', 0))
        except Exception as e:
            print(f"Error getting file size: {e}")
        return None

    def download_with_progress(self, url: str, output_path: Path, resume: bool = True) -> bool:
        headers = {}
        mode = 'ab'
        downloaded = 0

        if resume and output_path.exists():
            downloaded = output_path.stat().st_size
            headers['Range'] = f'bytes={downloaded}-'
            mode = 'ab'
            print(f"Resuming download from {downloaded} bytes...")
        else:
            mode = 'wb'

        try:
            response = self.session.get(url, headers=headers, stream=True, timeout=30)
            
            if response.status_code == 416:
                print(f"File already downloaded: {output_path.name}")
                return True
            
            if response.status_code not in (200, 206):
                print(f"Error: HTTP {response.status_code}")
                return False

            total_size = int(response.headers.get('content-length', 0))
            if downloaded > 0:
                total_size += downloaded

            print(f"Downloading {total_size / (1024*1024):.1f} MB...")
            
            with open(output_path, mode) as f:
                downloaded_chunk = 0
                last_progress = 0
                start_time = time.time()
                
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_chunk += len(chunk)
                        
                        if total_size > 0:
                            progress = int((downloaded + downloaded_chunk) * 100 / total_size)
                            if progress >= last_progress + 5:
                                elapsed = time.time() - start_time
                                speed = downloaded_chunk / elapsed / 1024 / 1024 if elapsed > 0 else 0
                                print(f"Progress: {progress}% ({speed:.1f} MB/s)")
                                last_progress = progress

            return True

        except Exception as e:
            print(f"Download error: {e}")
            return False

    def download_region(self, region: str, resume: bool = True) -> Optional[Path]:
        url = self.get_download_url(region)
        filename = f"{region}.pbf"
        output_path = self.data_dir / filename

        print(f"Downloading {region} from {url}")
        
        if self.download_with_progress(url, output_path, resume):
            return output_path
        return None

    def list_available_regions(self):
        print("Available regions:")
        for name in REGIONS:
            print(f"  - {name}")

def main():
    parser = argparse.ArgumentParser(description='Download OSM PBF data from Geofabrik')
    parser.add_argument('region', nargs='?', help='Region to download')
    parser.add_argument('--list', action='store_true', help='List available regions')
    parser.add_argument('--data-dir', default='data/osm', help='Output directory')
    parser.add_argument('--no-resume', action='store_true', help='Start download from beginning')
    
    args = parser.parse_args()

    downloader = OSMDownloader(args.data_dir)

    if args.list:
        downloader.list_available_regions()
        return

    if not args.region:
        parser.print_help()
        downloader.list_available_regions()
        return

    result = downloader.download_region(args.region, resume=not args.no_resume)
    if result:
        print(f"Downloaded: {result}")
    else:
        print("Download failed")
        sys.exit(1)

if __name__ == '__main__':
    main()
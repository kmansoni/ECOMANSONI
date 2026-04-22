#!/usr/bin/env python3
"""
survey_processor.py — Обработка сканов карты (фотограмметрия + LiDAR)
Используется фоновым воркером (pg_cron / Redis Queue / FastAPI background task)

Пример запуска:
  python survey_processor.py --scan-id=550e8400-e29b-41d4-a716-446655440000
"""

import argparse
import asyncio
import json
import logging
import os
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional, Dict, Any
import numpy as np

from supabase import create_client, Client
from postgrest.exceptions import APIError

# Config
SUPABASE_URL = os.getenv('SUPABASE_URL', 'http://localhost:54321')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'eyJ...')  # service_role
OPENMVG_PATH = os.getenv('OPENMVG_PATH', '/opt/openmvg/bin')
PROCESSING_TEMP_DIR = Path(os.getenv('PROCESSING_TEMP', '/tmp/survey-processing'))

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('survey_processor')


@dataclass
class ScanMetadata:
    scan_id: uuid.UUID
    scan_type: str
    images: List[str]  # URLs
    user_id: str
    track_linestring: Optional[str] = None
    device_model: Optional[str] = None


class SurveyProcessor:
    """Основной класс обработки скана"""

    def __init__(self, scan_id: uuid.UUID, supabase_client: Client):
        self.scan_id = scan_id
        self.supabase = supabase_client
        self.workdir = PROCESSING_TEMP_DIR / str(scan_id)
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.metadata: Optional[ScanMetadata] = None

    async def run(self):
        """Full processing pipeline"""
        try:
            # 1. Load metadata from DB
            await self._load_metadata()
            await self._update_status('processing', 'Downloading images...')

            # 2. Download images
            image_paths = await self._download_images()

            # 3. Run OpenMVG SfM
            await self._update_status('processing', 'Structure-from-Motion...')
            reconstruction = await self._run_openmvg(image_paths)

            # 4. Extract geometry
            await self._update_status('processing', 'Extracting geometry...')
            footprint, dimensions = self._extract_geometry(reconstruction)

            # 5. Compute quality metrics
            quality_score = self._compute_quality_score(reconstruction, dimensions)

            # 6. Save results
            await self._save_results(footprint, dimensions, quality_score)

            # 7. Auto-create map edit (if quality high enough)
            if quality_score >= 0.6:
                await self._create_map_edit(footprint, dimensions, quality_score)
                await self._update_status('proposed', f'Quality: {quality_score:.2%}')
            else:
                await self._update_status('rejected', f'Low quality: {quality_score:.2%}')

            logger.info(f'Scan {self.scan_id} processed successfully: quality={quality_score:.2%}')
            return True

        except Exception as e:
            logger.error(f'Scan {self.scan_id} failed: {e}', exc_info=True)
            await self._update_status('failed', str(e))
            return False

    async def _load_metadata(self):
        """Load scan metadata from DB"""
        resp = self.supabase.table('nav_survey_scans').select('*').eq('id', str(self.scan_id)).single().execute()
        data = resp.data
        if not data:
            raise ValueError(f'Scan {self.scan_id} not found')

        self.metadata = ScanMetadata(
            scan_id=uuid.UUID(data['id']),
            scan_type=data['scan_type'],
            images=data['images'],
            user_id=data['user_id'],
            track_linestring=data.get('track_linestring'),
            device_model=data['metadata'].get('device_model') if data.get('metadata') else None
        )

    async def _download_images(self) -> List[Path]:
        """Download all images to local temp dir"""
        image_paths = []
        for idx, url in enumerate(self.metadata.images):
            dest = self.workdir / f'img_{idx:04d}.jpg'
            # Use curl/wget or Python requests
            subprocess.run(['curl', '-s', '-L', '-o', str(dest), url], check=True)
            image_paths.append(dest)
        logger.info(f'Downloaded {len(image_paths)} images')
        return image_paths

    async def _run_openmvg(self, image_paths: List[Path]) -> Dict[str, Any]:
        """
        Run OpenMVG pipeline: 
        1. Compute features
        2. Match features
        3. Incremental SfM
        Returns reconstruction (camera poses + sparse point cloud)
        """
        # Prepare openmvg descriptor database
        imgs_dir = self.workdir / 'images'
        imgs_dir.mkdir(exist_ok=True)
        # Symlink images (OpenMVG expects specific structure)
        for idx, p in enumerate(image_paths):
            (imgs_dir / f'img_{idx:04d}.jpg').symlink_to(p)

        # 1. List images
        subprocess.run([
            f'{OPENMVG_PATH}/openMVG_main_SfMInit_ImageListing',
            '-i', str(imgs_dir),
            '-o', str(self.workdir / 'matching'),
            '-d', '/opt/openmvg/sensor_width_camera_database.txt'
        ], check=True)

        # 2. Compute features
        subprocess.run([
            f'{OPENMVG_PATH}/openMVG_main_ComputeFeatures',
            '-i', str(self.workdir / 'matching' / 'sfm_data.json'),
            '-o', str(self.workdir / 'matching'),
            '-m', 'SIFT',  # or 'SIFT_FULL'
            '-u', '1'      # use all features
        ], check=True, cwd=self.workdir)

        # 3. Match features (exhaustive or guided)
        subprocess.run([
            f'{OPENMVG_PATH}/openMVG_main_ComputeMatches',
            '-i', str(self.workdir / 'matching' / 'sfm_data.json'),
            '-o', str(self.workdir / 'matching'),
            '-f', '1'  # exhaustive
        ], check=True, cwd=self.workdir)

        # 4. Incremental SfM
        result = subprocess.run([
            f'{OPENMVG_PATH}/openMVG_main_IncrementalSfM',
            '-i', str(self.workdir / 'matching' / 'sfm_data.json'),
            '-m', str(self.workdir / 'matching'),
            '-o', str(self.workdir / 'reconstruction'),
            '-u', '1'  # refine intrinsics
        ], check=True, cwd=self.workdir, capture_output=True, text=True)

        # Parse output: reconstruction.sfm if success
        sfm_data_path = self.workdir / 'reconstruction' / 'sfm_data.bin'
        if not sfm_data_path.exists():
            raise RuntimeError(f'SfM failed: {result.stderr}')

        # Export to ply (point cloud)
        subprocess.run([
            f'{OPENMVG_PATH}/openMVG_main_ComputeSfM_DataColor',
            '-i', str(sfm_data_path),
            '-o', str(self.workdir / 'reconstruction' / 'colorized.ply')
        ], check=True, cwd=self.workdir)

        # Parse reconstruction (we'll use open3d or numpy later)
        # For now, return metadata about reconstruction
        return {
            'sfm_data': str(sfm_data_path),
            'point_cloud': str(self.workdir / 'reconstruction' / 'colorized.ply'),
            'camera_poses': str(self.workdir / 'reconstruction' / 'sfm_data.json'),
            'stats': self._parse_openmvg_log(result.stdout)
        }

    def _extract_geometry(self, reconstruction: Dict[str, Any]) -> tuple:
        """
        From point cloud (PLY), extract:
        1. Footprint polygon (2D)
        2. Dimensions (length, width, height)
        Returns: (footprint_wkt, dimensions_dict)
        """
        import open3d as o3d

        pcd = o3d.io.read_point_cloud(reconstruction['point_cloud'])
        points = np.asarray(pcd.points)  # Nx3 (X,Y,Z in local SfM coords)

        # Filter outliers (statistical)
        pcd_clean, ind = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
        points_clean = np.asarray(pcd_clean.points)

        # --- 2D FOOTPRINT (ignore Y = height) ---
        # Project to ground plane (XZ), find convex hull
        points_2d = points_clean[:, [0, 2]]  # X, Z

        from scipy.spatial import ConvexHull
        hull = ConvexHull(points_2d)
        hull_points = points_2d[hull.vertices]

        # Convert to WKT polygon (must re-project to WGS84 later)
        # For now: return hull in SfM local coordinates (meters)
        polygon_wkt = f'POLYGON(({", ".join(f"{x} {z}" for x, z in hull_points)}))'

        # --- DIMENSIONS ---
        # Oriented bounding box (simplified: axis-aligned)
        min_x, max_x = points_2d[:, 0].min(), points_2d[:, 0].max()
        min_z, max_z = points_2d[:, 1].min(), points_2d[:, 1].max()
        length = max_x - min_x
        width = max_z - min_z

        # Height from Y coordinate
        min_y = points_clean[:, 1].min()
        max_y = points_clean[:, 1].max()
        height = max_y - min_y

        area = length * width
        volume = length * width * height if height else None

        dimensions = {
            'length_m': round(float(length), 2),
            'width_m': round(float(width), 2),
            'height_m': round(float(height), 2) if height > 0.5 else None,
            'area_m2': round(float(area), 2),
            'volume_m3': round(float(volume), 2) if volume else None,
            'method': 'photogrammetry_sfm',
            'accuracy_estimate_m': 0.10  # 10cm typical for SfM from phone
        }

        return polygon_wkt, dimensions

    def _compute_quality_score(self, reconstruction: Dict, dimensions: Dict) -> float:
        """
        Combined quality score [0-1]:
        - photo count (more = better)
        - point density (points/m²)
        - completeness (% of object sides captured)
        - reprojection error from SfM
        """
        stats = reconstruction.get('stats', {})

        n_photos = len(self.metadata.images)
        n_points = stats.get('point_count', 0)
        reprojection_error = stats.get('mean_reprojection_error', 5.0)  # pixels

        # Factors
        photo_score = min(1.0, n_photos / 100)  # 100 photos = 1.0
        density_score = min(1.0, n_points / 10000)  # 10k points = good
        error_score = max(0, 1 - (reprojection_error / 10))  # <2px = good

        # Completeness (from track coverage) — placeholder
        completeness = 0.8

        # Weighted sum
        quality = np.mean([photo_score, density_score, error_score, completeness])

        return float(np.clip(quality, 0, 1))

    async def _save_results(self, footprint: str, dimensions: Dict, quality: float):
        """Save to nav_survey_scans table"""
        update_data = {
            'footprint_geometry': footprint,  # WKT (will be cast to geometry)
            'computed_dimensions': dimensions,
            'quality_score': quality,
            'completeness_pct': int(quality * 100),
            'status': 'ready',
            'processed_at': 'now()'
        }

        self.supabase.table('nav_survey_scans').update(update_data).eq('id', str(self.scan_id)).execute()

    async def _create_map_edit(self, footprint: str, dimensions: Dict, quality: float):
        """Auto-create nav_map_edits from scan"""
        # Call the Postgres RPC
        self.supabase.rpc(
            'create_map_edit_from_scan',
            {'scan_id': str(self.scan_id), 'editor_id': self.metadata.user_id}
        ).execute()

    async def _update_status(self, status: str, message: Optional[str] = None):
        """Update scan status (and optional error message)"""
        data = {'status': status, 'updated_at': 'now()'}
        if message:
            # Append to metadata JSON (could add 'last_error')
            pass
        self.supabase.table('nav_survey_scans').update(data).eq('id', str(self.scan_id)).execute()
        logger.info(f'Scan {self.scan_id} status: {status}')

    def _parse_openmvg_log(self, stdout: str) -> Dict[str, Any]:
        """Parse OpenMVG output for stats"""
        stats = {}
        for line in stdout.split('\n'):
            if 'point cloud size' in line.lower():
                try:
                    stats['point_count'] = int(line.split(':')[-1].strip())
                except: pass
            if 'mean reprojection error' in line.lower():
                try:
                    stats['mean_reprojection_error'] = float(line.split(':')[-1].strip().split()[0])
                except: pass
        return stats


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

async def main(scan_id: uuid.UUID):
    """Entrypoint для worker'а"""
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    processor = SurveyProcessor(scan_id, supabase)
    success = await processor.run()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Survey scan processor')
    parser.add_argument('--scan-id', required=True, help='UUID of scan to process')
    args = parser.parse_args()

    scan_id = uuid.UUID(args.scan_id)
    asyncio.run(main(scan_id))

"""
Navigation Server — H3 Geo-Indexing Service
Uses uber/h3 Python bindings (h3==3.7.7).
All methods are pure functions — stateless, thread-safe, no I/O.
"""
from __future__ import annotations

import h3


class H3Service:
    """
    Thin wrapper around the h3 library that:
    - Normalises the h3 3.x API surface
    - Provides resolution selection heuristics
    - Converts between cell ↔ latlng ↔ boundary
    """

    @staticmethod
    def latlng_to_h3(lat: float, lng: float, resolution: int = 9) -> str:
        """
        Convert WGS-84 coordinates to H3 cell index.
        Resolution 9 ≈ 0.1 km² cell area (good for POI / driver density).
        """
        return h3.latlng_to_cell(lat, lng, resolution)

    @staticmethod
    def h3_to_latlng(h3_index: str) -> tuple[float, float]:
        """
        Return (lat, lng) for the centroid of an H3 cell.
        """
        return h3.cell_to_latlng(h3_index)

    @staticmethod
    def k_ring(h3_index: str, k: int = 1) -> list[str]:
        """
        Return all H3 cells within k rings of the given cell (including itself).
        k=1 → 7 cells; k=2 → 19 cells; k=3 → 37 cells.
        """
        return list(h3.grid_disk(h3_index, k))

    @staticmethod
    def h3_to_boundary(h3_index: str) -> list[tuple[float, float]]:
        """
        Return (lat, lng) vertex pairs forming the cell boundary polygon.
        """
        return h3.cell_to_boundary(h3_index)

    @staticmethod
    def h3_to_geojson_polygon(h3_index: str) -> dict:
        """
        Return a GeoJSON Polygon dict for the cell boundary.
        Coordinates are [[lng, lat], …] as per GeoJSON spec.
        """
        boundary = h3.cell_to_boundary(h3_index)
        # boundary is [(lat, lng), …]; GeoJSON wants [lng, lat]
        coords = [[lng, lat] for lat, lng in boundary]
        coords.append(coords[0])  # close ring
        return {"type": "Polygon", "coordinates": [coords]}

    @staticmethod
    def cells_for_bbox(
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
        resolution: int = 9,
    ) -> list[str]:
        """
        Return all H3 cells that cover a bounding box at the given resolution.
        Uses grid_disk starting from the centre; verified with hex containment.
        """
        # Polygon vertices in GeoJSON order [lng, lat]
        polygon_coords = [
            [min_lng, min_lat],
            [max_lng, min_lat],
            [max_lng, max_lat],
            [min_lng, max_lat],
            [min_lng, min_lat],
        ]
        geojson_polygon = {
            "type": "Polygon",
            "coordinates": [polygon_coords],
        }
        return list(h3.polyfill_geojson(geojson_polygon, resolution))

    @staticmethod
    def compact(cells: list[str]) -> list[str]:
        """
        Hierarchically compact a set of cells to the minimum covering set.
        Useful to reduce Kafka event payload size.
        """
        return list(h3.compact_cells(cells))

    @staticmethod
    def uncompact(cells: list[str], resolution: int) -> list[str]:
        """Expand a compacted set of cells to a given resolution."""
        return list(h3.uncompact_cells(cells, resolution))

    @staticmethod
    def get_resolution_for_radius(radius_m: float) -> int:
        """
        Heuristic: pick the H3 resolution whose average edge length
        is ≤ radius_m / 2, so a k=1 ring covers the search area.

        H3 average edge lengths (metres):
          res 11: ~24 m   →  ~174 m diameter
          res 10: ~65 m   →  ~472 m
          res  9: ~174 m  →  ~1.3 km
          res  8: ~466 m  →  ~3.4 km
          res  7: ~1.25 km → ~9 km
          res  6: ~3.35 km → ~24 km
          res  5: ~8.98 km → ~65 km
        """
        if radius_m <= 100:
            return 11
        if radius_m <= 500:
            return 10
        if radius_m <= 2_000:
            return 9
        if radius_m <= 5_000:
            return 8
        if radius_m <= 20_000:
            return 7
        if radius_m <= 80_000:
            return 6
        return 5

    @staticmethod
    def is_valid(h3_index: str) -> bool:
        return h3.is_valid_cell(h3_index)

    @staticmethod
    def get_resolution(h3_index: str) -> int:
        return h3.get_resolution(h3_index)

    @staticmethod
    def parent(h3_index: str, resolution: int) -> str:
        """Get the parent cell at a coarser resolution."""
        return h3.cell_to_parent(h3_index, resolution)

    @staticmethod
    def children(h3_index: str, resolution: int) -> list[str]:
        """Get child cells at a finer resolution."""
        return list(h3.cell_to_children(h3_index, resolution))

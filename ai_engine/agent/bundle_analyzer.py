#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📦 Bundle Analyzer — визуализация bundle.

Возможности:
- Анализ размера бандла
- Tree-shaking визуализация
- Dependencies graph
- Chunk splitting анализ
- Recommendations
"""

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class FileType(Enum):
    """Тип файла."""
    JS = "js"
    CSS = "css"
    ASSET = "asset"
    SOURCE_MAP = "map"


@dataclass
class BundleFile:
    """Файл в бандле."""
    name: str
    path: str
    size: int
    size_gzipped: int = 0
    type: FileType = FileType.JS
    is_minified: bool = False
    source_map: str = ""
    imports: list[str] = field(default_factory=list)


@dataclass
class BundleAnalysis:
    """Результат анализа."""
    total_size: int = 0
    total_gzipped: int = 0
    files: list[BundleFile] = field(default_factory=list)
    chunks: list[dict] = field(default_factory=list)
    duplicates: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


class BundleAnalyzer:
    """
    Анализатор бандлов.
    
    Анализирует:
    - Размеры файлов
    - Дубликаты
    - Tree-shaking
    - Recommendations
    """

    def __init__(self, dist_path: str = "dist"):
        self.dist_path = dist_path
    
    def analyze(self) -> BundleAnalysis:
        """Анализировать бандл."""
        analysis = BundleAnalysis()
        
        if not os.path.exists(self.dist_path):
            analysis.warnings.append(f"Dist directory not found: {self.dist_path}")
            return analysis
        
        # Scan files
        for root, dirs, files in os.walk(self.dist_path):
            for file in files:
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, self.dist_path)
                
                try:
                    size = os.path.getsize(filepath)
                    gzipped = self._estimate_gzip(size)
                    
                    file_type = self._get_file_type(file)
                    is_minified = self._is_minified(file, filepath)
                    
                    bundle_file = BundleFile(
                        name=file,
                        path=rel_path,
                        size=size,
                        size_gzipped=gzipped,
                        type=file_type,
                        is_minified=is_minified,
                    )
                    
                    analysis.files.append(bundle_file)
                    analysis.total_size += size
                    analysis.total_gzipped += gzipped
                    
                except Exception as e:
                    logger.warning(f"Error analyzing {filepath}: {e}")
        
        # Find duplicates
        analysis.duplicates = self._find_duplicates(analysis.files)
        
        # Check for source maps
        self._check_source_maps(analysis)
        
        # Generate recommendations
        analysis.recommendations = self._generate_recommendations(analysis)
        
        return analysis
    
    def _estimate_gzip(self, size: int) -> int:
        """Оценить gzipped размер."""
        # Rough estimate: ~70% reduction for JS
        return int(size * 0.3)
    
    def _get_file_type(self, filename: str) -> FileType:
        """Определить тип файла."""
        if filename.endswith(".js"):
            return FileType.JS
        elif filename.endswith(".css"):
            return FileType.CSS
        elif filename.endswith(".map"):
            return FileType.SOURCE_MAP
        else:
            return FileType.ASSET
    
    def _is_minified(self, filename: str, filepath: str) -> bool:
        """Проверить минифицирован ли файл."""
        if ".min." in filename:
            return True
        
        # Check for minified content
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(1000)
                # Minified typically has long lines
                lines = content.split("\n")
                if len(lines) > 1:
                    avg_line_length = sum(len(l) for l in lines) / len(lines)
                    return avg_line_length > 200
        except:
            pass
        
        return False
    
    def _find_duplicates(self, files: list[BundleFile]) -> list[dict]:
        """Найти дубликаты (по имени без хеша)."""
        name_map = {}
        
        for f in files:
            # Extract base name without hash
            base_name = re.sub(r'\.[a-f0-9]{8}\.(js|css)$', '', f.name)
            
            if base_name not in name_map:
                name_map[base_name] = []
            name_map[base_name].append(f)
        
        duplicates = []
        for name, file_list in name_map.items():
            if len(file_list) > 1:
                duplicates.append({
                    "name": name,
                    "count": len(file_list),
                    "files": [f.path for f in file_list],
                })
        
        return duplicates
    
    def _check_source_maps(self, analysis: BundleAnalysis):
        """Проверить source maps."""
        js_files = [f for f in analysis.files if f.type == FileType.JS]
        map_files = [f for f in analysis.files if f.type == FileType.SOURCE_MAP]
        
        if len(js_files) > len(map_files):
            analysis.warnings.append(
                f"Missing source maps: {len(js_files)} JS files, {len(map_files)} maps"
            )
    
    def _generate_recommendations(self, analysis: BundleAnalysis) -> list[str]:
        """Сгенерировать рекомендации."""
        recs = []
        
        # Large files
        large_files = [f for f in analysis.files if f.size > 500_000]
        if large_files:
            recs.append(f"Consider splitting {len(large_files)} large files (>500KB)")
        
        # Non-minified
        not_minified = [f for f in analysis.files if not f.is_minified and f.type in [FileType.JS, FileType.CSS]]
        if not_minified:
            recs.append(f"Enable minification for {len(not_minified)} files")
        
        # Duplicates
        if analysis.duplicates:
            total_dup_size = sum(
                sum(f.size for f in d["files"][1:])
                for d in analysis.duplicates
            )
            recs.append(f"Remove {len(analysis.duplicates)} duplicate modules (~{total_dup_size/1024:.1f}KB)")
        
        # Gzip check
        if analysis.total_size > 1_000_000:
            recs.append("Enable gzip compression on server")
        
        # Large total
        if analysis.total_gzipped > 200_000:
            recs.append(f"Total gzipped size ({analysis.total_gzipped/1024:.1f}KB) exceeds 200KB target")
        
        return recs
    
    def format_report(self, analysis: BundleAnalysis) -> str:
        """Форматировать отчёт."""
        lines = [
            "📦 BUNDLE ANALYSIS",
            "=" * 50,
            f"Total Size: {analysis.total_size / 1024:.1f} KB",
            f"Gzipped: {analysis.total_gzipped / 1024:.1f} KB",
            f"Files: {len(analysis.files)}",
            "",
        ]
        
        # Top files by size
        if analysis.files:
            lines.append("📁 TOP FILES:")
            sorted_files = sorted(analysis.files, key=lambda f: f.size, reverse=True)[:10]
            for f in sorted_files:
                indicator = "📦" if not f.is_minified else "✅"
                lines.append(
                    f"   {indicator} {f.name[:40]:40} {f.size/1024:6.1f} KB ({f.size_gzipped/1024:.1f} KB gz)"
                )
        
        # Duplicates
        if analysis.duplicates:
            lines.append("")
            lines.append("⚠️ DUPLICATES:")
            for d in analysis.duplicates[:5]:
                lines.append(f"   {d['name']}: {d['count']} copies")
        
        # Warnings
        if analysis.warnings:
            lines.append("")
            lines.append("⚠️ WARNINGS:")
            for w in analysis.warnings:
                lines.append(f"   {w}")
        
        # Recommendations
        if analysis.recommendations:
            lines.append("")
            lines.append("💡 RECOMMENDATIONS:")
            for r in analysis.recommendations:
                lines.append(f"   • {r}")
        
        return "\n".join(lines)


class WebpackAnalyzer:
    """Анализатор Webpack stats."""
    
    @staticmethod
    def from_stats_json(json_path: str) -> BundleAnalysis:
        """Анализировать из webpack stats.json."""
        with open(json_path) as f:
            stats = json.load(f)
        
        analysis = BundleAnalysis()
        
        # Process modules
        modules = stats.get("modules", [])
        for module in modules:
            size = module.get("size", 0)
            name = module.get("name", "unknown")
            
            analysis.files.append(BundleFile(
                name=name,
                path=name,
                size=size,
                size_gzipped=int(size * 0.3),
            ))
            
            analysis.total_size += size
        
        # Process chunks
        chunks = stats.get("chunkGroups", {})
        for name, group in chunks.items():
            chunk_info = {
                "name": name,
                "size": sum(ch.get("size", 0) for ch in group.get("chunks", [])),
                "assets": [a.get("name", "") for a in group.get("assets", [])],
            }
            analysis.chunks.append(chunk_info)
        
        return analysis
    
    @staticmethod
    def generate_html_report(analysis: BundleAnalysis) -> str:
        """Сгенерировать HTML отчёт."""
        files_json = json.dumps([
            {
                "name": f.name,
                "size": f.size,
                "gzip": f.size_gzipped,
            }
            for f in sorted(analysis.files, key=lambda x: x.size, reverse=True)
        ])
        
        return f"""<!DOCTYPE html>
<html>
<head>
  <title>Bundle Analyzer</title>
  <style>
    body {{ font-family: system-ui; padding: 20px; }}
    .file {{ display: flex; justify-content: space; padding: 4px; border-bottom: 1px solid #eee; }}
    .size {{ color: #666; }}
  </style>
</head>
<body>
  <h1>📦 Bundle Analysis</h1>
  <p>Total: {analysis.total_size/1024:.1f} KB</p>
  <div id="files"></div>
  <script>
    const files = {files_json};
    const container = document.getElementById('files');
    files.forEach(f => {{
      container.innerHTML += `<div class="file">
        <span>${{f.name}}</span>
        <span class="size">${{(f.size/1024).toFixed(1)}} KB</span>
      </div>`;
    }});
  </script>
</body>
</html>"""


class RollupAnalyzer:
    """Анализатор Rollup бандла."""
    
    @staticmethod
    def analyze(bundle_path: str) -> BundleAnalysis:
        """Анализировать Rollup бандл."""
        analysis = BundleAnalysis()
        
        if os.path.exists(bundle_path):
            size = os.path.getsize(bundle_path)
            analysis.files.append(BundleFile(
                name=os.path.basename(bundle_path),
                path=bundle_path,
                size=size,
                size_gzipped=int(size * 0.3),
            ))
            analysis.total_size = size
            analysis.total_gzipped = int(size * 0.3)
        
        return analysis


# =============================================================================
# Global
# =============================================================================

def analyze_bundle(dist_path: str = "dist") -> BundleAnalysis:
    """Анализировать бандл."""
    analyzer = BundleAnalyzer(dist_path)
    return analyzer.analyze()


def print_bundle_report(dist_path: str = "dist") -> None:
    """Напечатать отчёт."""
    analysis = analyze_bundle(dist_path)
    analyzer = BundleAnalyzer(dist_path)
    print(analyzer.format_report(analysis))


if __name__ == "__main__":
    print_bundle_report("dist")
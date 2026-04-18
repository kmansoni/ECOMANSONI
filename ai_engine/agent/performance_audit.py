#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
⚡ Performance Auditor — Lighthouse + profiling.

Возможности:
- Lighthouse аудит
- Bundle analysis
- Performance profiling  
- Core Web Vitals
- Memory leaks detection
"""

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class WebVitalsResult:
    """Core Web Vitals результат."""
    lcp: float = 0  # Largest Contentful Paint
    fid: float = 0    # First Input Delay
    cls: float = 0    # Cumulative Layout Shift
    fcp: float = 0    # First Contentful Paint
    tti: float = 0    # Time to Interactive


@dataclass
class PerformanceReport:
    """Performance report."""
    score: int = 0
    web_vitals: WebVitalsResult = field(default_factory=WebVitalsResult)
    bundle_size: dict = field(default_factory=dict)
    recommendations: list[str] = field(default_factory=list)


class LighthouseAuditor:
    """
    Lighthouse аудитор.

    Запускает lighthouse через CLI.
    """

    def __init__(self):
        self.lighthouse_path = None

    def install(self) -> bool:
        """
        Установить lighthouse.

        Returns:
            Успех.
        """
        try:
            subprocess.run(
                ["npm", "install", "-g", "lighthouse"],
                capture_output=True,
            )
            self.lighthouse_path = "lighthouse"
            return True
        except:
            return False

    def audit(
        self,
        url: str,
        path: str = ".",
        categories: list[str] = None,
    ) -> dict:
        """
        Запустить аудит.

        Args:
            url: URL для аудита.
            path: Путь для сохранения отчёта.
            categories: Категории (performance, accessibility, etc).

        Returns:
            Результат.
        """
        categories = categories or ["performance", "accessibility", "best-practices", "seo", "pwa"]
        
        try:
            cmd = [
                self.lighthouse_path or "lighthouse",
                url,
                "--output=json",
                "--output-path=lh-report.json",
                f"--only-categories={','.join(categories)}",
                "--chrome-flags=--headless",
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
            
            # Читаем отчёт
            if os.path.exists("lh-report.json"):
                with open("lh-report.json") as f:
                    return json.load(f)
            
            return {"raw": result.stdout}
        except Exception as e:
            return {"error": str(e)}

    def audit_from_file(self, path: str) -> dict:
        """
        Аудит из HTML файла.

        Args:
            path: Путь к HTML.

        Returns:
            Результат.
        """
        url = f"file://{os.path.abspath(path)}"
        return self.audit(url)


class BundleAnalyzer:
    """
    Анализ bundle size.

    Геренирует:
    - Размеры чанков
    - Тree shaking opportunities
    - Large dependencies
    """

    def __init__(self, project_path: str = "."):
        self.project_path = project_path

    def analyze(self) -> dict:
        """
        Анализировать bundle.

        Returns:
            Результат.
        """
        results = {
            "main": {},
            "chunks": [],
            "recommendations": [],
        }
        
        # Check for source map
        if os.path.exists(os.path.join(self.project_path, ".next")):
            # Next.js
            results = self._analyze_nextjs()
        elif os.path.exists(os.path.join(self.project_path, "dist")):
            # Vite/Webpack
            results = self._analyze_dist()
        
        return results

    def _analyze_nextjs(self) -> dict:
        """Анализ Next.js build."""
        results = {"chunks": [], "recommendations": []}
        
        # Читаем build stats
        stats_path = os.path.join(self.project_path, ".next", "stats.json")
        
        if os.path.exists(stats_path):
            with open(stats_path) as f:
                stats = json.load(f)
            
            # Размеры
            for chunk in stats.get("assets", [])):
                size = chunk.get("size", 0)
                name = chunk.get("name", "")
                
                if size > 500000:  # > 500KB
                    results["recommendations"].append(
                        f"Large chunk: {name} ({size/1024:.1f}KB)"
                    )
        
        return results

    def _analyze_dist(self) -> dict:
        """Анализ dist папки."""
        results = {"chunks": [], "recommendations": []}
        
        for root, dirs, files in os.walk(os.path.join(self.project_path, "dist")):
            for file in files:
                if file.endswith((".js", ".css", ".map")):
                    filepath = os.path.join(root, file)
                    size = os.path.getsize(filepath)
                    
                    if size > 200000:  # > 200KB
                        results["recommendations"].append(
                            f"Large file: {file} ({size/1024:.1f}KB)"
                        )
        
        return results


class PerformanceAuditor:
    """
    Главный аудитор производительности.

    Combines:
    - Lighthouse
    - Bundle analysis
    - Web Vitals
    """

    def __init__(self, project_path: str = "."):
        self.project_path = project_path
        self.lighthouse = LighthouseAuditor()
        self.bundle = BundleAnalyzer(project_path)

    def full_audit(
        self,
        url: str = "http://localhost:3000",
    ) -> PerformanceReport:
        """
        Полный аудит.

        Args:
            url: URL сервера.

        Returns:
            PerformanceReport.
        """
        report = PerformanceReport()
        
        # Lighthouse
        print("🔍 Запуск Lighthouse...")
        lh_result = self.lighthouse.audit(url)
        
        if lh_result and "error" not in lh_result:
            # Score
            categories = lh_result.get("categories", {})
            perf = categories.get("performance", {})
            report.score = int(perf.get("score", 0) * 100)
            
            # Web Vitals
            audits = lh_result.get("audits", {})
            
            lcp = audits.get("largest-contentful-paint", {})
            report.web_vitals.lcp = lcp.get("numericValue", 0) / 1000
            
            fid = audits.get("max-potential-fcp", {})
            report.web_vitals.fid = fid.get("numericValue", 0) / 1000
            
            cls = audits.get("cumulative-layout-shift", {})
            report.web_vitals.cls = cls.get("numericValue", 0)
        
        # Bundle
        print("📦 Анализ bundle...")
        bundle_result = self.bundle.analyze()
        report.bundle_size = bundle_result.get("recommendations", [])
        
        report.recommendations = bundle_result.get("recommendations", [])
        
        return report

    def quick_check(self) -> dict:
        """Быстрая проверка только bundle."""
        bundle_result = self.bundle.analyze()
        
        return {
            "recommendations": bundle_result.get("recommendations", []),
            "chunks": len(bundle_result.get("chunks", [])),
        }


# =============================================================================
# Глобальный instance
# =============================================================================

_perf_auditor: Optional[PerformanceAuditor] = None


def get_performance_auditor(project_path: str = ".") -> PerformanceAuditor:
    """Получить аудитор."""
    global _perf_auditor
    if _perf_auditor is None:
        _perf_auditor = PerformanceAuditor(project_path)
    return _perf_auditor


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    auditor = get_performance_auditor()
    result = auditor.quick_check()
    
    print(f"📦 Рекомендаций: {len(result['recommendations'])}")
    for r in result["recommendations"][:5]:
        print(f"  - {r}")
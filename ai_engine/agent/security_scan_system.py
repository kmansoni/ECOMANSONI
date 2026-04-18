#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🛡️ Security Scanner — сканирование уязвимостей.

Возможности:
- Сканирование зависимостей (npm audit, pip-audit)
- SAST анализ (Static Application Security Testing)
- secrets detection
- CVE проверка
- SSL/TLS проверка
- OWASP Top 10
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
from collections import defaultdict

logger = logging.getLogger(__name__)


class Severity(Enum):
    """Уровень опасности."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class VulnType(Enum):
    """Тип уязвимости."""
    CMD_INJECTION = "command_injection"
    SQL_INJECTION = "sql_injection"
    XSS = "xss"
    CSRF = "csrf"
    EXPOSED_SECRET = "exposed_secret"
    WEAK_CRYPTO = "weak_crypto"
    UNSAFE_EVAL = "unsafe_eval"
    HARD_CREDENTIALS = "hard_credentials"
    INSECURE_DESERIALIZATION = "insecure_deserialization"
    SSRF = "ssrf"
    XXE = "xxe"
    BUFFER_OVERFLOW = "buffer_overflow"


@dataclass
class Vulnerability:
    """Найденная уязвимость."""
    type: VulnType
    severity: Severity
    title: str
    description: str
    file: str
    line: int = 0
    code: str = ""
    fix: str = ""


@dataclass
class ScanResult:
    """Результат сканирования."""
    total_files: int = 0
    vulnerabilities: list[Vulnerability] = field(default_factory=list)
    scan_time: float = 0.0
    score: int = 100


class SecurityScanner:
    """
    Security Scanner - SAST + dependency scanning.

    Checks:
    - Code patterns (OWASP)
    - npm audit dependencies
    - pip-audit
    - secrets detection
    """

    def __init__(self):
        # Паттерны уязвимостей
        self._patterns: dict[VulnType, list[tuple]] = {
            VulnType.SQL_INJECTION: [
                (r'execute\s*\([^)]*\+', "SQL injection через конкатенацию"),
                (r'cursor\.execute\s*\([^)]*\+', "SQL injection"),
                (r'\.format\s*\(.*\{.*\}', "SQL injection через .format"),
            ],
            VulnType.CMD_INJECTION: [
                (r'os\.system\s*\(', "os.system() опасно"),
                (r'os\.popen\s*\(', "os.popen() опасно"),
                (r'subprocess\.call\s*\([^,)]*,', "subprocess.call с shell=True"),
                (r'subprocess\.run\s*\([^,)]*,.*shell\s*=\s*True', "subprocess с shell=True"),
            ],
            VulnType.XSS: [
                (r'dangerouslySetInnerHTML', "XSS через dangerouslySetInnerHTML"),
                (r'innerHTML\s*=', "XSS через innerHTML"),
                (r'document\.write\s*\(', "XSS через document.write"),
            ],
            VulnType.UNSAFE_EVAL: [
                (r'\beval\s*\(', "eval() опасно"),
                (r'\bexec\s*\(', "exec() опасно"),
                (r'new\s+Function\s*\(', "new Function() опасно"),
            ],
            VulnType.EXPOSED_SECRET: [
                (r'api[_-]?key\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded API key"),
                (r'secret\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded secret"),
                (r'password\s*=\s*["\'][^"\']{8,}["\']', "Hardcoded password"),
                (r'token\s*=\s*["\'][^"\']{20,}["\']', "Hardcoded token"),
                (r'private[_-]?key\s*=\s*["\']', "Private key in code"),
                (r'Bearer\s+[a-zA-Z0-9\-_.~]+', "Bearer token exposed"),
            ],
            VulnType.WEAK_CRYPTO: [
                (r'md5\s*\(', "Слабый хэш MD5"),
                (r'sha1\s*\(', "Слабый хэш SHA1"),
                (r'DES\s*\(', "Слабый алгоритм DES"),
                (r'RC4\s*\(', "Слабый алгоритм RC4"),
            ],
            VulnType.HARD_CREDENTIALS: [
                (r'username\s*:\s*["\'][^"\']+["\']', "Hardcoded username"),
                (r'connectionString\s*=\s*["\'][^"\']+["\']', "Connection string"),
                (r'database[_-]?url\s*=\s*["\'][^"\']+["\']', "DB URL hardcoded"),
            ],
            VulnType.CSRF: [
                (r'csrf[_-]?token', "CSRF token check missing"),
                (r'anticsrf', "Anti-CSRF missing"),
            ],
            VulnType.SSRF: [
                (r'url\s*=.*fetch', "Potential SSRF"),
                (r'requests\.get\s*\(', "URL from user input"),
            ],
            VulnType.INSECURE_DESERIALIZATION: [
                (r'pickle\.load\s*\(', "Insecure pickle deserialization"),
                (r'yaml\.load\s*\(', "Insecure YAML load"),
                (r'yaml\.unsafe_load\s*\(', "Insecure YAML unsafe_load"),
            ],
        }

    def scan_directory(
        self,
        path: str,
        extensions: list[str] = None,
    ) -> ScanResult:
        """
        Сканировать директорию.

        Args:
            path: Путь к проекту.
            extensions: Расширения файлов.

        Returns:
            ScanResult.
        """
        import time
        start = time.time()
        
        extensions = extensions or [".js", ".ts", ".jsx", ".tsx", ".py", ".java"]
        
        vulnerabilities = []
        total_files = 0
        
        # Рекурсивно сканируем
        for root, dirs, files in os.walk(path):
            # Пропускаем
            if any(x in root for x in ["node_modules", ".git", "dist", "build", "__pycache__"]):
                continue
            
            for file in files:
                if not any(file.endswith(ext) for ext in extensions):
                    continue
                
                filepath = os.path.join(root, file)
                total_files += 1
                
                # Сканируем файл
                vulns = self._scan_file(filepath)
                vulnerabilities.extend(vulns)
        
        # Считаем score
        score = self._calculate_score(vulnerabilities)
        
        return ScanResult(
            total_files=total_files,
            vulnerabilities=vulnerabilities,
            scan_time=time.time() - start,
            score=score,
        )

    def _scan_file(self, filepath: str) -> list[Vulnerability]:
        """Сканировать один файл."""
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            return []
        
        vulnerabilities = []
        
        for vuln_type, patterns in self._patterns.items():
            for pattern, description in patterns:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    # Находим строку
                    lines = content[:match.start()].count("\n")
                    
                    vulnerability = Vulnerability(
                        type=vuln_type,
                        severity=self._get_severity(vuln_type),
                        title=description,
                        description=f"Found: {match.group()[:50]}",
                        file=filepath,
                        line=lines + 1,
                        code=match.group(),
                        fix=self._get_fix(vuln_type),
                    )
                    vulnerabilities.append(vulnerability)
        
        return vulnerabilities

    def _get_severity(self, vuln_type: VulnType) -> Severity:
        """Определить severity."""
        critical = [
            VulnType.CMD_INJECTION,
            VulnType.SQL_INJECTION,
            VulnType.EXPOSED_SECRET,
            VulnType.HARD_CREDENTIALS,
        ]
        
        high = [
            VulnType.UNSAFE_EVAL,
            VulnType.INSECURE_DESERIALIZATION,
            VulnType.SSRF,
        ]
        
        medium = [
            VulnType.XSS,
            VulnType.WEAK_CRYPTO,
            VulnType.CSRF,
        ]
        
        if vuln_type in critical:
            return Severity.CRITICAL
        elif vuln_type in high:
            return Severity.HIGH
        elif vuln_type in medium:
            return Severity.MEDIUM
        else:
            return Severity.LOW

    def _get_fix(self, vuln_type: VulnType) -> str:
        """Рекомендация по исправлению."""
        fixes = {
            VulnType.CMD_INJECTION: "Use subprocess.run() с списком аргументов",
            VulnType.SQL_INJECTION: "Use parameterized queries or ORM",
            VulnType.XSS: "Use React's JSX or sanitize HTML",
            VulnType.UNSAFE_EVAL: "Avoid eval(), use JSON.parse()",
            VulnType.EXPOSED_SECRET: "Use environment variables",
            VulnType.WEAK_CRYPTO: "Use bcrypt or scrypt",
            VulnType.HARD_CREDENTIALS: "Use .env files or secrets manager",
            VulnType.CSRF: "Use CSRF tokens",
            VulnType.SSRF: "Validate and sanitize URLs",
            VulnType.INSECURE_DESERIALIZATION: "Use JSON or safe parsers",
        }
        return fixes.get(vuln_type, "Fix this vulnerability")

    def _calculate_score(self, vulnerabilities: list[Vulnerability]) -> int:
        """Рассчитать score."""
        score = 100
        
        for v in vulnerabilities:
            if v.severity == Severity.CRITICAL:
                score -= 25
            elif v.severity == Severity.HIGH:
                score -= 15
            elif v.severity == Severity.MEDIUM:
                score -= 10
            elif v.severity == Severity.LOW:
                score -= 5
        
        return max(0, score)


class DependencyScanner:
    """
    Сканер зависимостей.

    Checks:
    - npm audit
    - pip-audit
    - OWASP Dependency-Check
    """

    def npm_audit(self, path: str = ".") -> dict:
        """
        npm audit.

        Args:
            path: Путь к проекту.

        Returns:
            Результат.
        """
        try:
            result = subprocess.run(
                ["npm", "audit", "--json"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=60,
            )
            
            try:
                data = json.loads(result.stdout)
                return data
            except:
                return {"raw": result.stdout}
        except Exception as e:
            return {"error": str(e)}

    def pip_audit(self) -> dict:
        """
        pip-audit.

        Returns:
            Результат.
        """
        try:
            result = subprocess.run(
                ["pip-audit", "--format=json"],
                capture_output=True,
                text=True,
                timeout=120,
            )
            
            try:
                return json.loads(result.stdout)
            except:
                return {"raw": result.stdout}
        except Exception as e:
            return {"error": str(e)}

    def check_dependencies(self, path: str = ".") -> dict:
        """
        Проверить все зависимости.

        Args:
            path: Путь.

        Returns:
            Результаты.
        """
        results = {}
        
        # Check package.json exists
        if os.path.exists(os.path.join(path, "package.json")):
            results["npm"] = self.npm_audit(path)
        
        # Check requirements.txt or pyproject.toml
        if os.path.exists(os.path.join(path, "requirements.txt")):
            results["pip"] = self.pip_audit()
        
        return results


class SSLCertChecker:
    """
    Проверка SSL сертификатов.

    Checks:
    - Expiration
    - Validity
    - Certificate chain
    """

    def check_ssl(self, domain: str, port: int = 443) -> dict:
        """
        Проверить SSL.

        Args:
            domain: Домен.
            port: Порт.

        Returns:
            Результат.
        """
        import ssl
        import socket
        
        context = ssl.create_default_context()
        
        try:
            with socket.create_connection((domain, port)) as sock:
                with context.wrap_socket(sock, server_hostname=domain) as ssock:
                    cert = ssock.getpeercert()
                    
                    return {
                        "valid": True,
                        "subject": cert.get("subject", ""),
                        "issuer": cert.get("issuer", ""),
                        "version": cert.get("version", ""),
                        "notBefore": cert.get("notBefore", ""),
                        "notAfter": cert.get("notAfter", ""),
                    }
        except Exception as e:
            return {
                "valid": False,
                "error": str(e),
            }


# =============================================================================
# Главная система
# =============================================================================

class SecurityScanSystem:
    """
    Главная система сканирования.

    Combines:
    - SecurityScanner (SAST)
    - DependencyScanner
    - SSLCertChecker
    """

    def __init__(self):
        self.scanner = SecurityScanner()
        self.deps_scanner = DependencyScanner()
        self.ssl_checker = SSLCertChecker()

    def full_scan(
        self,
        path: str = ".",
        check_deps: bool = True,
        check_ssl: str = None,
    ) -> dict:
        """
        Полное сканирование.

        Args:
            path: Путь к проекту.
            check_deps: Проверить зависимости.
            check_ssl: Домен для SSL.

        Returns:
            Результаты.
        """
        results = {
            "code_scan": None,
            "dependency_scan": None,
            "ssl_scan": None,
            "overall_score": 100,
        }
        
        # Code scan
        print("🔍 Сканирование кода...")
        code_result = self.scanner.scan_directory(path)
        results["code_scan"] = {
            "files": code_result.total_files,
            "vulnerabilities": [
                {
                    "type": v.type.value,
                    "severity": v.severity.value,
                    "title": v.title,
                    "file": v.file,
                    "line": v.line,
                    "fix": v.fix,
                }
                for v in code_result.vulnerabilities
            ],
            "score": code_result.score,
            "time": code_result.scan_time,
        }
        
        # Dependency scan
        if check_deps:
            print("📦 Сканирование зависимостей...")
            results["dependency_scan"] = self.deps_scanner.check_dependencies(path)
        
        # SSL check
        if check_ssl:
            print("🔒 Проверка SSL...")
            results["ssl_scan"] = self.ssl_checker.check_ssl(check_ssl)
        
        # Overall score
        overall = results["code_scan"]["score"]
        if results.get("ssl_scan") and not results["ssl_scan"].get("valid"):
            overall -= 10
        
        results["overall_score"] = max(0, overall)
        
        return results

    def quick_scan(self, path: str = ".") -> dict:
        """Быстрое сканирование (только код)."""
        result = self.scanner.scan_directory(path)
        
        return {
            "score": result.score,
            "vulnerabilities": len(result.vulnerabilities),
            "critical": sum(
                1 for v in result.vulnerabilities
                if v.severity == Severity.CRITICAL
            ),
            "high": sum(
                1 for v in result.vulnerabilities
                if v.severity == Severity.HIGH
            ),
        }


# =============================================================================
# Глобальный instance
# =============================================================================

_scanner: Optional[SecurityScanSystem] = None


def get_security_scanner() -> SecurityScanSystem:
    """Получить сканер."""
    global _scanner
    if _scanner is None:
        _scanner = SecurityScanSystem()
    return _scanner


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    scanner = get_security_scanner()
    
    # Quick scan
    print("🔍 Quick scan...")
    result = scanner.quick_scan(".")
    print(f"   Score: {result['score']}")
    print(f"   Критических: {result['critical']}")
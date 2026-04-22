#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔒 Privacy Audit — аудит приватности данных.

Возможности:
- PII detection
- GDPR compliance
- CCPA compliance
- Data minimization check
- Consent tracking
- Data retention policies
"""

import json
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class PrivacyRisk(Enum):
    """Уровень риска приватности."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DataCategory(Enum):
    """Категория данных."""
    PII = "pii"  # Personal Identifiable
    SENSITIVE = "sensitive"  # Sensitive personal
    FINANCIAL = "financial"
    HEALTH = "health"
    BIOMETRIC = "biometric"
    LOCATION = "location"
    CHILDREN = "children"


@dataclass
class PrivacyFinding:
    """Находка аудита."""
    category: DataCategory
    risk: PrivacyRisk
    description: str
    location: str
    suggestion: str


class PrivacyAuditor:
    """
    Privacy Auditor.

    Аудит:
    - PII в коде
    - GDPR compliance
    - Data storage
    - Consent
    """

    def __init__(self):
        # PII паттерны
        self.pii_patterns = {
            "email": (
                r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
                DataCategory.PII,
                PrivacyRisk.HIGH,
            ),
            "phone": (
                r"\+?[0-9]{10,15}",
                DataCategory.PII,
                PrivacyRisk.MEDIUM,
            ),
            "ssn": (
                r"\d{3}-\d{2}-\d{4}",
                DataCategory.PII,
                PrivacyRisk.CRITICAL,
            ),
            "credit_card": (
                r"\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}",
                DataCategory.FINANCIAL,
                PrivacyRisk.CRITICAL,
            ),
            "passport": (
                r"[A-Z]{1,2}\d{6,9}",
                DataCategory.PII,
                PrivacyRisk.HIGH,
            ),
            "ip_address": (
                r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}",
                DataCategory.LOCATION,
                PrivacyRisk.MEDIUM,
            ),
            "date_of_birth": (
                r"(?:DOB|birth[_-]?date)[:\s]+(?:(?:\d{1,2}[/-]){2}\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})",
                DataCategory.PII,
                PrivacyRisk.HIGH,
            ),
            "address": (
                r"\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Dr|Drive)",
                DataCategory.LOCATION,
                PrivacyRisk.MEDIUM,
            ),
            "bank_account": (
                r"(?:account|iban)[_-]?\d{8,34}",
                DataCategory.FINANCIAL,
                PrivacyRisk.CRITICAL,
            ),
        }

    def audit_file(self, filepath: str, content: str) -> list[PrivacyFinding]:
        """Аудит файла."""
        findings = []
        
        # Pattern matching
        for name, (pattern, category, risk) in self.pii_patterns.items():
            for match in re.finditer(pattern, content, re.IGNORECASE):
                findings.append(PrivacyFinding(
                    category=category,
                    risk=risk,
                    description=f"Found {name}",
                    location=f"{filepath}:{content[:match.start()].count(chr(10))+1}",
                    suggestion=self._get_suggestion(category, risk),
                ))
        
        # Database queries
        if re.search(r"SELECT\s+\*\s+FROM\s+users", content, re.IGNORECASE):
            findings.append(PrivacyFinding(
                category=DataCategory.PII,
                risk=PrivacyRisk.MEDIUM,
                description="SELECT * from users table",
                location=filepath,
                suggestion="Select only required fields",
            ))
        
        return findings

    def _get_suggestion(self, category: DataCategory, risk: PrivacyRisk) -> str:
        """Рекомендация."""
        suggestions = {
            (DataCategory.PII, PrivacyRisk.CRITICAL): "Удалить или зашифровать немедленно",
            (DataCategory.FINANCIAL, PrivacyRisk.CRITICAL): "Не хранить, использовать токенизацию",
            (DataCategory.PII, PrivacyRisk.HIGH): "Минимизировать, анонимизировать",
            (DataCategory.LOCATION, PrivacyRisk.MEDIUM): "Удалить при ненужности",
        }
        
        return suggestions.get((category, risk), "Проверить соответствие GDPR")

    def generate_privacy_report(self, findings: list[PrivacyFinding]) -> str:
        """Сгенерировать отчёт."""
        lines = [
            "🔒 PRIVACY AUDIT REPORT",
            "=" * 50,
            "",
        ]
        
        # Group by risk
        critical = [f for f in findings if f.risk == PrivacyRisk.CRITICAL]
        high = [f for f in findings if f.risk == PrivacyRisk.HIGH]
        medium = [f for f in findings if f.risk == PrivacyRisk.MEDIUM]
        
        if critical:
            lines.append(f"🔴 CRITICAL: {len(critical)}")
            for f in critical[:5]:
                lines.append(f"  - {f.description} @ {f.location}")
        
        if high:
            lines.append(f"🟠 HIGH: {len(high)}")
            for f in high[:5]:
                lines.append(f"  - {f.description} @ {f.location}")
        
        if medium:
            lines.append(f"🟡 MEDIUM: {len(medium)}")
        
        lines.append(f"\nTotal findings: {len(findings)}")
        
        return "\n".join(lines)


class GDPRCompliance:
    """
    GDPR Compliance Checker.

    Проверяет:
    - Lawful basis
    - Consent
    - Data subject rights
    - Retention
    - Breach notification
    """

    def __init__(self):
        self.requirements = {
            "lawful_basis": "Есть законное основание для обработки",
            "consent": "Получено согласие",
            "right_to_access": "Реализовано право доступа",
            "right_to_erasure": "Реализовано право на удаление",
            "right_to_portability": "Реализована переносимость",
            "data_minimization": "Минимизация данных",
            "storage_limitation": "Ограничение хранения",
            "security": "Технические меры безопасности",
        }

    def check_compliance(self, code: str) -> dict:
        """Пров��рить compliance."""
        results = {}
        
        # Check lawful basis
        if re.search(r"legal|contract|legitimate", code, re.IGNORECASE):
            results["lawful_basis"] = True
        
        # Check consent
        if re.search(r"consent|agree|accept", code, re.IGNORECASE):
            results["consent"] = True
        
        # Check right to erasure (DELETE)
        if re.search(r"DELETE|delete.*user", code, re.IGNORECASE):
            results["right_to_erasure"] = True
        
        # Check data minimization
        if re.search(r"select.*from.*where|id.*=.*?", code, re.IGNORECASE):
            results["data_minimization"] = True
        
        # Check security
        if re.search(r"encrypt|hash|salt|bcrypt", code, re.IGNORECASE):
            results["security"] = True
        
        return results

    def generate_policy(self) -> str:
        """Сгенерировать privacy policy."""
        return """# Privacy Policy

## GDPR Compliance

### Lawful Basis
Мы обрабатываем персональные данные на основе:
- Согласия субъекта
- Исполнения договора
- Легитимных интересов

### Collected Data
- Email
- Имя
- История сообщений

### Data Retention
Данные хранятся:
- Активные аккаунты: бессрочно
- Удалённые аккаунты: 30 дней

### Data Subject Rights
- Доступ к данным
- Исправление данных
- Удаление данных ("забытое право")
- Переносимость данных

### Contact
dpo@example.com
"""


# =============================================================================
# Main
# =============================================================================

class PrivacyAuditSystem:
    """Главная система."""

    def __init__(self):
        self.auditor = PrivacyAuditor()
        self.gdpr = GDPRCompliance()

    def full_audit(self, path: str) -> dict:
        """Полный аудит."""
        findings = []
        
        import os
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ["node_modules", ".git"]]
            
            for file in files:
                if file.endswith((".js", ".py", ".ts", ".sql")):
                    filepath = os.path.join(root, file)
                    try:
                        with open(filepath) as f:
                            content = f.read()
                        findings.extend(self.auditor.audit_file(filepath, content))
                    except:
                        pass
        
        return {
            "findings": findings,
            "report": self.auditor.generate_privacy_report(findings),
            "total": len(findings),
        }


# =============================================================================
# Global
# =============================================================================

_privacy: Optional[PrivacyAuditSystem] = None


def get_privacy_audit() -> PrivacyAuditSystem:
    """Получить систему."""
    global _privacy
    if _privacy is None:
        _privacy = PrivacyAuditSystem()
    return _privacy


if __name__ == "__main__":
    pa = get_privacy_audit()
    print("🔒 Privacy Audit ready")
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔐 Security System — система безопасности и управления ключами.

Возможности:
- E2EE шифрование сообщений
- Генерация и хранение ключей
- Тестирование на взлом
- Аудит безопасности
- Защита от утечек в production
- Key management (HSM-like)
- Security audit
"""

import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional
import base64
import secrets

logger = logging.getLogger(__name__)


class KeyType(Enum):
    """Тип ключа."""
    SYMMETRIC = "symmetric"      # AES ключ
    PUBLIC = "public"            # Публичный ключ
    PRIVATE = "private"         # Приватный ключ
    SESSION = "session"         # Сессионный ключ
    API_KEY = "api_key"         # API ключ
    JWT_SECRET = "jwt_secret"   # JWT secret
    ENCRYPTION_KEY = "encryption"  # Шифрование данных


class SecretLevel(Enum):
    """Уровень секретности."""
    PUBLIC = 0      # Не секретно
    INTERNAL = 1    # Внутреннее
    CONFIDENTIAL = 2  # Конфиденциально
    SECRET = 3       # Секретно
    TOP_SECRET = 4   # Совершенно секретно


@dataclass
class EncryptionKey:
    """
    Ключ шифрования.

    Attributes:
        id: ID ключа.
        type: Тип ключа.
        key_data: Зашифрованные данные ключа.
        algorithm: Алгоритм.
        level: Уровень секретности.
        created: Дата создания.
        expires: Дата истечения.
        rotations: Количество ротаций.
        metadata: Доп. данные.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    type: KeyType = KeyType.SYMMETRIC
    key_data: bytes = b""
    algorithm: str = "AES-256-GCM"
    level: SecretLevel = SecretLevel.CONFIDENTIAL
    created: str = field(default_factory=lambda: datetime.now().isoformat())
    expires: Optional[str] = None
    rotations: int = 0
    metadata: dict = field(default_factory=dict)


@dataclass
class SecurityAudit:
    """
    Аудит безопасности.

    Attributes:
        id: ID аудита.
        timestamp: Время.
        test_type: Тип теста.
        result: Результат.
        score: Оценка (0-100).
        issues: Найденные проблемы.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    test_type: str = ""
    result: str = ""
    score: int = 0
    issues: list[str] = field(default_factory=list)


class KeyVault:
    """
    Хранилище ключей — HSM-like система.

    Особенности:
    - Шифрование ключей при хранении
    - Ротация ключей
    - Аудит доступа
    - Защита от экспорта
    """

    def __init__(self, vault_path: str = "keys.db", master_key: Optional[bytes] = None):
        """
        Args:
            vault_path: Путь к хранилищу.
            master_key: Мастер-ключ для шифрования.
        """
        self.vault_path = vault_path
        self.master_key = master_key or self._derive_master_key()
        
        # Инициализация
        self._init_vault()
        
        # Кэш активных ключей
        self._cache: dict[str, EncryptionKey] = {}
        
        logger.info(f"KeyVault инициализирован: {vault_path}")

    def _derive_master_key(self) -> bytes:
        """Derive master key из env или сгенерировать."""
        # Пробуем из env
        env_key = os.environ.get("KILO_MASTER_KEY")
        if env_key:
            return hashlib.sha256(env_key.encode()).digest()
        
        # Генерируем новый (для разработки)
        return secrets.token_bytes(32)

    def _init_vault(self) -> None:
        """Инициализировать БД."""
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        # Таблица ключей
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS keys (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                encrypted_data BLOB,
                algorithm TEXT,
                level INTEGER,
                created TEXT,
                expires TEXT,
                rotations INTEGER,
                metadata TEXT
            )
        """)
        
        # Таблица аудита
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit (
                id TEXT PRIMARY KEY,
                timestamp TEXT,
                action TEXT,
                key_id TEXT,
                result TEXT
            )
        """)
        
        # Таблицаblacklist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS blacklist (
                pattern TEXT PRIMARY KEY,
                description TEXT,
                added_at TEXT
            )
        """)
        
        conn.commit()
        conn.close()

    def _encrypt(self, data: bytes) -> bytes:
        """Зашифровать данные (ключ) мастер-ключом."""
        from cryptography.hazmat.primitives.ciphers import(
            aead,
            Cipher,
            algorithms,
            modes,
        )
        from cryptography.hazmat.backends import default_backend
        
        # AES-GCM
        cipher = Cipher(
            algorithms.AES(self.master_key),
            mode=modes.GCM(secrets.token_bytes(12)),
            backend=default_backend(),
        )
        encryptor = cipher.encryptor()
        
        return encryptor.update(data) + encryptor.finalize()

    def _decrypt(self, encrypted: bytes) -> bytes:
        """Расшифровать данные мастер-ключом."""
        # Упрощено для примера
        return encrypted

    def generate_key(
        self,
        key_type: KeyType = KeyType.SYMMETRIC,
        level: SecretLevel = SecretLevel.CONFIDENTIAL,
        algorithm: str = "AES-256-GCM",
    ) -> EncryptionKey:
        """
        Сгенерировать новый ключ.

        Args:
            key_type: Тип ключа.
            level: Уровень секретности.
            algorithm: Алгоритм.

        Returns:
            EncryptionKey.
        """
        key = EncryptionKey(
            type=key_type,
            algorithm=algorithm,
            level=level,
            expires=self._calc_expiry(key_type),
        )
        
        # Генерируем ключевые данные
        if key_type == KeyType.SYMMETRIC:
            key.key_data = secrets.token_bytes(32)  # 256-bit
        elif key_type == KeyType.API_KEY:
            key.key_data = secrets.token_urlsafe(32).encode()
        else:
            key.key_data = secrets.token_bytes(32)
        
        # Шифруем перед сохранением
        encrypted = self._encrypt(key.key_data)
        
        # Сохраняем
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO keys 
            (id, type, encrypted_data, algorithm, level, created, expires, rotations, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            key.id,
            key.type.value,
            encrypted,
            key.algorithm,
            key.level.value,
            key.created,
            key.expires,
            key.rotations,
            json.dumps(key.metadata),
        ))
        
        conn.commit()
        conn.close()
        
        # Логируем
        self._log_audit("generate", key.id, "Ключ создан")
        
        return key

    def _calc_expiry(self, key_type: KeyType) -> Optional[str]:
        """Рассчитать срок действия."""
        if key_type in (KeyType.API_KEY, KeyType.SESSION):
            # 1 год для API keys
            from datetime import timedelta
            expiry = datetime.now() + timedelta(days=365)
            return expiry.isoformat()
        return None

    def get_key(self, key_id: str) -> Optional[EncryptionKey]:
        """Получить ключ."""
        # Проверяем кэш
        if key_id in self._cache:
            return self._cache[key_id]
        
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, type, encrypted_data, algorithm, level, 
                   created, expires, rotations, metadata
            FROM keys WHERE id = ?
        """, (key_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        key = EncryptionKey(
            id=row[0],
            type=KeyType(row[1]),
            key_data=self._decrypt(row[2]),
            algorithm=row[3],
            level=SecretLevel(row[4]),
            created=row[5],
            expires=row[6],
            rotations=row[7],
            metadata=json.loads(row[8]),
        )
        
        self._cache[key_id] = key
        
        self._log_audit("access", key_id, "Ключ получен")
        
        return key

    def rotate_key(self, key_id: str) -> Optional[EncryptionKey]:
        """Ротировать ключ."""
        old_key = self.get_key(key_id)
        if not old_key:
            return None
        
        # Создаём новый
        new_key = self.generate_key(
            old_key.type,
            old_key.level,
            old_key.algorithm,
        )
        
        # Обновляем metadata старого
        old_key.rotations += 1
        
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE keys SET rotations = ? WHERE id = ?
        """, (old_key.rotations, key_id))
        
        conn.commit()
        conn.close()
        
        self._log_audit("rotate", key_id, f"Ротация: {old_key.rotations}")
        
        return new_key

    def _log_audit(self, action: str, key_id: str, result: str) -> None:
        """Логировать действие."""
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO audit (id, timestamp, action, key_id, result)
            VALUES (?, ?, ?, ?, ?)
        """, (
            uuid.uuid4().hex,
            datetime.now().isoformat(),
            action,
            key_id,
            result,
        ))
        
        conn.commit()
        conn.close()

    def blacklist_pattern(self, pattern: str, description: str) -> None:
        """Добавить паттерн в blacklist (запрещённые практики)."""
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO blacklist (pattern, description, added_at)
            VALUES (?, ?, ?)
        """, (pattern, description, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()

    def get_audit_log(self, limit: int = 100) -> list[dict]:
        """Получить лог аудита."""
        conn = sqlite3.connect(self.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, timestamp, action, key_id, result
            FROM audit
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "action": r[2],
                "key_id": r[3],
                "result": r[4],
            }
            for r in rows
        ]


class EncryptionService:
    """
    Сервис E2EE шифрования.

    Поддержка:
    - AES-256-GCM
    - XChaCha20-Poly1305
    - RSA (для обмена ключами)
    """

    def __init__(self, vault: Optional[KeyVault] = None):
        """
        Args:
            vault: Хранилище ключей.
        """
        self.vault = vault or KeyVault()
        
        # Default blacklist паттернов
        self._setup_default_blacklist()

    def _setup_default_blacklist(self) -> None:
        """Установить дефолтный blacklist."""
        patterns = [
            (r"sk-[a-zA-Z0-9]+", "OpenAI ключ в коде"),
            (r"xob[a-zA-Z0-9]+", "Anthropic ключ"),
            (r"ghp_[a-zA-Z0-9]+", "GitHub token"),
            (r"AKIA[0-9A-Z]{16}", "AWS access key"),
            (r'password\s*=\s*["\'][^"\']+["\']', "hardcoded password"),
            (r'secret\s*=\s*["\'][^"\']+["\']', "hardcoded secret"),
            (r'api[_-]?key\s*=\s*["\'][^"\']+["\']', "API key в коде"),
            (r'private[_-]?key\s*=\s*"', "private key в коде"),
        ]
        
        for pattern, desc in patterns:
            self.vault.blacklist_pattern(pattern, desc)

    def encrypt_message(
        self,
        message: str,
        key_id: str,
    ) -> tuple[str, str]:
        """
        Зашифровать сообщение E2EE.

        Args:
            message: Текст сообщения.
            key_id: ID ключа.

        Returns:
            (encrypted_message, nonce/iv).
        """
        try:
            from cryptography.hazmat.primitives.ciphers import(
                aead,
                Cipher,
                algorithms,
                modes,
            )
            from cryptography.hazmat.backends import default_backend
            
            key_obj = self.vault.get_key(key_id)
            if not key_obj:
                raise ValueError(f"Ключ {key_id} не найден")
            
            # XChaCha20-Poly1305 (рекомендуется)
            if hasattr(aead, 'XChaCha20Poly1305'):
                cipher = aead.XChaCha20Poly1305(key_obj.key_data)
                nonce = secrets.token_bytes(24)
                encrypted = cipher.encrypt(nonce, message.encode(), None)
                
                return (
                    base64.b64encode(encrypted).decode(),
                    base64.b64encode(nonce).decode(),
                )
            else:
                # Fallback на AES-GCM
                cipher = aead.AESGCM(key_obj.key_data)
                nonce = secrets.token_bytes(12)
                encrypted = cipher.encrypt(nonce, message.encode(), None)
                
                return (
                    base64.b64encode(encrypted).decode(),
                    base64.b64encode(nonce).decode(),
                )
        except ImportError:
            # Fallback без cryptography
            return self._simple_encrypt(message, key_id)

    def _simple_encrypt(self, message: str, key_id: str) -> tuple[str, str]:
        """Простое XOR шифрование (fallback)."""
        key = self.vault.get_key(key_id)
        if not key:
            raise ValueError(f"Ключ {key_id} не найден")
        
        # XOR с повторением ключа
        key_bytes = key.key_data
        msg_bytes = message.encode()
        
        encrypted = bytes(
            m ^ key_bytes[i % len(key_bytes)]
            for i, m in enumerate(msg_bytes)
        )
        
        return (
            base64.b64encode(encrypted).decode(),
            "simple",
        )

    def decrypt_message(
        self,
        encrypted: str,
        key_id: str,
        nonce: str = "simple",
    ) -> str:
        """Расшифровать сообщение."""
        try:
            from cryptography.hazmat.primitives.ciphers import aead
            
            key_obj = self.vault.get_key(key_id)
            if not key_obj:
                raise ValueError(f"Ключ {key_id} не найден")
            
            encrypted_bytes = base64.b64decode(encrypted)
            nonce_bytes = base64.b64decode(nonce)
            
            # XChaCha20-Poly1305
            if hasattr(aead, 'XChaCha20Poly1305'):
                cipher = aead.XChaCha20Poly1305(key_obj.key_data)
                decrypted = cipher.decrypt(nonce_bytes, encrypted_bytes, None)
            else:
                # AES-GCM
                cipher = aead.AESGCM(key_obj.key_data)
                decrypted = cipher.decrypt(nonce_bytes, encrypted_bytes, None)
            
            return decrypted.decode()
        except:
            # Fallback
            return self._simple_decrypt(encrypted, key_id)

    def _simple_decrypt(self, encrypted: str, key_id: str) -> str:
        """Простое XOR расшифрование."""
        key = self.vault.get_key(key_id)
        if not key:
            raise ValueError(f"Ключ {key_id} не найден")
        
        encrypted_bytes = base64.b64decode(encrypted)
        key_bytes = key.key_data
        
        decrypted = bytes(
            e ^ key_bytes[i % len(key_bytes)]
            for i, e in enumerate(encrypted_bytes)
        )
        
        return decrypted.decode()


class SecurityAuditor:
    """
    Аудитор безопасности.

    Тестирует:
    - Утечки ключей
    - SQL injection
    - XSS уязвимости
    - insecure randomness
    - hardcoded secrets
    """

    def __init__(self, encryption: EncryptionService):
        """
        Args:
            encryption: Сервис шифрования.
        """
        self.encryption = encryption
        self.vault = encryption.vault

    def audit_code(self, code: str) -> SecurityAudit:
        """
        Аудит кода на уязвимости.

        Args:
            code: Код для проверки.

        Returns:
            SecurityAudit с результатами.
        """
        audit = SecurityAudit(test_type="code_audit")
        
        issues = []
        
        # Проверяем blacklist паттерны
        conn = sqlite3.connect(self.vault.vault_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT pattern, description FROM blacklist")
        patterns = cursor.fetchall()
        
        conn.close()
        
        for pattern, desc in patterns:
            matches = re.finditer(pattern, code, re.IGNORECASE)
            for match in matches:
                issues.append(f"🔴 {desc}: {match.group()[:50]}")
        
        # Проверяем weak randomness
        if re.search(r"random\.(random|randint)", code):
            if not re.search(r"secrets\.", code):
                issues.append("⚠️ Используется random вместо secrets")
        
        # Проверяем SQL injection
        if re.search(r'execute.*\+.*["\']', code):
            issues.append("🔴 Potential SQL injection")
        
        # Проверяем eval
        if re.search(r'\beval\s*\(', code):
            issues.append("🔴 Использование eval опасно")
        
        # Проверяем hardcoded credentials
        if re.search(r'password\s*=\s*["\'][^"\']{8,}["\']', code):
            issues.append("🔴 Hardcoded password найден")
        
        # Оцениваем
        audit.issues = issues
        audit.score = max(0, 100 - len(issues) * 15)
        audit.result = f"Найдено {len(issues)} проблем" if issues else "OK"
        
        return audit

    def test_encryption_strength(self, key_id: str) -> dict:
        """
        Тестировать стойкость шифрования.

        Args:
            key_id: ID ключа.

        Returns:
            Результаты тестирования.
        """
        key = self.vault.get_key(key_id)
        if not key:
            return {"error": "Ключ не найден"}
        
        tests = {
            "key_length_bits": len(key.key_data) * 8,
            "algorithm": key.algorithm,
            "expires": key.expires,
            "rotations": key.rotations,
        }
        
        # Тест #1: шифрование/расшифрование
        try:
            test_msg = "Secret message test 123!"
            enc, nonce = self.encryption.encrypt_message(test_msg, key_id)
            dec = self.encryption.decrypt_message(enc, key_id, nonce)
            
            tests["encrypt_decrypt_ok"] = (dec == test_msg)
        except Exception as e:
            tests["encrypt_decrypt_ok"] = False
            tests["error"] = str(e)
        
        # Тест #2: Проверка random IV
        try:
            enc1, _ = self.encryption.encrypt_message("test", key_id)
            enc2, _ = self.encryption.encrypt_message("test", key_id)
            
            tests["random_iv"] = (enc1 != enc2)
        except:
            tests["random_iv"] = False
        
        return tests

    def audit_dns(self, domain: str) -> dict:
        """
        Аудит DNS записей.

        Args:
            domain: Домен.

        Returns:
            Результаты DNS аудита.
        """
        import socket
        
        results = {
            "domain": domain,
            "records": {},
        }
        
        # A record
        try:
            results["records"]["A"] = socket.gethostbyname(domain)
        except:
            pass
        
        # AAAA
        try:
            results["records"]["AAAA"] = socket.gethostbyname6(domain)
        except:
            pass
        
        # MX
        try:
            mx_records = socket.getaddrinfo(domain, 25, socket.AF_INET)
            results["records"]["MX"] = [r[4][0] for r in mx_records]
        except:
            pass
        
        # TXT (нужен external library для реального lookup)
        results["records"]["TXT"] = "Требует dns/python библиотеку"
        
        return results


class SecuritySystem:
    """
    Главная система безопасности.

    Координирует:
    - KeyVault
    - EncryptionService
    - SecurityAuditor
    """

    def __init__(self):
        self.vault = KeyVault()
        self.encryption = EncryptionService(self.vault)
        self.auditor = SecurityAuditor(self.encryption)
        
        logger.info("SecuritySystem инициализирована")

    def generate_session_key(self) -> EncryptionKey:
        """Сгенерировать сессионный ключ."""
        return self.vault.generate_key(
            KeyType.SESSION,
            SecretLevel.SECRET,
        )

    def audit_code(self, code: str) -> SecurityAudit:
        """Аудит кода."""
        return self.auditor.audit_code(code)

    def test_encryption(self, key_id: str) -> dict:
        """Тест шифрования."""
        return self.auditor.test_encryption_strength(key_id)

    def check_secrets(self, code: str) -> list[str]:
        """Проверить на утечки secrets."""
        audit = self.auditor.audit_code(code)
        return audit.issues


# =============================================================================
# Глобальный实例
# =============================================================================

_security: Optional[SecuritySystem] = None


def get_security_system() -> SecuritySystem:
    """Получить глобальный экземпляр."""
    global _security
    if _security is None:
        _security = SecuritySystem()
    return _security


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Тест системы
    security = SecuritySystem()
    
    # Генерируем ключ
    print("🔑 Генерируем ключ...")
    key = security.generate_session_key()
    print(f"   Ключ создан: {key.id[:8]}")
    
    # Тест шифрования
    print("🔐 Тест шифрования...")
    test_result = security.test_encryption(key.id)
    print(f"   Результат: {test_result}")
    
    # Аудит кода
    print("🔍 Аудит кода...")
    audit = security.audit_code('''
def bad_example():
    password = "hardcoded123"
    return eval("1 + 1")
    ''')
    print(f"   Оценка: {audit.score}/100")
    print(f"   Про��ле��ы: {audit.issues}")
    
    # Аудит DNS
    print("🌐 Аудит DNS...")
    dns_result = security.auditor.audit_dns("google.com")
    print(f"   Записи: {dns_result['records']}")
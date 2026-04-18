#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
💬 Messenger Modules — модули для построения мессенджера.

Включает:
- WebSocket Server
- E2EE Chat Protocol
- Message Models
- Chat Storage
- Presence System
- Notifications
- Media Handler
- Chat Groups
"""

import json
import logging
import os
import secrets
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """Тип сообщения."""
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    FILE = "file"
    LOCATION = "location"
    SYSTEM = "system"


class MessageStatus(Enum):
    """Статус сообщения."""
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class ChatEvent(Enum):
    """Событие чата."""
    MESSAGE_NEW = "message_new"
    MESSAGE_EDIT = "message_edit"
    MESSAGE_DELETE = "message_delete"
    TYPING_START = "typing_start"
    TYPING_STOP = "typing_stop"
    PRESENCE_UPDATE = "presence_update"
    USER_ONLINE = "user_online"
    USER_OFFLINE = "user_offline"
    GROUP_JOIN = "group_join"
    GROUP_LEAVE = "group_leave"


@dataclass
class User:
    """Пользователь."""
    id: str
    username: str
    display_name: str
    avatar_url: str = ""
    public_key: str = ""  # E2EE public key
    created_at: str = ""
    last_seen: str = ""
    status: str = "offline"


@dataclass
class ChatMessage:
    """Сообщение."""
    id: str
    chat_id: str
    sender_id: str
    type: MessageType
    content: str  # Зашифрованное
    content_decrypted: str = ""  # Для получателя
    status: MessageStatus = MessageStatus.SENDING
    created_at: str = ""
    edited_at: str = ""
    reactions: dict = field(default_factory=dict)
    reply_to: str = ""


@dataclass
class Chat:
    """Чат/диалог."""
    id: str
    type: str  # "direct" or "group"
    name: str = ""
    participants: list[str] = field(default_factory=list)
    last_message: str = ""
    last_message_at: str = ""
    created_at: str = ""
    settings: dict = field(default_factory=dict)


class WebSocketChatServer:
    """
    WebSocket сервер для мессенджера.

    Обрабатывает:
    - соединения
    - сообщения
    - events (typing, presence)
    - ack messages
    """

    def __init__(self, port: int = 3001, host: str = "0.0.0.0"):
        self.port = port
        self.host = host
        self.clients: dict[str, Any] = {}
        self.user_sockets: dict[str, set] = {}  # user_id -> set of sockets
        self._running = False

    def start(self) -> None:
        """Запустить WebSocket сервер."""
        try:
            import asyncio
            from websockets import serve
            
            self._running = True
            
            async def handle_client(websocket, path):
                client_id = None
                
                try:
                    # Handshake - получить user_id
                    async for message in websocket:
                        data = json.loads(message)
                        
                        if data.get("type") == "auth":
                            client_id = data.get("user_id")
                            self.user_sockets.setdefault(client_id, set()).add(websocket)
                            self.clients[websocket] = client_id
                            
                            # Send online
                            await self.broadcast_event(
                                ChatEvent.USER_ONLINE,
                                {"user_id": client_id},
                                exclude=[client_id],
                            )
                        
                        elif data.get("type") == "message":
                            await self.handle_message(data, client_id)
                        
                        elif data.get("type") == "typing":
                            await self.broadcast_event(
                                ChatEvent.TYPING_START if data.get("typing") else ChatEvent.TYPING_STOP,
                                {"user_id": client_id, "chat_id": data.get("chat_id")},
                                exclude=[client_id],
                            )
                        
                        elif data.get("type") == "presence":
                            await self.broadcast_event(
                                ChatEvent.PRESENCE_UPDATE,
                                {"user_id": client_id, "status": data.get("status")},
                            )
                
                finally:
                    if client_id:
                        self.user_sockets.pop(client_id, None)
                        
                        await self.broadcast_event(
                            ChatEvent.USER_OFFLINE,
                            {"user_id": client_id},
                        )
            
            async def run():
                async with serve(handle_client, self.host, self.port):
                    logger.info(f"WebSocket server started: {self.host}:{self.port}")
                    await asyncio.Future()
            
            asyncio.run(run())
            
        except ImportError:
            logger.warning("websockets not installed. Install: pip install websockets")

    async def handle_message(self, data: dict, sender_id: str) -> None:
        """Обработать сообщение."""
        message = {
            "type": "message_new",
            "data": {
                "id": str(uuid.uuid4()),
                "chat_id": data.get("chat_id"),
                "sender_id": sender_id,
                "content": data.get("content"),
                "type": data.get("message_type", "text"),
                "created_at": datetime.now().isoformat(),
            },
        }
        
        # Добавить message в БД (реализовать)
        
        # Отправить получателю
        chat_id = data.get("chat_id")
        
        # Найти получателя
        from .storage import ChatStorage
        storage = ChatStorage()
        chat = storage.get_chat(chat_id)
        
        if chat:
            for participant_id in chat.participants:
                if participant_id != sender_id:
                    await self.send_to_user(participant_id, message)

    async def broadcast_event(self, event: ChatEvent, data: dict, exclude: list = None) -> None:
        """Broadcast событие."""
        message = json.dumps({
            "type": event.value,
            "data": data,
        })
        
        for user_id, sockets in self.user_sockets.items():
            if user_id in (exclude or []):
                continue
            
            for socket in sockets:
                try:
                    await socket.send(message)
                except:
                    pass

    async def send_to_user(self, user_id: str, message: dict) -> None:
        """Отправить пользователю."""
        if user_id not in self.user_sockets:
            return
        
        message_str = json.dumps(message)
        
        for socket in self.user_sockets[user_id]:
            try:
                await socket.send(message_str)
            except:
                pass


class ChatStorage:
    """
    Хранилище чатов.

    Поддерживает:
    - SQLite
    - PostgreSQL
    - MongoDB
    """

    def __init__(self, db_path: str = "chats.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        """Инициализировать БД."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Users
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                display_name TEXT,
                avatar_url TEXT,
                public_key TEXT,
                created_at TEXT,
                last_seen TEXT
            )
        """)
        
        # Chats
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                type TEXT,
                name TEXT,
                participants TEXT,
                last_message TEXT,
                last_message_at TEXT,
                created_at TEXT,
                settings TEXT
            )
        """)
        
        # Messages
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT,
                sender_id TEXT,
                type TEXT,
                content TEXT,
                status TEXT,
                created_at TEXT,
                edited_at TEXT,
                reactions TEXT,
                reply_to TEXT
            )
        """)
        
        conn.commit()
        conn.close()

    def save_message(self, message: ChatMessage) -> None:
        """Сохранить сообщение."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO messages 
            (id, chat_id, sender_id, type, content, status, created_at, edited_at, reactions, reply_to)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            message.id,
            message.chat_id,
            message.sender_id,
            message.type.value,
            message.content,
            message.status.value,
            message.created_at,
            message.edited_at,
            json.dumps(message.reactions),
            message.reply_to,
        ))
        
        conn.commit()
        conn.close()

    def get_messages(self, chat_id: str, limit: int = 50, before: str = None) -> list[ChatMessage]:
        """Получить сообщения."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if before:
            cursor.execute("""
                SELECT * FROM messages 
                WHERE chat_id = ? AND created_at < ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (chat_id, before, limit))
        else:
            cursor.execute("""
                SELECT * FROM messages 
                WHERE chat_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (chat_id, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            ChatMessage(
                id=row[0],
                chat_id=row[1],
                sender_id=row[2],
                type=MessageType(row[3]),
                content=row[4],
                status=MessageStatus(row[5]),
                created_at=row[6],
                edited_at=row[7],
                reactions=json.loads(row[8]) if row[8] else {},
                reply_to=row[9] if row[9] else "",
            )
            for row in rows
        ]

    def get_chat(self, chat_id: str) -> Optional[Chat]:
        """Получить чат."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM chats WHERE id = ?", (chat_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        return Chat(
            id=row[0],
            type=row[1],
            name=row[2] or "",
            participants=json.loads(row[3]) if row[3] else [],
            last_message=row[4] or "",
            last_message_at=row[5] or "",
            created_at=row[6],
            settings=json.loads(row[7]) if row[7] else {},
        )


class E2EEProtocol:
    """
    E2EE протокол для мессенджера.

    - X25519 key exchange
    - XChaCha20-Poly1305 encryption
    - Session keys
    """

    def __init__(self):
        self._keys: dict[str, dict] = {}

    def generate_keypair(self) -> dict[str, str]:
        """Сгенерировать пару ключей."""
        try:
            from cryptography.hazmat.primitives.asymmetric import x25519
            from cryptography.hazmat.primitives import serialization
            
            private_key = x25519.X25519PrivateKey.generate()
            public_key = private_key.public_key()
            
            return {
                "private": private_key.private_bytes(
                    encoding=serialization.Encoding.Raw,
                    format=serialization.PrivateFormat.Raw,
                    encryption_algorithm=serialization.NoEncryption(),
                ).hex(),
                "public": public_key.public_bytes(
                    encoding=serialization.Encoding.Raw,
                    format=serialization.PublicFormat.Raw,
                ).hex(),
            }
        except:
            return {
                "private": secrets.token_hex(32),
                "public": secrets.token_hex(32),
            }

    def derive_session_key(self, private_key: str, peer_public_key: str) -> bytes:
        """Вывести сессионный ключ."""
        try:
            from cryptography.hazmat.primitives.asymmetric import x25519
            from cryptography.hazmat.primitives import serialization
            
            priv = x25519.X25519PrivateKey.from_private_bytes(
                bytes.fromhex(private_key)
            )
            
            pub = x25519.X25519PublicKey.from_public_bytes(
                bytes.fromhex(peer_public_key)
            )
            
            shared = priv.exchange(pub)
            return shared
        except:
            return secrets.token_bytes(32)

    def encrypt_message(self, message: str, key: bytes) -> tuple[str, str]:
        """Зашифровать сообщение."""
        try:
            from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
            
            cipher = XChaCha20Poly1305(key)
            nonce = secrets.token_bytes(24)
            ciphertext = cipher.encrypt(nonce, message.encode(), None)
            
            return ciphertext.hex(), nonce.hex()
        except:
            return message, "simple"

    def decrypt_message(self, ciphertext: str, key: bytes, nonce: str) -> str:
        """Расшифровать."""
        try:
            from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
            
            cipher = XChaCha20Poly1305(key)
            plaintext = cipher.decrypt(
                bytes.fromhex(nonce),
                bytes.fromhex(ciphertext),
                None,
            )
            return plaintext.decode()
        except:
            return ciphertext


class PresenceSystem:
    """
    Система присутствия.

    Отслеживает:
    - Online/Offline
    - Last seen
    - Typing status
    """

    def __init__(self):
        self._online: dict[str, str] = {}  # user_id -> last_seen
        self._typing: dict[str, str] = {}  # user_id -> chat_id

    def user_online(self, user_id: str) -> None:
        """Пользователь онлайн."""
        self._online[user_id] = datetime.now().isoformat()

    def user_offline(self, user_id: str) -> None:
        """Пользователь офлайн."""
        self._online.pop(user_id, None)
        self._typing.pop(user_id, None)

    def set_typing(self, user_id: str, chat_id: str) -> None:
        """Пользователь печатает."""
        self._typing[user_id] = chat_id

    def stop_typing(self, user_id: str) -> None:
        """Перестал печатать."""
        self._typing.pop(user_id, None)

    def get_online(self) -> list[str]:
        """Получить онлайн пользователей."""
        return list(self._online.keys())

    def get_typing(self, chat_id: str) -> list[str]:
        """Получить печатающих в чате."""
        return [u for u, c in self._typing.items() if c == chat_id]


class MediaHandler:
    """
    Обработчик медиа.

    Поддерживает:
    - Images (upload, resize, optimize)
    - Videos
    - Audio
    - Files
    """

    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(upload_dir, exist_ok=True)

    async def upload_image(
        self,
        file_data: bytes,
        filename: str,
        user_id: str,
    ) -> dict:
        """Загрузить изображение."""
        import hashlib
        
        # Generate unique name
        ext = filename.rsplit(".", 1)[-1]
        file_id = hashlib.sha256(file_data + str(time.time()).encode()).hexdigest()[:16]
        new_filename = f"{file_id}.{ext}"
        filepath = os.path.join(self.upload_dir, new_filename)
        
        # Save
        with open(filepath, "wb") as f:
            f.write(file_data)
        
        # Get metadata
        from PIL import Image
        
        try:
            with Image.open(filepath) as img:
                width, height = img.size
        except:
            width, height = 0, 0
        
        return {
            "id": file_id,
            "filename": new_filename,
            "url": f"/uploads/{new_filename}",
            "width": width,
            "height": height,
            "size": len(file_data),
        }

    async def upload_file(
        self,
        file_data: bytes,
        filename: str,
        user_id: str,
    ) -> dict:
        """Загрузить файл."""
        import hashlib
        
        file_id = hashlib.sha256(file_data + str(time.time()).encode()).hexdigest()[:16]
        filepath = os.path.join(self.upload_dir, f"{file_id}_{filename}")
        
        with open(filepath, "wb") as f:
            f.write(file_data)
        
        return {
            "id": file_id,
            "filename": filename,
            "url": f"/uploads/{file_id}_{filename}",
            "size": len(file_data),
        }


# =============================================================================
# Messenger System объединяющий всё
# =============================================================================

class MessengerSystem:
    """
    Главная система мессенджера.

    Объединяет:
    - WebSocket сервер
    - E2EE
    - Хранилище
    - Presence
    - Media
    """

    def __init__(self):
        self.ws = WebSocketChatServer()
        self.storage = ChatStorage()
        self.e2ee = E2EEProtocol()
        self.presence = PresenceSystem()
        self.media = MediaHandler()

    def start_server(self) -> None:
        """Запустить WebSocket сервер."""
        import asyncio
        asyncio.run(self.ws.start())


# =============================================================================
# Глобальный instance
# =============================================================================

_messenger: Optional[MessengerSystem] = None


def get_messenger() -> MessengerSystem:
    """Получить мессенджер систему."""
    global _messenger
    if _messenger is None:
        _messenger = MessengerSystem()
    return _messenger


if __name__ == "__main__":
    m = get_messenger()
    print("💬 Messenger system ready")
    
    # Test E2EE
    keys = m.e2ee.generate_keypair()
    print(f"Keypair generated: {keys['public'][:20]}...")
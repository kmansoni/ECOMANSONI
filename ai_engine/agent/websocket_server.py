#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🌐 WebSocket Server — авто-настройка WebSocket.

Возможности:
- WebSocket сервер
- Room management
- Broadcasting
- Heartbeat
- Reconnection
- SSL/TLS
"""

import asyncio
import json
import logging
import ssl
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class WSMessageType(Enum):
    """Типы сообщений."""
    HELLO = "hello"
    CHAT = "chat"
    JOIN = "join"
    LEAVE = "leave"
    TYPING = "typing"
    HEARTBEAT = "heartbeat"
    ERROR = "error"


@dataclass
class WSMessage:
    """WebSocket сообщение."""
    type: WSMessageType
    payload: dict
    timestamp: float = field(default_factory=time.time)


@dataclass
class Client:
    """Клиент."""
    id: str
    socket: Any
    rooms: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class RoomManager:
    """Управление комнатами."""
    
    def __init__(self):
        self.rooms: dict[str, set[str]] = {}  # room_id -> set of client_ids
        self.clients: dict[str, Client] = {}
    
    def create_room(self, room_id: str) -> None:
        """Создать комнату."""
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
            logger.info(f"Room created: {room_id}")
    
    def join_room(self, client_id: str, room_id: str) -> None:
        """Клиент входит в комнату."""
        self.create_room(room_id)
        
        # Leave old rooms if needed
        if client_id in self.clients:
            client = self.clients[client_id]
            for old_room in list(client.rooms):
                if old_room != room_id:
                    self.leave_room(client_id, old_room)
        
        self.rooms[room_id].add(client_id)
        
        if client_id in self.clients:
            if room_id not in self.clients[client_id].rooms:
                self.clients[client_id].rooms.append(room_id)
        
        logger.info(f"Client {client_id} joined room {room_id}")
    
    def leave_room(self, client_id: str, room_id: str) -> None:
        """Клиент покидает комнату."""
        if room_id in self.rooms and client_id in self.rooms[room_id]:
            self.rooms[room_id].remove(client_id)
            logger.info(f"Client {client_id} left room {room_id}")
    
    def leave_all_rooms(self, client_id: str) -> None:
        """Клиент покидает все комнаты."""
        if client_id in self.clients:
            for room_id in list(self.clients[client_id].rooms):
                self.leave_room(client_id, room_id)
    
    def get_clients_in_room(self, room_id: str) -> list[str]:
        """Получить клиентов в комнате."""
        return list(self.rooms.get(room_id, set()))
    
    def broadcast_to_room(self, room_id: str, message: dict, exclude: str = None) -> None:
        """Broadcast в комнату."""
        for client_id in self.get_clients_in_room(room_id):
            if client_id != exclude:
                self.send_to_client(client_id, message)
    
    def send_to_client(self, client_id: str, message: dict) -> None:
        """Отправить сообщение клиенту."""
        if client_id in self.clients:
            client = self.clients[client_id]
            # asyncio future - actual sending handled by server
            if hasattr(client.socket, 'send'):
                asyncio.create_task(client.socket.send(json.dumps(message)))
    
    def register_client(self, client_id: str, socket: Any) -> None:
        """Зарегистрировать клиента."""
        self.clients[client_id] = Client(id=client_id, socket=socket)
    
    def unregister_client(self, client_id: str) -> None:
        """Удалить клиента."""
        self.leave_all_rooms(client_id)
        if client_id in self.clients:
            del self.clients[client_id]


class WebSocketServer:
    """
    WebSocket сервер.
    
    Позволяет:
    - Создавать rooms
    - Broadcast сообщения
    - Heartbeat мониторинг
    - Event handlers
    """

    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 8080,
        ssl_enabled: bool = False,
    ):
        self.host = host
        self.port = port
        self.ssl_enabled = ssl_enabled
        self.rooms = RoomManager()
        
        # Event handlers
        self.on_connect: Optional[Callable] = None
        self.on_disconnect: Optional[Callable] = None
        self.on_message: Optional[Callable] = None
        
        # Heartbeat
        self.heartbeat_interval = 30  # seconds
        self.last_heartbeat: dict[str, float] = {}
        
        self.server = None
    
    async def handle_client(self, websocket, path):
        """Обработка клиента."""
        client_id = str(id(websocket))
        self.rooms.register_client(client_id, websocket)
        
        logger.info(f"Client connected: {client_id}")
        
        if self.on_connect:
            self.on_connect(client_id)
        
        try:
            # Send hello
            await websocket.send(json.dumps({
                "type": "hello",
                "payload": {"client_id": client_id},
            }))
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_message(client_id, data)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON from {client_id}")
                    
        except Exception as e:
            logger.error(f"Client error: {e}")
        finally:
            self.rooms.unregister_client(client_id)
            logger.info(f"Client disconnected: {client_id}")
            
            if self.on_disconnect:
                self.on_disconnect(client_id)
    
    async def handle_message(self, client_id: str, data: dict) -> None:
        """Обработка сообщения."""
        msg_type = data.get("type")
        payload = data.get("payload", {})
        
        if msg_type == "join":
            room_id = payload.get("room")
            if room_id:
                self.rooms.join_room(client_id, room_id)
                await self.send_to(client_id, "joined", {"room": room_id})
        
        elif msg_type == "leave":
            room_id = payload.get("room")
            if room_id:
                self.rooms.leave_room(client_id, room_id)
        
        elif msg_type == "chat":
            room_id = payload.get("room")
            message = payload.get("message")
            
            if room_id:
                self.rooms.broadcast_to_room(
                    room_id,
                    {"type": "chat", "payload": {"message": message, "from": client_id}},
                    exclude=client_id,
                )
        
        elif msg_type == "typing":
            room_id = payload.get("room")
            if room_id:
                self.rooms.broadcast_to_room(
                    room_id,
                    {"type": "typing", "payload": {"user": client_id}},
                    exclude=client_id,
                )
        
        elif msg_type == "heartbeat":
            self.last_heartbeat[client_id] = time.time()
            await self.send_to(client_id, "heartbeat_ack", {})
        
        if self.on_message:
            self.on_message(client_id, data)
    
    async def send_to(self, client_id: str, msg_type: str, payload: dict) -> None:
        """Отправить сообщение."""
        self.rooms.send_to_client(client_id, {"type": msg_type, "payload": payload})
    
    async def broadcast(self, msg_type: str, payload: dict) -> None:
        """Broadcast всем."""
        for client_id in list(self.rooms.clients.keys()):
            await self.send_to(client_id, msg_type, payload)
    
    async def start(self) -> None:
        """Запустить сервер."""
        import websockets
        
        ssl_context = None
        if self.ssl_enabled:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            # ssl_context.load_cert_chain("cert.pem", "key.pem")
        
        self.server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ssl=ssl_context,
        )
        
        logger.info(f"WebSocket server started on {self.host}:{self.port}")
    
    async def stop(self) -> None:
        """Остановить сервер."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("WebSocket server stopped")


# =============================================================================
# Client-side (for browser/node)
# =============================================================================

def generate_client_code() -> str:
    """Сгенерировать клиентский код."""
    return """// WebSocket Client
class WSClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('Connected');
      this.reconnectAttempts = 0;
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit(data.type, data.payload);
    };
    
    this.ws.onclose = () => {
      console.log('Disconnected');
      this.reconnect();
    };
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  emit(event, data) {
    if (this.handlers[event]) {
      this.handlers[event].forEach(h => h(data));
    }
  }

  send(type, payload) {
    this.ws.send(JSON.stringify({ type, payload }));
  }

  join(room) { this.send('join', { room }); }
  leave(room) { this.send('leave', { room }); }
  chat(room, message) { this.send('chat', { room, message }); }
  typing(room) { this.send('typing', { room }); }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
    }
  }
}
"""


# =============================================================================
# Global
# =============================================================================

def create_ws_server(
    host: str = "0.0.0.0",
    port: int = 8080,
) -> WebSocketServer:
    """Создать WebSocket сервер."""
    return WebSocketServer(host, port)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    server = create_ws_server()
    print(f"🌐 WebSocket Server ready on port {server.port}")
    print("Client code:", generate_client_code()[:200])
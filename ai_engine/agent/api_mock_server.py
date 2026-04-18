#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🌐 API Mock Server — автоматический мок API для тестирования.

Возможности:
- Fast mock сервер
- Динамические ответы
- Задержки и ошибки
- Сценарии
- OpenAPI → Mock
"""

import json
import logging
import random
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class MockMethod(Enum):
    """HTTP методы."""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"


@dataclass
class MockEndpoint:
    """Mock эндпоинт."""
    path: str
    method: MockMethod
    response: dict
    status_code: int = 200
    delay_ms: int = 0
    description: str = ""


@dataclass
class MockScenario:
    """Сценарий ответа."""
    name: str
    weight: int = 1  # probability weight
    response: dict
    status_code: int = 200


class DynamicResponse:
    """Динамический ответ с шаблонами."""
    
    @staticmethod
    def generate(data: dict, context: dict = None) -> dict:
        """Генерировать ответ с подстановкой переменных."""
        context = context or {}
        
        result = {}
        for key, value in data.items():
            result[key] = DynamicResponse._process_value(value, context)
        
        return result
    
    @staticmethod
    def _process_value(value: Any, context: dict) -> Any:
        """Обработать значение."""
        if isinstance(value, str):
            # Template: {{uuid}}, {{timestamp}}, {{random}}, {{context.key}}
            value = re.sub(r'\{\{uuid\}\}', lambda _: str(uuid.uuid4())[:8], value)
            value = re.sub(r'\{\{timestamp\}\}', lambda _: str(int(time.time())), value)
            value = re.sub(r'\{\{date\}\}', lambda _: time.strftime("%Y-%m-%d"), value)
            value = re.sub(r'\{\{random\}\}', lambda _: str(random.randint(1, 1000)), value)
            
            # Context variables
            for k, v in context.items():
                value = value.replace(f"{{{{{k}}}}}", str(v))
        
        elif isinstance(value, list):
            value = [DynamicResponse._process_value(i, context) for i in value]
        
        elif isinstance(value, dict):
            value = DynamicResponse.generate(value, context)
        
        return value


import uuid


class MockServer:
    """
    Mock API сервер.
    
    Позволяет:
    - Создавать mock эндпоинты
    - Динамические ответы
    - Задержки и ошибки
    - Сценарии
    """

    def __init__(self, port: int = 3001):
        self.port = port
        self.endpoints: dict[str, MockEndpoint] = {}
        self.scenarios: dict[str, list[MockScenario]] = {}
    
    def add_endpoint(
        self,
        path: str,
        method: MockMethod,
        response: dict,
        status_code: int = 200,
        delay_ms: int = 0,
    ) -> None:
        """Добавить эндпоинт."""
        key = f"{method.value}:{path}"
        self.endpoints[key] = MockEndpoint(
            path=path,
            method=method,
            response=response,
            status_code=status_code,
            delay_ms=delay_ms,
        )
    
    def add_scenario(
        self,
        path: str,
        method: MockMethod,
        scenarios: list[MockScenario],
    ) -> None:
        """Добавить сценарии для эндпоинта."""
        key = f"{method.value}:{path}"
        self.scenarios[key] = scenarios
    
    def get_response(
        self,
        path: str,
        method: MockMethod,
        query_params: dict = None,
        body: dict = None,
    ) -> tuple[dict, int]:
        """Получить mock ответ."""
        key = f"{method.value}:{path}"
        
        # Check for scenarios
        if key in self.scenarios:
            scenario = self._select_scenario(self.scenarios[key])
            return scenario.response, scenario.status_code
        
        # Regular endpoint
        if key in self.endpoints:
            endpoint = self.endpoints[key]
            
            # Apply delay
            if endpoint.delay_ms > 0:
                time.sleep(endpoint.delay_ms / 1000)
            
            # Dynamic response
            context = {
                "query": query_params or {},
                "body": body or {},
            }
            response = DynamicResponse.generate(endpoint.response, context)
            
            return response, endpoint.status_code
        
        return {"error": "Not found"}, 404
    
    def _select_scenario(self, scenarios: list[MockScenario]) -> MockScenario:
        """Выбрать сценарий по весу."""
        total = sum(s.weight for s in scenarios)
        r = random.randint(1, total)
        
        current = 0
        for s in scenarios:
            current += s.weight
            if r <= current:
                return s
        
        return scenarios[0]
    
    # === Quick presets ===
    
    def mock_user(self, path: str = "/api/users") -> None:
        """Mock User API."""
        self.add_endpoint(
            path,
            MockMethod.GET,
            {
                "users": [
                    {"id": 1, "name": "John Doe", "email": "john@example.com"},
                    {"id": 2, "name": "Jane Smith", "email": "jane@example.com"},
                ],
                "total": 2,
            }
        )
        
        self.add_endpoint(
            path,
            MockMethod.POST,
            {"id": "{{uuid}}", "name": "{{random}}", "created": "{{timestamp}}"},
        )
    
    def mock_products(self, path: str = "/api/products") -> None:
        """Mock Products API."""
        self.add_endpoint(
            path,
            MockMethod.GET,
            {
                "products": [
                    {"id": "{{uuid}}", "name": "Product {{random}}", "price": "{{random}}"},
                ],
            }
        )
    
    def mock_error(self, path: str = "/api/error", status: int = 500) -> None:
        """Mock Error."""
        self.add_endpoint(
            path,
            MockMethod.GET,
            {"error": "Internal Server Error"},
            status_code=status,
        )


class OpenAPIMocker:
    """
    Генератор mock из OpenAPI спецификации.
    """

    @staticmethod
    def from_spec(spec: dict) -> MockServer:
        """Создать mock из OpenAPI spec."""
        server = MockServer()
        
        paths = spec.get("paths", {})
        
        for path, methods in paths.items():
            for method, details in methods.items():
                if method.upper() not in ["GET", "POST", "PUT", "DELETE", "PATCH"]:
                    continue
                
                # Get response schema
                responses = details.get("responses", {})
                success = responses.get("200") or responses.get("201")
                
                if success:
                    content = success.get("content", {})
                    json_content = content.get("application/json")
                    
                    if json_content:
                        schema = json_content.get("schema", {})
                        example = OpenAPIMocker._schema_to_example(schema)
                        
                        server.add_endpoint(
                            path,
                            MockMethod(method.upper()),
                            example,
                        )
        
        return server
    
    @staticmethod
    def _schema_to_example(schema: dict) -> dict:
        """Конвертировать schema в пример."""
        if schema.get("$ref"):
            # Simplified - just return empty
            return {"example": "value"}
        
        schema_type = schema.get("type", "object")
        
        if schema_type == "object":
            props = schema.get("properties", {})
            return {
                k: OpenAPIMocker._schema_to_example(v)
                for k, v in props.items()
            }
        
        if schema_type == "array":
            items = schema.get("items", {})
            return [OpenAPIMocker._schema_to_example(items)]
        
        if schema_type == "string":
            return "{{random}}"
        
        if schema_type == "integer":
            return 0
        
        if schema_type == "boolean":
            return True
        
        return None


class MockServerRunner:
    """Запуск mock сервера."""

    def __init__(self, server: MockServer):
        self.server = server
    
    def run(self):
        """Запустить сервер (требует Flask/FastAPI)."""
        try:
            from flask import Flask, request, jsonify
            
            app = Flask(__name__)
            
            @app.route("/<path:subpath>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
            def handle(subpath):
                method = MockMethod(request.method)
                query = dict(request.args)
                body = request.get_json() if request.is_json else None
                
                response, status = self.server.get_response(
                    f"/{subpath}", method, query, body
                )
                
                return jsonify(response), status
            
            print(f"🎭 Mock server running on http://localhost:{self.server.port}")
            app.run(port=self.server.port)
            
        except ImportError:
            print("❌ Install flask: pip install flask")


# =============================================================================
# Global
# =============================================================================

def create_mock_server(port: int = 3001) -> MockServer:
    """Создать mock сервер."""
    return MockServer(port)


def quick_mock(path: str = "/api") -> MockServer:
    """Быстрый mock сервер."""
    server = create_mock_server()
    server.mock_user(f"{path}/users")
    server.mock_products(f"{path}/products")
    return server


if __name__ == "__main__":
    # Quick test
    server = quick_mock()
    print("🎭 API Mock Server ready")
    
    # Test response
    resp, status = server.get_response("/api/users", MockMethod.GET)
    print(f"Response: {resp}")
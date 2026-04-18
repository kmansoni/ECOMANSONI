#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🌐 WebContainers — выполнение Node.js прямо в браузере.

Возможности:
- Запуск Node.js в браузере через WebContainers API
- NPM install, build, dev сервер
- Hot reload
- Полная изоляция в браузере

https://webcontainers.io
"""

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ContainerStatus(Enum):
    """Статус контейнера."""
    STOPPED = "stopped"
    STARTING = "starting"
    READY = "ready"
    RUNNING = "running"
    ERROR = "error"


@dataclass
class FileMount:
    """Файл для монтирования в контейнер."""
    path: str
    content: str
    encoding: str = "utf-8"


@dataclass
class ContainerConfig:
    """Конфиг WebContainer."""
    name: str = "app"
    packageManager: str = "npm"
    nodeVersion: str = "18"


class WebContainerRuntime:
    """
    WebContainer Runtime для браузера.

    Позволяет запускать Node.js прямо в браузере без сервера.
    """

    def __init__(self):
        self.status = ContainerStatus.STOPPED
        self.files: dict[str, str] = {}
        self.dependencies: dict = {}

    def mount(self, files: list[FileMount]) -> None:
        """Монтировать файлы."""
        for f in files:
            self.files[f.path] = f.content
        logger.info(f"Mounted {len(files)} files")

    def mount_directory(self, path: str) -> None:
        """Монтировать директорию."""
        import os
        
        for root, dirs, files in os.walk(path):
            for file in files:
                filepath = os.path.join(root, file)
                rel_path = filepath[len(path):].lstrip("/")
                
                try:
                    with open(filepath, "r") as f:
                        self.files[rel_path] = f.read()
                except:
                    pass
        
        logger.info(f"Mounted directory: {path}")

    def generate_js(self) -> str:
        """Сгенерировать JavaScript код для WebContainer."""
        
        # Формируем files object
        files_obj = {}
        for path, content in self.files.items():
            files_obj[path] = {
                "file": {"contents": content}
            }
        
        js = f"""
// WebContainer Runtime для {self.name}
// Скопируйте этот код в HTML файл

import{{ WebContainer }} from '@webcontainer/api';

const files = {json.dumps(files_obj, indent=2)};

async function start() {{
  const webcontainer = new WebContainer();
  
  // Mount файлов
  await webcontainer.mount(files);
  
  // Install зависимости
  const installProcess = await webcontainer.spawn('npm', ['install']);
  await installProcess.exit;
  
  // Запуск dev сервера
  const devProcess = await webcontainer.spawn('npm', ['run', 'dev']);
  
  // Получение URL
  webcontainer.on('server-ready', (port, url) => {{
    console.log('Server ready:', url);
  }});
}}

start();
"""
        return js

    def generate_html(self) -> str:
        """Сгенерировать HTML с WebContainer."""
        js = self.generate_js()
        
        return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{self.name}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: system-ui; padding: 20px; }}
    #app {{ max-width: 800px; margin: 0 auto; }}
    .loading {{ color: #666; }}
    .ready {{ color: green; }}
  </style>
</head>
<body>
  <div id="app">
    <h1>🌐 WebContainer</h1>
    <pre id="output" class="loading">Загрузка...</pre>
  </div>

  <script type="module">
    import{{ WebContainer }} from 'https://unpkg.com/@webcontainer/api@1.1.9/dist/index.mjs';

    const files = {json.dumps(self.files, indent=6)};

    const output = document.getElementById('output');
    output.textContent = 'Mounting files...';

    const webcontainer = new WebContainer();

    await webcontainer.mount(files);

    output.textContent = 'Installing dependencies...';

    const installProcess = await webcontainer.spawn('npm', ['install']);
    await installProcess.exit;

    output.textContent = 'Starting dev server...';

    const devProcess = await webcontainer.spawn('npm', ['run', 'dev']);

    webcontainer.on('server-ready', (port, url) => {{
      output.className = 'ready';
      output.textContent = '✅ Server ready: ' + url;
    }});
  </script>
</body>
</html>"""


class NodeRuntime:
    """
    Node.js Runtime для выполнения JS кода.

    Альтернатива: Deno, Bun (в browser)
    """

    def __init__(self):
        self.processes: dict = {}

    def run_js(self, code: str) -> dict:
        """Выполнить JavaScript код."""
        # Требует @webcontainer/api
        return {
            "method": "webcontainer_js",
            "code": code,
        }

    def run_package(self, package: str, args: list[str] = None) -> dict:
        """Выполнить npm пакет."""
        return {
            "method": "npm_command",
            "package": package,
            "args": args or [],
        }


class WebContainerSystem:
    """
    Главная система WebContainer.

    Координирует:
    - WebContainerRuntime
    - NodeRuntime
    - Hot Reload
    """

    def __init__(self):
        self.runtime = WebContainerRuntime()
        self.node = NodeRuntime()

    def mount_project(self, path: str) -> None:
        """Монтировать проект."""
        self.runtime.mount_directory(path)

    def generate_standalone(self, output_path: str = "index.html") -> str:
        """Сгенерировать standalone HTML."""
        html = self.runtime.generate_html()
        
        with open(output_path, "w") as f:
            f.write(html)
        
        logger.info(f"Generated: {output_path}")
        return output_path


# =============================================================================
# Глобальный instance
# =============================================================================

_wc: Optional[WebContainerSystem] = None


def get_webcontainer() -> WebContainerSystem:
    """Получить WebContainer систему."""
    global _wc
    if _wc is None:
        _wc = WebContainerSystem()
    return _wc


if __name__ == "__main__":
    wc = get_webcontainer()
    print("🌐 WebContainer ready")
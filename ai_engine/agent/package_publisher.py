#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📦 Package Publisher — публикация в npm/pip/Docker Hub.

Возможности:
- npm publish
- pip publish
- Docker push
- GitHub Release
- Semantic versioning
"""

import json
import logging
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class Registry(Enum):
    """Реестр пакетов."""
    NPM = "npm"
    PYPI = "pypi"
    DOCKER_HUB = "dockerhub"
    GITHUB = "github"


@dataclass
class PackageInfo:
    """Информация о пакете."""
    name: str
    version: str
    description: str = ""
    author: str = ""
    license: str = "MIT"
    repository: str = ""
    keywords: Optional[list[str]] = None


class PackagePublisher:
    """
    Publisher для пакетов.

    Поддерживает:
    - npm
    - pip/PyPI
    - Docker Hub
    - GitHub Releases
    """

    def __init__(self):
        self.token = None
        self.repo = ""  # For GitHub releases

    def set_token(self, token: str, registry: Registry) -> None:
        """Установить токен."""
        self.token = {registry: token}

    # === npm / yarn ===

    def publish_npm(
        self,
        path: str = ".",
        tag: str = "latest",
        access: str = "public",
    ) -> dict:
        """
        Опубликовать в npm.

        Args:
            path: Путь к пакету.
            tag: Тег версии.
            access: public/restricted

        Returns:
            Результат.
        """
        result = subprocess.run(
            ["npm", "publish", "--access", access, "--tag", tag],
            cwd=path,
            capture_output=True,
            text=True,
        )
        
        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr,
        }

    def version_bump(
        self,
        path: str,
        type: str = "patch",  # major, minor, patch
    ) -> str:
        """Обновить версию."""
        result = subprocess.run(
            ["npm", "version", type],
            cwd=path,
            capture_output=True,
            text=True,
        )
        
        if result.returncode == 0:
            # Parse version from output
            match = re.search(r"(\d+\.\d+\.\d+)", result.stdout)
            return match.group(1) if match else "unknown"
        
        return ""

    def generate_changelog(
        self,
        from_tag: str,
        to_tag: str = "HEAD",
    ) -> str:
        """Сгенерировать changelog."""
        result = subprocess.run(
            ["git", "log", f"{from_tag}..{to_tag}", "--pretty=format:- %s (%an)"],
            capture_output=True,
            text=True,
        )
        
        return result.stdout

    # === Python / pip ===

    def publish_pypi(
        self,
        path: str = ".",
        test: bool = True,
    ) -> dict:
        """
        Опубликовать в PyPI.

        Args:
            path: Путь к пакету.
            test: TestPyPI или реальный

        Returns:
            Результат.
        """
        # Build
        build = subprocess.run(
            ["python", "-m", "build"],
            cwd=path,
            capture_output=True,
        )
        
        if build.returncode != 0:
            return {"success": False, "error": build.stderr}
        
        # Upload
        repo = "--test-pypi" if test else "--pypi"
        upload = subprocess.run(
            ["twine", "upload", repo, "dist/*"],
            cwd=path,
            capture_output=True,
            text=True,
        )
        
        return {
            "success": upload.returncode == 0,
            "error": upload.stderr,
        }

    # === Docker Hub ===

    def docker_push(
        self,
        image: str,
        tag: str = "latest",
        username: str = None,
        password: str = None,
    ) -> dict:
        """
        Пушить в Docker Hub.

        Args:
            image: Имя образа.
            tag: Тег.
            username: Docker Hub username.
            password: Token или пароль.

        Returns:
            Результат.
        """
        # Login
        if username and password:
            login = subprocess.run(
                ["docker", "login", "-u", username, "--password-stdin"],
                input=password,
                capture_output=True,
            )
            
            if login.returncode != 0:
                return {"success": False, "error": login.stderr}
        
        # Tag
        tag_result = subprocess.run(
            ["docker", "tag", image, f"{image}:{tag}"],
            capture_output=True,
        )
        
        # Push
        push = subprocess.run(
            ["docker", "push", f"{image}:{tag}"],
            capture_output=True,
            text=True,
        )
        
        return {
            "success": push.returncode == 0,
            "error": push.stderr,
        }

    # === GitHub Release ===

    def create_release(
        self,
        repo: str,
        tag: str,
        title: str,
        body: str,
        draft: bool = False,
        prerelease: bool = False,
    ) -> dict:
        """
        Создать GitHub Release.

        Args:
            repo: owner/repo.
            tag: Тег.
            title: Название.
            body: Описание (markdown).
            draft: Черновик.
            prerelease: Pre-release.

        Returns:
            Результат.
        """
        import requests
        
        if not self.token.get(Registry.GITHUB):
            return {"success": False, "error": "No GitHub token"}
        
        url = f"https://api.github.com/repos/{repo}/releases"
        
        data = {
            "tag_name": tag,
            "name": title,
            "body": body,
            "draft": draft,
            "prerelease": prerelease,
        }
        
        response = requests.post(
            url,
            json=data,
            headers={
                "Authorization": f"token {self.token[Registry.GITHUB]}",
                "Accept": "application/vnd.github+json",
            },
        )
        
        return {
            "success": response.status_code == 201,
            "response": response.json(),
        }

    def upload_asset(
        self,
        release_id: int,
        asset_path: str,
    ) -> dict:
        """Загрузить asset к release."""
        import requests
        
        url = f"https://uploads.github.com/repos/{self.repo}/releases/{release_id}/assets"
        
        with open(asset_path, "rb") as f:
            response = requests.post(
                url,
                files={"file": f},
                headers={
                    "Authorization": f"token {self.token[Registry.GITHUB]}",
                    "Content-Type": "application/octet-stream",
                },
            )
        
        return {
            "success": response.status_code == 201,
            "response": response.json(),
        }


class VersionManager:
    """
    Управление версиями SemVer.

    Функции:
    - parse version
    - bump version
    - compare versions
    """

    @staticmethod
    def parse(version: str) -> tuple[int, int, int]:
        """Parse semver."""
        parts = version.lstrip("v").split(".")
        return (
            int(parts[0]) if len(parts) > 0 else 0,
            int(parts[1]) if len(parts) > 1 else 0,
            int(parts[2]) if len(parts) > 2 else 0,
        )

    @staticmethod
    def bump(
        version: str,
        type: str = "patch",
    ) -> str:
        """Bump версию."""
        major, minor, patch = VersionManager.parse(version)
        
        if type == "major":
            major += 1
            minor = 0
            patch = 0
        elif type == "minor":
            minor += 1
            patch = 0
        else:
            patch += 1
        
        return f"{major}.{minor}.{patch}"

    @staticmethod
    def is_newer(version1: str, version2: str) -> bool:
        """Сравнить версии."""
        v1 = VersionManager.parse(version1)
        v2 = VersionManager.parse(version2)
        return v1 > v2


# =============================================================================
# Глобальный instance
# =============================================================================

_publisher: Optional[PackagePublisher] = None


def get_publisher() -> PackagePublisher:
    """Получить publisher."""
    global _publisher
    if _publisher is None:
        _publisher = PackagePublisher()
    return _publisher


if __name__ == "__main__":
    pub = get_publisher()
    print("📦 Package Publisher ready")
    
    # Test version
    v = VersionManager.bump("1.2.3", "patch")
    print(f"New version: {v}")
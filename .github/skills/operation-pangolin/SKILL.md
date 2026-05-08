---
name: operation-pangolin
description: >-
  Универсальный скилл для управления Pangolin VPN и Reverse Proxy. 
  Включает: WireGuard VPN, HTTP/TCP/UDP проксирование, Kubernetes CRD, 
  Docker Compose, SSO/RBAC аутентификацию и web scraping (Amazon, Google, Walmart).
metadata:
  category: infrastructure
  platform: cross-platform
---

# Operation Pangolin

Универсальный AI скилл для управления Pangolin (VPN + Reverse Proxy) с поддержкой Kubernetes, Docker, web scraping и полной автоматизацией.

## Когда использовать

- Нужен VPN для удалённого доступа к ресурсам
- Хочешь опубликовать web-приложение без открытых портов в интернет
- Требуется Kubernetes интеграция (CRD)
- Нужен Docker-compose деплой с Traefik
- Требуется web scraping (Amazon, Google, Walmart)
- Настройка аутентификации и RBAC

## Возможности

### 🛡️ VPN & Remote Access
- Подключение через WireGuard-клиент
- Создание пользователей и назначение ролей
- NAT traversal для сложных сетей
- Zero-trust модель доступа

### 🌐 Reverse Proxy
- HTTP ресурсы с доменами
- TCP проксирование (базы данных, SSH)
- UDP проксирование (игровые серверы, IoT)
- Автоматический SSL/TLS
- Load balancing между несколькими targets

### 🔐 Аутентификация и RBAC
- **SSO** - интеграция с Identity Providers (OIDC)
- **Basic Auth** - логин/пароль
- **Password/Pincode** - простой доступ
- IP/CIDR ограничения доступа
- Country-based правила

### ☸️ Kubernetes
- PangolinOrganization CRD
- PangolinTunnel CRD
- PangolinResource CRD
- PangolinBinding (auto-expose services)
- Auto-discovery организаций

### 🐳 Docker Compose
- Автоматический expose через labels
- Интеграция с Traefik
- DNS через Blocky (VPN-only)
- PostgreSQL + Redis

### 🔍 Web Scraping
- **Google**: AI Mode, SERP, SERP Plus
- **Amazon**: 13 регионов мира
- **Walmart**: products, search

## Использование

### VPN подключение

```
Подключи Pangolin VPN к организации my-org
```

### Создание HTTP ресурса

```
Создай Pangolin ресурс для web app на app.example.com -> localhost:3000
```

### Kubernetes

```
Создай PangolinResource для моего Kubernetes сервиса
```

### Docker Compose

```
Добавь Pangolin labels для моего docker-compose сервиса
```

### Web Scraping

```
Скрапь цену Sony WH-1000XM5 на Amazon US
Найди топ 10 результатов для "AI Agent" в Google
```

## Конфигурация

### YAML Blueprint

```yaml
proxy-resources:
  web-app:
    name: Web Application
    protocol: http
    full-domain: app.example.com
    targets:
      - hostname: localhost
        port: 3000
        method: https
    authentication:
      type: sso
```

### Docker Labels

```yaml
services:
  nginx:
    labels:
      - pangolin.resources.webapp.name=Web App
      - pangolin.resources.webapp.protocol=http
      - pangolin.resources.webapp.full-domain=web.example.com
```

### Kubernetes CRD

```yaml
apiVersion: tunnel.pangolin.io/v1alpha1
kind: PangolinResource
metadata:
  name: my-app
spec:
  tunnelRef:
    name: my-tunnel
  protocol: "http"
  httpConfig:
    subdomain: "app"
  target:
    ip: "my-service.default.svc.cluster.local"
    port: 80
    method: "http"
```

## Troubleshooting

```
Диагностируй Pangolin проблему
Проверь статус туннеля
```

## Links

- [Документация](https://docs.pangolin.net)
- [GitHub](https://github.com/fosrl/pangolin)
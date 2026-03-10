# ┌──────────────────────────────────────────────────────
# │ Email Platform — Makefile
# └──────────────────────────────────────────────────────
.PHONY: help up down restart logs status health build test migrate dkim-gen clean

COMPOSE = docker compose
ROUTER_DIR = ../../services/email-router

help: ## Show commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Docker Compose ─────────────────────

up: ## Start all services
	$(COMPOSE) up -d
	@echo "✅ Email platform started"
	@echo "   Router:     http://localhost:$${EMAIL_ROUTER_PORT:-3100}"
	@echo "   Grafana:    http://localhost:$${GRAFANA_PORT:-3200}"
	@echo "   Prometheus: http://localhost:$${PROMETHEUS_PORT:-9099}"
	@echo "   Rspamd UI:  http://localhost:$${RSPAMD_UI_PORT:-11334}"

up-dev: ## Start core services only (no observability)
	$(COMPOSE) up -d postgres redis postfix opendkim opendmarc rspamd email-router
	@echo "✅ Dev stack started (core only)"

down: ## Stop all services
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

logs: ## Tail all logs
	$(COMPOSE) logs -f --tail=100

logs-router: ## Tail email-router logs
	$(COMPOSE) logs -f --tail=100 email-router

logs-postfix: ## Tail Postfix logs
	$(COMPOSE) logs -f --tail=100 postfix

status: ## Show container status
	$(COMPOSE) ps -a

# ─── Health & Checks ─────────────────────

health: ## Check email-router health
	@curl -sf http://localhost:$${EMAIL_ROUTER_PORT:-3100}/health | python3 -m json.tool || echo "❌ Health check failed"

ready: ## Check email-router readiness
	@curl -sf http://localhost:$${EMAIL_ROUTER_PORT:-3100}/ready | python3 -m json.tool || echo "❌ Readiness check failed"

metrics: ## Fetch Prometheus metrics
	@curl -sf http://localhost:$${EMAIL_ROUTER_PORT:-3100}/metrics | head -50

# ─── Build & Deploy ─────────────────────

build: ## Rebuild email-router image
	$(COMPOSE) build email-router

build-no-cache: ## Rebuild without cache
	$(COMPOSE) build --no-cache email-router

# ─── Database ─────────────────────

migrate: ## Run SQL migrations
	$(COMPOSE) exec postgres psql -U $${PG_USER:-email} -d $${PG_DB:-email_platform} -f /docker-entrypoint-initdb.d/001_initial_schema.sql
	$(COMPOSE) exec postgres psql -U $${PG_USER:-email} -d $${PG_DB:-email_platform} -f /docker-entrypoint-initdb.d/002_seed_default_tenant.sql
	@echo "✅ Migrations applied"

psql: ## Open psql shell
	$(COMPOSE) exec postgres psql -U $${PG_USER:-email} -d $${PG_DB:-email_platform}

# ─── DKIM ─────────────────────

dkim-gen: ## Generate DKIM keys
	bash ./scripts/generate-dkim-keys.sh mansoni.ru mail

# ─── Testing ─────────────────────

test-send: ## Send test email via API
	@echo "Sending test email..."
	@curl -sf -X POST http://localhost:$${EMAIL_ROUTER_PORT:-3100}/email/send \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer YOUR_JWT_TOKEN" \
		-d '{"to":[{"email":"test@example.com"}],"subject":"Test Email","text":"Hello from email-router!","idempotencyKey":"test-001"}' \
		| python3 -m json.tool

test-health: ## Run full health check suite
	@echo "=== Health ===" && curl -sf http://localhost:3100/health | python3 -m json.tool
	@echo "=== Ready ===" && curl -sf http://localhost:3100/ready | python3 -m json.tool
	@echo "=== Queue Stats ===" && echo "(requires admin JWT)"

# ─── Router Development ─────────────────────

router-dev: ## Start router in dev mode (outside Docker)
	cd $(ROUTER_DIR) && npm run dev

router-build: ## Build router TypeScript
	cd $(ROUTER_DIR) && npm run build

router-lint: ## Lint router code
	cd $(ROUTER_DIR) && npm run lint

router-test: ## Run router tests
	cd $(ROUTER_DIR) && npm run test

# ─── Cleanup ─────────────────────

clean: ## Remove all containers and volumes
	$(COMPOSE) down -v --remove-orphans
	@echo "🗑️  All containers and volumes removed"

clean-logs: ## Clean log files
	$(COMPOSE) exec loki rm -rf /loki/chunks/*
	@echo "🗑️  Logs cleaned"

# ─── Backup ─────────────────────

backup-db: ## Backup PostgreSQL
	@mkdir -p ./backups
	$(COMPOSE) exec postgres pg_dump -U $${PG_USER:-email} -d $${PG_DB:-email_platform} -Fc > ./backups/email_platform_$$(date +%Y%m%d_%H%M%S).dump
	@echo "✅ Database backed up to ./backups/"

restore-db: ## Restore PostgreSQL from latest backup
	@LATEST=$$(ls -t ./backups/*.dump 2>/dev/null | head -1); \
	if [ -z "$$LATEST" ]; then echo "❌ No backup found"; exit 1; fi; \
	echo "Restoring from $$LATEST..."; \
	$(COMPOSE) exec -T postgres pg_restore -U $${PG_USER:-email} -d $${PG_DB:-email_platform} --clean --if-exists < "$$LATEST"; \
	echo "✅ Restored"

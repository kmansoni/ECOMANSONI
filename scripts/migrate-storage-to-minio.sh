#!/usr/bin/env bash
# =============================================================================
# migrate-storage-to-minio.sh
# =============================================================================
# Физический перенос файлов из Supabase Storage → MinIO (media.mansoni.ru)
#
# Использование:
#   ./scripts/migrate-storage-to-minio.sh [--dry-run]
#
# Переменные окружения (обязательные):
#   SUPABASE_URL              — https://abc123.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY — service_role JWT из Supabase Dashboard
#   MINIO_ALIAS               — псевдоним mc alias (например: local)
#   MEDIA_DOMAIN              — media.mansoni.ru
#
# Зависимости: mc (MinIO Client), curl, jq, date, mktemp, xargs
# =============================================================================

set -euo pipefail

# =============================================================================
# Конфигурация
# =============================================================================

BUCKETS=(
  "media"
  "post-media"
  "chat-media"
  "voice-messages"
  "reels-media"
  "avatars"
  "stories-media"
)

DRY_RUN=false
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

LOG_FILE="migration-$(date +%Y-%m-%d).log"
PARALLEL_JOBS=4
TMP_DIR=$(mktemp -d)
# Очистка временной директории при выходе
trap 'rm -rf "$TMP_DIR"' EXIT

# =============================================================================
# Цвета и логирование
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() {
  local level="$1"; shift
  local msg="$*"
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${ts} [${level}] ${msg}" | tee -a "$LOG_FILE"
}

info()    { log "INFO " "${CYAN}${*}${NC}"; }
success() { log "OK   " "${GREEN}${*}${NC}"; }
warn()    { log "WARN " "${YELLOW}${*}${NC}"; }
error()   { log "ERROR" "${RED}${*}${NC}"; }

# =============================================================================
# Проверка зависимостей и обязательных переменных окружения
# =============================================================================

check_dependencies() {
  local missing=()
  for cmd in mc curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Отсутствуют зависимости: ${missing[*]}"
    error "Установите недостающие инструменты и повторите запуск."
    exit 1
  fi
  info "Все зависимости найдены: mc, curl, jq ✓"
}

check_env() {
  local missing=()
  for var in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY MINIO_ALIAS MEDIA_DOMAIN; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Не заданы переменные окружения: ${missing[*]}"
    error "Пример: export SUPABASE_URL=https://abc123.supabase.co"
    exit 1
  fi
  info "Переменные окружения проверены ✓"
}

# =============================================================================
# Проверка доступности MinIO alias
# =============================================================================

check_minio_alias() {
  if ! mc alias list "$MINIO_ALIAS" &>/dev/null; then
    error "MinIO alias '${MINIO_ALIAS}' не найден."
    error "Создайте его: mc alias set ${MINIO_ALIAS} http://localhost:9000 ACCESS_KEY SECRET_KEY"
    exit 1
  fi
  info "MinIO alias '${MINIO_ALIAS}' доступен ✓"
}

# =============================================================================
# Вспомогательная функция: Supabase Storage API листинг (рекурсивный)
# Возвращает список путей файлов в $TMP_DIR/${bucket}.list
# =============================================================================

list_bucket_files() {
  local bucket="$1"
  local list_file="${TMP_DIR}/${bucket}.list"
  local prefix=""
  local api_url="${SUPABASE_URL}/storage/v1/object/list/${bucket}"

  info "Листинг бакета: ${bucket}"
  > "$list_file"

  # Supabase Storage list API возвращает до 100 объектов за запрос.
  # Рекурсивный обход реализован через стек префиксов.
  local prefix_stack=("$prefix")

  while [[ ${#prefix_stack[@]} -gt 0 ]]; do
    local current_prefix="${prefix_stack[-1]}"
    unset 'prefix_stack[-1]'

    local offset=0
    local limit=100

    while true; do
      local body
      body=$(jq -n \
        --arg prefix "$current_prefix" \
        --argjson limit $limit \
        --argjson offset $offset \
        '{prefix: $prefix, limit: $limit, offset: $offset, sortBy: {column: "name", order: "asc"}}')

      local response
      response=$(curl -sf \
        -X POST \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "${api_url}" 2>&1) || {
          error "Ошибка при листинге бакета ${bucket} (prefix='${current_prefix}', offset=${offset})"
          error "Ответ: ${response}"
          exit 1
        }

      local count
      count=$(echo "$response" | jq 'length')

      if [[ "$count" -eq 0 ]]; then
        break
      fi

      # Разбиваем на файлы (metadata не null) и «папки» (metadata null → поддиректории)
      while IFS= read -r item; do
        local item_name item_id
        item_name=$(echo "$item" | jq -r '.name')
        item_id=$(echo "$item"   | jq -r '.id')

        if [[ "$item_id" == "null" ]]; then
          # Это «папка» — добавляем её в стек для рекурсивного обхода
          local sub_prefix
          if [[ -z "$current_prefix" ]]; then
            sub_prefix="${item_name}"
          else
            sub_prefix="${current_prefix}/${item_name}"
          fi
          prefix_stack+=("$sub_prefix")
        else
          # Это файл — записываем полный путь
          if [[ -z "$current_prefix" ]]; then
            echo "${item_name}" >> "$list_file"
          else
            echo "${current_prefix}/${item_name}" >> "$list_file"
          fi
        fi
      done < <(echo "$response" | jq -c '.[]')

      if [[ "$count" -lt "$limit" ]]; then
        break
      fi
      offset=$((offset + limit))
    done
  done

  local total_files
  total_files=$(wc -l < "$list_file")
  info "Бакет ${bucket}: найдено ${total_files} файлов"
}

# =============================================================================
# Создать бакет в MinIO если не существует
# =============================================================================

ensure_minio_bucket() {
  local bucket="$1"
  if ! mc ls "${MINIO_ALIAS}/${bucket}" &>/dev/null; then
    if [[ "$DRY_RUN" == "true" ]]; then
      warn "[DRY-RUN] Создание бакета MinIO: ${MINIO_ALIAS}/${bucket}"
    else
      mc mb "${MINIO_ALIAS}/${bucket}"
      # Установить публичную политику чтения (соответствует Supabase public bucket)
      mc anonymous set public "${MINIO_ALIAS}/${bucket}"
      success "Создан бакет MinIO: ${MINIO_ALIAS}/${bucket}"
    fi
  else
    info "Бакет MinIO уже существует: ${MINIO_ALIAS}/${bucket}"
  fi
}

# =============================================================================
# Перенос одного файла: Supabase → MinIO
# Функция экспортируется для использования через xargs -P
# =============================================================================

transfer_file() {
  local bucket="$1"
  local file_path="$2"
  local dry_run="$3"
  local minio_alias="$4"
  local supabase_url="$5"
  local service_role_key="$6"
  local log_file="$7"

  local minio_target="${minio_alias}/${bucket}/${file_path}"
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')

  # Resume: пропускать файлы которые уже есть в MinIO
  if mc stat "${minio_target}" &>/dev/null 2>&1; then
    echo "${ts} [SKIP ] ${bucket}/${file_path} (уже существует)" >> "$log_file"
    echo "SKIP"
    return 0
  fi

  if [[ "$dry_run" == "true" ]]; then
    echo "${ts} [DRY  ] Перенос: ${bucket}/${file_path}" >> "$log_file"
    echo "DRY"
    return 0
  fi

  # Скачиваем из Supabase (в память через pipe → mc pipe)
  local download_url="${supabase_url}/storage/v1/object/${bucket}/${file_path}"

  # Определяем Content-Type по расширению файла (базовая эвристика)
  local ext="${file_path##*.}"
  ext="${ext,,}"  # lowercase
  local content_type="application/octet-stream"
  case "$ext" in
    jpg|jpeg)  content_type="image/jpeg" ;;
    png)       content_type="image/png" ;;
    gif)       content_type="image/gif" ;;
    webp)      content_type="image/webp" ;;
    mp4)       content_type="video/mp4" ;;
    webm)      content_type="video/webm" ;;
    mov)       content_type="video/quicktime" ;;
    mp3)       content_type="audio/mpeg" ;;
    ogg)       content_type="audio/ogg" ;;
    aac)       content_type="audio/aac" ;;
    pdf)       content_type="application/pdf" ;;
  esac

  local http_code
  http_code=$(curl -sf \
    -H "Authorization: Bearer ${service_role_key}" \
    -w "%{http_code}" \
    -o - \
    "${download_url}" 2>>"$log_file" | \
    mc pipe --content-type "${content_type}" "${minio_target}" 2>>"$log_file"; \
    echo "${PIPESTATUS[0]}")

  # Проверяем что файл появился в MinIO
  if mc stat "${minio_target}" &>/dev/null 2>&1; then
    echo "${ts} [OK   ] ${bucket}/${file_path}" >> "$log_file"
    echo "OK"
  else
    echo "${ts} [FAIL ] ${bucket}/${file_path} (http_code=${http_code})" >> "$log_file"
    echo "FAIL"
  fi
}

export -f transfer_file

# =============================================================================
# Перенос всех файлов бакета с параллельной загрузкой и прогрессом
# =============================================================================

migrate_bucket() {
  local bucket="$1"
  local list_file="${TMP_DIR}/${bucket}.list"

  ensure_minio_bucket "$bucket"

  local total_files
  total_files=$(wc -l < "$list_file")

  if [[ "$total_files" -eq 0 ]]; then
    warn "Бакет ${bucket} пуст — пропуск."
    return 0
  fi

  info "Начало переноса бакета '${bucket}': ${total_files} файлов (parallel=${PARALLEL_JOBS})"

  local count_ok=0 count_skip=0 count_fail=0 count_dry=0 current=0
  local results_file="${TMP_DIR}/${bucket}.results"
  > "$results_file"

  # Запускаем xargs -P для параллельной загрузки
  # Каждый worker записывает результат (OK/SKIP/FAIL/DRY) в индивидуальный файл
  local i=0
  while IFS= read -r file_path; do
    i=$((i + 1))
    echo "$file_path"
  done < "$list_file" | \
  xargs -P "$PARALLEL_JOBS" -I{} bash -c \
    'transfer_file "$1" "$2" "$3" "$4" "$5" "$6" "$7" >> "$8"' \
    _ "$bucket" "{}" "$DRY_RUN" "$MINIO_ALIAS" "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" "$LOG_FILE" "$results_file"

  # Подсчёт результатов
  if [[ -f "$results_file" ]]; then
    count_ok=$(grep -c "^OK$"   "$results_file" 2>/dev/null || echo 0)
    count_skip=$(grep -c "^SKIP$" "$results_file" 2>/dev/null || echo 0)
    count_fail=$(grep -c "^FAIL$" "$results_file" 2>/dev/null || echo 0)
    count_dry=$(grep -c "^DRY$"  "$results_file" 2>/dev/null || echo 0)
  fi

  success "Бакет '${bucket}' завершён: OK=${count_ok} SKIP=${count_skip} FAIL=${count_fail} DRY=${count_dry} / TOTAL=${total_files}"

  if [[ "$count_fail" -gt 0 ]]; then
    warn "ВНИМАНИЕ: ${count_fail} файлов не удалось перенести в бакете '${bucket}'. Проверьте лог: ${LOG_FILE}"
  fi

  # Сохраняем статистику по бакету
  echo "${bucket} OK=${count_ok} SKIP=${count_skip} FAIL=${count_fail} TOTAL=${total_files}" >> "${TMP_DIR}/summary.txt"
}

# =============================================================================
# Верификация: сравнение количества файлов Supabase ↔ MinIO
# =============================================================================

verify_bucket() {
  local bucket="$1"
  local list_file="${TMP_DIR}/${bucket}.list"

  local supabase_count
  supabase_count=$(wc -l < "$list_file")

  local minio_count
  minio_count=$(mc ls --recursive "${MINIO_ALIAS}/${bucket}" 2>/dev/null | wc -l || echo 0)

  if [[ "$supabase_count" -eq "$minio_count" ]]; then
    success "[VERIFY] Бакет '${bucket}': Supabase=${supabase_count} MinIO=${minio_count} ✓ совпадает"
  else
    warn "[VERIFY] Бакет '${bucket}': Supabase=${supabase_count} MinIO=${minio_count} ⚠ РАСХОЖДЕНИЕ!"
  fi
}

# =============================================================================
# Итоговый отчёт
# =============================================================================

print_summary() {
  echo ""
  echo "========================================================================"
  echo " ИТОГОВЫЙ ОТЧЁТ МИГРАЦИИ — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "========================================================================"
  if [[ -f "${TMP_DIR}/summary.txt" ]]; then
    cat "${TMP_DIR}/summary.txt"
  fi
  echo "------------------------------------------------------------------------"
  echo " Лог записан в: ${LOG_FILE}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo " РЕЖИМ: DRY-RUN — файлы НЕ переносились"
  fi
  echo "========================================================================"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  echo "" >> "$LOG_FILE"
  info "=========================================================="
  info " Запуск migrate-storage-to-minio.sh"
  info " Время: $(date '+%Y-%m-%d %H:%M:%S')"
  info " DRY_RUN: ${DRY_RUN}"
  info " Бакеты: ${BUCKETS[*]}"
  info "=========================================================="

  check_dependencies
  check_env
  check_minio_alias

  # Фаза 1: листинг всех бакетов
  info "--- Фаза 1: Листинг бакетов Supabase Storage ---"
  for bucket in "${BUCKETS[@]}"; do
    list_bucket_files "$bucket"
  done

  # Фаза 2: перенос файлов
  info "--- Фаза 2: Перенос файлов в MinIO ---"
  for bucket in "${BUCKETS[@]}"; do
    migrate_bucket "$bucket"
  done

  # Фаза 3: верификация (только если не dry-run)
  if [[ "$DRY_RUN" == "false" ]]; then
    info "--- Фаза 3: Верификация ---"
    for bucket in "${BUCKETS[@]}"; do
      verify_bucket "$bucket"
    done
  fi

  print_summary
  success "Миграция завершена."
}

main "$@"

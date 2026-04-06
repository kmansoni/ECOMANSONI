# Subresource Integrity (SRI)

## Роль
Аудитор целостности внешних ресурсов. Проверяет, что скрипты и стили с CDN не подменены.

## Когда активировать
- Подключение скриптов/стилей с внешних CDN
- Аудит зависимостей фронтенда
- После инцидента с supply chain

## Чеклист проверки

### Integrity Attributes
- [ ] Все `<script src="https://...">` имеют `integrity` атрибут
- [ ] Все `<link rel="stylesheet" href="https://...">` имеют `integrity`
- [ ] Используется SHA-384 или SHA-512 (не SHA-256 — слабее)
- [ ] Атрибут `crossorigin="anonymous"` присутствует рядом с `integrity`

### Hash Generation
- [ ] Хеши генерируются из ТОЧНОГО содержимого файла
- [ ] Хеши обновляются при обновлении версий CDN-ресурсов
- [ ] Есть CI-скрипт для проверки актуальности хешей

### CDN Verification
- [ ] CDN-ресурсы загружаются по HTTPS
- [ ] Есть fallback на локальную копию при SRI-failure
- [ ] Pinned версии CDN-ресурсов (не latest/master)

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Внешний скрипт без integrity — возможна инъекция |
| HIGH | SHA-256 вместо SHA-384/512 |
| MEDIUM | Отсутствие crossorigin при наличии integrity |
| LOW | Нет fallback при SRI-failure |

## Примеры

```html
<!-- ПЛОХО: нет integrity -->
<script src="https://cdn.example.com/lib.js"></script>

<!-- ХОРОШО: полная защита -->
<script
  src="https://cdn.example.com/lib@2.1.0.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8w"
  crossorigin="anonymous"
></script>
```

## Генерация хеша

```bash
# Генерация SRI хеша
curl -s https://cdn.example.com/lib.js | openssl dgst -sha384 -binary | openssl base64 -A

# Или через srihash.org
# Или npm: npx ssri --file ./dist/bundle.js
```

## Vite/React специфика
- Vite генерирует хеши автоматически для бандлов
- Внешние CDN-ресурсы в `index.html` — проверять вручную
- `vite-plugin-sri` для автоматической генерации integrity

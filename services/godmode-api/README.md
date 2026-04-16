# G0DM0D3 API

Мульти-модельный AI gateway с AutoTune + STM + Racing.  
Адаптирован из [elder-plinius/G0DM0D3](https://github.com/elder-plinius/G0DM0D3) для интеграции с Claude Code.

## Быстрый старт

```bash
cd services/godmode-api
npm install
cp .env.example .env
# Вписать OPENROUTER_API_KEY в .env
npm run dev
```

Сервер: `http://localhost:3077`

## Endpoints

| Метод | Путь | Описание |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-совместимый (single model) |
| POST | `/v1/race/completions` | Мульти-модельный racing |
| POST | `/v1/autotune/analyze` | Контекстный анализ |
| POST | `/v1/transform` | STM текстовые трансформации |
| GET | `/v1/transform/modules` | Список STM модулей |
| POST | `/v1/feedback` | EMA feedback loop |
| GET | `/v1/feedback/stats` | Статистика обучения |
| GET | `/v1/models` | Модели по tier'ам |
| GET | `/health` | Health check |

## Примеры

### Chat (OpenAI-совместимый)

```bash
curl -X POST http://localhost:3077/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Напиши React хук для debounce"}],
    "model": "nousresearch/hermes-3-llama-3.1-70b",
    "autotune": true,
    "stm_modules": ["hedge_reducer", "direct_mode"]
  }'
```

### Race (параллельные модели)

```bash
curl -X POST http://localhost:3077/v1/race/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Объясни WebRTC в 3 предложениях"}],
    "tier": "fast",
    "top_k": 3
  }'
```

### Virtual Race Models (через chat endpoint)

```bash
curl -X POST http://localhost:3077/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Что такое CRDT?"}],
    "model": "race/smart"
  }'
```

## Фичи

### AutoTune
Автоматическая подстройка параметров под контекст:
- **code** → низкая temperature, высокая frequency_penalty
- **creative** → высокая temperature, низкий top_p
- **analytical** → средняя temperature, высокий presence_penalty
- **conversational** → balanced
- **chaotic** → случайные параметры

### STM (Semantic Transform Modules)
Пост-обработка ответов моделей:
- `hedge_reducer` — убирает "я думаю", "возможно", "наверное"
- `direct_mode` — убирает "конечно!", "отличный вопрос"
- `casual_mode` — снижает формальность
- `curiosity_bias` — добавляет вопросы для exploration

### Racing
3-10 моделей получают один запрос параллельно. Scoring:
- **substance** (40) — длина и содержательность
- **directness** (30) — отсутствие отказов и hedges
- **completeness** (30) — code blocks, списки, структура

### Feedback Loop
EMA (exponential moving average) корректирует AutoTune на основе оценок.

## Модели

| Tier | Кол-во | Примеры |
|---|---|---|
| fast | 7 | Llama 3.1 8B, Gemma 2 9B, Phi-3 |
| standard | 10 | Llama 3.1 70B, Mixtral, Claude 3.5 Haiku |
| smart | 10 | GPT-4o, Claude 3.5 Sonnet, Llama 3.1 405B |

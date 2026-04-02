# Интеграция с ARIA (ARIA Integration)

> Голосовой интерфейс AI агента на базе NVIDIA Riva: Speech-to-Text, Text-to-Speech, NLU pipeline и диалоговое управление.

---

## Содержание

- [Обзор](#обзор)
- [Архитектура ARIA](#архитектура-aria)
- [NVIDIA Riva](#nvidia-riva)
- [Speech-to-Text Pipeline](#speech-to-text-pipeline)
- [Text-to-Speech Pipeline](#text-to-speech-pipeline)
- [NLU Pipeline](#nlu-pipeline)
- [Диалоговое управление](#диалоговое-управление)
- [Интеграция с Оркестратором](#интеграция-с-оркестратором)
- [Конфигурация](#конфигурация)
- [Деплоймент](#деплоймент)

---

## Обзор

**ARIA** (Autonomous Reasoning & Interaction Agent) — голосовой фронтенд системы. Позволяет разработчику взаимодействовать с AI агентом полностью голосом: диктовать задачи, получать аудиальные ответы, управлять IDE без рук.

```
Разработчик говорит
       │
       ▼
  Микрофон → STT (NVIDIA Riva)
       │
       ▼
  Транскрипция → NLU Pipeline
       │
       ▼
  Намерение + Сущности → Orchestration System
       │
       ▼
  Ответ текстом → TTS (NVIDIA Riva)
       │
       ▼
  Аудио → Динамики
```

### Ключевые возможности

- Потоковое распознавание речи (< 300 мс задержки)
- Синтез речи с настраиваемым голосом и темпом
- Многоязычная поддержка (русский, английский и др.)
- Wake-word активация ("Эй, Ария")
- Контекстное распознавание (понимает технические термины)
- Работа офлайн (локальные модели Riva)

---

## Архитектура ARIA

```mermaid
graph LR
    subgraph CLIENT["Клиент (VS Code / Desktop)"]
        MIC[Микрофон]
        SPK[Динамики]
        WW[Wake-Word\nDetector]
    end

    subgraph RIVA["NVIDIA Riva Server"]
        ASR[ASR Service\nSpeech-to-Text]
        TTS_SVC[TTS Service\nText-to-Speech]
        NLP[NLP Service\n(опционально)]
    end

    subgraph BACKEND["AI Backend"]
        NLU[NLU Pipeline\nIntent + Entities]
        DM[Dialogue Manager]
        ORCH[Orchestration\nSystem]
    end

    MIC --> WW
    WW -->|активирован| ASR
    ASR -->|транскрипция| NLU
    NLU -->|намерение| DM
    DM -->|задача| ORCH
    ORCH -->|ответ| DM
    DM -->|текст| TTS_SVC
    TTS_SVC -->|аудио| SPK
```

---

## NVIDIA Riva

[NVIDIA Riva](https://developer.nvidia.com/riva) — платформа для построения речевых AI приложений. Взаимодействие через **gRPC**.

### Подключение

```python
import riva.client

# Инициализация Riva клиента
auth = riva.client.Auth(uri="localhost:50051")
asr_service = riva.client.ASRService(auth)
tts_service = riva.client.SpeechSynthesisService(auth)
```

### Требования

| Компонент | Требование |
|-----------|-----------|
| GPU | NVIDIA GPU с поддержкой CUDA 11.8+ |
| RAM (GPU) | Минимум 8 GB VRAM |
| ОС | Linux (рекомендуется Ubuntu 20.04+) |
| Docker | Riva контейнеры |
| Сеть | gRPC port 50051 |

### Запуск Riva сервера

```bash
# Скачать и запустить Riva Quick Start
ngc registry resource download-version \
  nvidia/riva/riva_quickstart:2.14.0

cd riva_quickstart
bash riva_init.sh    # Загрузка моделей (~15 GB)
bash riva_start.sh   # Запуск gRPC сервера
```

---

## Speech-to-Text Pipeline

### Потоковое распознавание (Streaming ASR)

```python
import riva.client
import pyaudio

CHUNK_SIZE = 1600  # 100ms при 16kHz

async def stream_asr(riva_asr: riva.client.ASRService):
    """Потоковое распознавание с микрофона."""
    config = riva.client.StreamingRecognitionConfig(
        config=riva.client.RecognitionConfig(
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=16000,
            language_code="ru-RU",
            max_alternatives=1,
            enable_automatic_punctuation=True,
            audio_channel_count=1,
        ),
        interim_results=True,  # Промежуточные результаты
    )

    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=16000,
        input=True,
        frames_per_buffer=CHUNK_SIZE
    )

    def audio_generator():
        while True:
            yield stream.read(CHUNK_SIZE, exception_on_overflow=False)

    async for response in riva_asr.streaming_response_generator(
        audio_chunks=audio_generator(),
        streaming_config=config
    ):
        for result in response.results:
            if result.is_final:
                yield result.alternatives[0].transcript
```

### Поддерживаемые языки

| Код | Язык | Модель |
|-----|------|--------|
| `ru-RU` | Русский | `ru-RU-conformer` |
| `en-US` | Английский | `en-US-conformer` |
| `en-GB` | Английский (UK) | `en-GB-conformer` |

---

## Text-to-Speech Pipeline

### Синтез речи

```python
import riva.client
import sounddevice as sd
import numpy as np

async def synthesize_and_play(
    text: str,
    tts_service: riva.client.SpeechSynthesisService,
    voice_name: str = "Russian-Female",
    speaking_rate: float = 1.0
):
    """Синтезировать текст и воспроизвести через динамики."""
    responses = tts_service.synthesize_online(
        text=text,
        voice_name=voice_name,
        language_code="ru-RU",
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
        sample_rate_hz=22050,
        speaking_rate=speaking_rate
    )

    audio_chunks = []
    for response in responses:
        audio_chunks.append(
            np.frombuffer(response.audio, dtype=np.int16)
        )

    audio_data = np.concatenate(audio_chunks)
    sd.play(audio_data, samplerate=22050)
    sd.wait()
```

### Доступные голоса

| Имя голоса | Язык | Пол | Характер |
|-----------|------|-----|----------|
| `Russian-Female` | ru-RU | Ж | Нейтральный |
| `Russian-Female-1` | ru-RU | Ж | Профессиональный |
| `Russian-Male` | ru-RU | М | Нейтральный |
| `English-US-Female` | en-US | Ж | Casual |

---

## NLU Pipeline

### Извлечение намерений и сущностей

```python
# ai_engine/aria/nlu_pipeline.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class ParsedIntent:
    intent: str              # "write_code" | "explain_code" | "run_tests" | ...
    confidence: float        # 0.0–1.0
    entities: dict[str, str] # {"file": "auth.py", "language": "python"}
    raw_text: str            # Исходная транскрипция

class NLUPipeline:
    """
    Классификация намерений из транскрипции речи.
    Использует LLM (GPT-4o) с few-shot примерами.
    """

    INTENT_PROMPT = """
    Определи намерение пользователя из текста.
    
    Намерения: write_code, explain_code, run_tests, fix_bug,
               read_file, create_file, navigate_to, search_in_project,
               git_commit, git_push, open_terminal, general_question
    
    Текст: {transcript}
    
    Ответь JSON: {"intent": "...", "confidence": 0.95, "entities": {...}}
    """

    async def parse(self, transcript: str) -> ParsedIntent:
        response = await self.llm.complete(
            self.INTENT_PROMPT.format(transcript=transcript)
        )
        data = json.loads(response)
        return ParsedIntent(
            intent=data["intent"],
            confidence=data["confidence"],
            entities=data.get("entities", {}),
            raw_text=transcript
        )
```

### Таблица намерений

| Intent | Пример фразы | Действие |
|--------|-------------|----------|
| `write_code` | "Напиши функцию для сортировки" | Передать в Code Agent |
| `explain_code` | "Объясни этот файл" | Передать в Code Analyst Agent |
| `run_tests` | "Запусти тесты" | Терминал: `pytest` |
| `fix_bug` | "Исправь ошибку в строке 42" | Debug Agent |
| `navigate_to` | "Открой файл auth.py" | VS Code: `openTextDocument` |
| `git_commit` | "Сделай коммит с сообщением..." | Терминал: `git commit` |
| `general_question` | "Что такое Docker?" | General Agent |

---

## Диалоговое управление

### Wake-Word активация

```python
# Простая реализация через Porcupine (Picovoice)
import pvporcupine
import pyaudio

class WakeWordDetector:
    def __init__(self, keyword: str = "aria"):
        self.porcupine = pvporcupine.create(
            keywords=[keyword],
            sensitivities=[0.7]
        )

    def listen(self) -> bool:
        """Блокирующее ожидание wake-word."""
        pa = pyaudio.PyAudio()
        audio_stream = pa.open(
            rate=self.porcupine.sample_rate,
            channels=1,
            format=pyaudio.paInt16,
            input=True,
            frames_per_buffer=self.porcupine.frame_length
        )
        while True:
            pcm = audio_stream.read(self.porcupine.frame_length)
            pcm = struct.unpack('h' * self.porcupine.frame_length, pcm)
            if self.porcupine.process(pcm) >= 0:
                return True  # Wake-word обнаружен
```

### Диалоговый контекст

ARIA сохраняет контекст диалога через Memory Manager:

```python
class ARIADialogueManager:
    def __init__(self, memory_manager: MemoryManager):
        self.memory = memory_manager
        self.current_topic: Optional[str] = None

    async def handle_utterance(self, transcript: str) -> str:
        # Добавить реплику в рабочую память
        self.memory.process_message("user", transcript)

        # Извлечь намерение с учётом контекста
        context = self.memory.get_relevant_context(transcript)
        intent = await self.nlu.parse(transcript)

        # Диспетчеризация к оркестратору
        result = await self.orchestrator.handle(intent, context)

        # Сохранить ответ в памяти
        self.memory.process_message("assistant", result)

        return result
```

---

## Интеграция с Оркестратором

### Маршрутизация голосовых команд

```python
# Голосовой запрос → оркестратор
VOICE_TO_AGENT_MAPPING = {
    "write_code":    "code_implementation_agent",
    "explain_code":  "code_analysis_agent",
    "run_tests":     "terminal_agent",
    "fix_bug":       "debug_agent",
    "navigate_to":   "vscode_agent",
    "git_commit":    "terminal_agent",
    "general_question": "general_agent",
}
```

### Голосовая обратная связь

Оркестратор возвращает результат в ARIA для озвучивания:

```python
response = await orchestrator.execute(task)

# Генерация краткого голосового отчёта
voice_response = await llm.summarize_for_voice(
    response.full_text,
    max_words=50,  # Голосовой ответ должен быть кратким
    style="conversational"
)

await aria.speak(voice_response)
```

---

## Конфигурация

```python
# ai_engine/aria/config.py

ARIA_CONFIG = {
    "riva": {
        "server_uri": "localhost:50051",
        "use_ssl": False,
        "ssl_cert": None,
    },
    "asr": {
        "language_code": "ru-RU",
        "model": "conformer-en-US-asr-streaming",
        "sample_rate_hz": 16000,
        "enable_punctuation": True,
        "interim_results": True,
    },
    "tts": {
        "language_code": "ru-RU",
        "voice_name": "Russian-Female",
        "sample_rate_hz": 22050,
        "speaking_rate": 1.0,
    },
    "wake_word": {
        "enabled": True,
        "keyword": "aria",
        "sensitivity": 0.7,
    },
    "nlu": {
        "llm_model": "gpt-4o",
        "confidence_threshold": 0.75,
    }
}
```

---

## Деплоймент

### Docker Compose

```yaml
# docker-compose.aria.yml
version: "3.9"
services:
  riva:
    image: nvcr.io/nvidia/riva/riva-speech:2.14.0-servicemaker
    runtime: nvidia
    ports:
      - "50051:50051"
    volumes:
      - ./riva-models:/opt/riva/models
    environment:
      - NVIDIA_VISIBLE_DEVICES=0

  aria-service:
    build: ./ai_engine/aria
    depends_on:
      - riva
    environment:
      - RIVA_URI=riva:50051
      - BACKEND_URL=http://backend:8000
    volumes:
      - /dev/snd:/dev/snd  # Доступ к аудиоустройствам
    devices:
      - /dev/snd
```

### CPU-режим (без GPU)

Для разработки без NVIDIA GPU можно использовать облачный Riva через NVIDIA AI Enterprise или альтернативы:

| Альтернатива | STT | TTS | Качество |
|-------------|-----|-----|---------|
| NVIDIA Riva (GPU) | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| Whisper (OpenAI) | ✅ | ❌ | ⭐⭐⭐⭐ |
| Google Cloud STT/TTS | ✅ | ✅ | ⭐⭐⭐⭐ |
| Azure Cognitive Services | ✅ | ✅ | ⭐⭐⭐⭐ |
| Vosk (офлайн) | ✅ | ❌ | ⭐⭐⭐ |

---

## Связанные разделы

- [Разговорный AI](../conversational-ai/README.md) — управление диалогом и тон общения
- [Ядро оркестратора](../orchestrator-core/README.md) — диспетчеризация голосовых задач
- [ARIA документация](../../../docs/ARIA_ASSISTANT.md) — системный промпт и личность ARIA

---

*Версия: 1.0.0 | Зависимости: NVIDIA Riva 2.14+, PyAudio, sounddevice*

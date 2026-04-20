# Autonomous Voice Learning Foundation

This module adds a production-oriented foundation for multilingual voice learning,
address extraction, hotspot detection, and feedback-driven adaptation inside the
existing ARIA stack.

## Scope

Implemented in this foundation layer:

- rule-based multilingual address parsing with explicit Russian corpus support
- novelty scoring for rare and previously unseen address patterns
- hotspot packaging for rapid synthetic augmentation and targeted fine-tuning
- SQLite-backed persistence for raw utterances, training samples, feedback, patterns, and hotspots
- FastAPI-ready service layer for audio/search ingestion, corrections, validation, and status

Not implemented yet in this foundation layer:

- real ASR inference pipeline
- live geocoder adapters to Nominatim, Yandex, 2GIS, Google
- TTS synthesis workers
- LoRA fine-tuning jobs
- canary rollout controller tied to serving infrastructure

## Core Files

- `models.py` — typed domain models for parsed addresses, novelty, validation, hotspots
- `parser.py` — locale-aware parsing with Russian `корпус` patterns
- `novelty.py` — hotspot detection and novelty scoring
- `storage.py` — local persistence for the learning loop
- `service.py` — orchestration surface used by the API layer

## Example

```python
from ai_engine.voice_learning import VoiceLearningService

service = VoiceLearningService()
result = service.ingest_utterance(
    user_id="demo-user",
    transcript="Чароитовая 1 корпус 4",
    source="voice",
    language_code="ru",
    user_context={"city": "Новосибирск", "country": "RU"},
)

print(result["parsed_address"])
print(result["novelty"])
print(result["hotspot"])
```

## Address Hotspot Behavior

For a rare address like `Чароитовая 1 корпус 4`, the module will:

1. normalize and parse the address
2. validate it heuristically with locality bias
3. compute novelty score
4. create hotspot variants such as `Чароитовая улица дом 1 корпус 4` and `1 корпус 4 Чароитовая`
5. generate synthetic TTS job descriptors for accent-aware augmentation
6. persist the pattern for future retraining and ranking
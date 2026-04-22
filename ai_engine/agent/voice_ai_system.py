#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎙️ Voice AI — Whisper + TTS для голоса.

Возможности:
- Speech to Text ( Whisper)
- Text to Speech (TTS)
- Voice commands
- Audio transcription
"""

import base64
import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class TTSProvider(Enum):
    """TTS провайдеры."""
    AZURE = "azure"
    GOOGLE = "google"
    COQUI = "coqui"
    ELEVENLABS = "elevenlabs"


@dataclass
class TranscriptionResult:
    """Результат транскрипции."""
    text: str
    language: str = ""
    confidence: float = 0.0


@dataclass
class SpeechResult:
    """Результат синтеза."""
    audio_path: str = ""
    duration: float = 0.0


class WhisperSTT:
    """
    Speech to Text через OpenAI Whisper.

    Поддерживает:
    - tiny, base, small, medium, large модели
    - Multiple languages
    - Timestamps
    """

    def __init__(self, model: str = "base"):
        """
        Args:
            model: Модель whisper (tiny/base/small/medium/large)
        """
        self.model = model

    def install(self) -> bool:
        """Установить whisper."""
        try:
            subprocess.run(
                ["pip", "install", "openai-whisper"],
                capture_output=True,
            )
            return True
        except:
            return False

    def transcribe(
        self,
        audio_path: str,
        language: str = "ru",
        task: str = "transcribe",
    ) -> TranscriptionResult:
        """
        Транскрибировать аудио.

        Args:
            audio_path: Путь к аудио.
            language: Язык (ru/en/uk и т.д.)
            task: transcribe or translate

        Returns:
            TranscriptionResult.
        """
        try:
            import whisper
            
            model = whisper.load_model(self.model)
            result = model.transcribe(
                audio_path,
                language=language,
                task=task,
            )
            
            return TranscriptionResult(
                text=result["text"],
                language=language,
                confidence=result.get("segments", [{}])[0].get("avg_logprob", 0),
            )
        except Exception as e:
            return TranscriptionResult(text=f"Error: {e}")

    def transcribe_bytes(
        self,
        audio_bytes: bytes,
        language: str = "ru",
    ) -> TranscriptionResult:
        """Транскрибировать из байт."""
        # Сохраняем во временный файл
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(audio_bytes)
            temp_path = f.name
        
        try:
            return self.transcribe(temp_path, language)
        finally:
            os.unlink(temp_path)


class TTSEngine:
    """
    Text to SpeechEngine.

    Провайдеры:
    - Azure
    - Google Cloud
    - Coqui (open source)
    - ElevenLabs
    """

    def __init__(self, provider: TTSProvider = TTSProvider.AZURE):
        self.provider = provider
        self._api_key = None

    def set_api_key(self, key: str) -> None:
        """Установить API ключ."""
        self._api_key = key

    def speak(
        self,
        text: str,
        output_path: str = "output.mp3",
        voice: str = "ru-RU-DariaNeural",
        speed: float = 1.0,
    ) -> SpeechResult:
        """
        Синтезировать речь.

        Args:
            text: Текст для синтеза.
            output_path: Путь для сохранения.
            voice: Голос.
            speed: Скорость (0.5-2.0).

        Returns:
            SpeechResult.
        """
        if self.provider == TTSProvider.AZURE:
            return self._azure_tts(text, output_path, voice, speed)
        elif self.provider == TTSProvider.GOOGLE:
            return self._google_tts(text, output_path)
        elif self.provider == TTSProvider.COQUI:
            return self._coqui_tts(text, output_path)
        elif self.provider == TTSProvider.ELEVENLABS:
            return self._elevenlabs_tts(text, output_path)
        
        return SpeechResult()

    def _azure_tts(
        self,
        text: str,
        output_path: str,
        voice: str,
        speed: float,
    ) -> SpeechResult:
        """Azure TTS."""
        try:
            import azure.cognitiveservices.speech as speechsdk
            
            speech_config = speechsdk.SpeechConfig(
                subscription=self._api_key or os.environ.get("AZURE_SPEECH_KEY"),
                region="westeurope",
            )
            
            audio_config = speechsdk.AudioConfig(
                audio_filename=output_path
            )
            
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )
            
            # Voice voice
            voice_str = f"ru-RU-DariaNeural"
            speech_config.speech_synthesis_voice_name = voice_str
            
            ssml = f"""
            <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'>
                <voice name='{voice}'>
                    <prosody rate='{speed}'>{text}</prosody>
                </voice>
            </speak>
            """
            
            result = synthesizer.speak_ssml_async(ssml).get()
            
            return SpeechResult(
                audio_path=output_path,
                duration=len(text) / 5,  # Примерно
            )
        except Exception as e:
            return SpeechResult(audio_path=f"Error: {e}")

    def _google_tts(self, text: str, output_path: str) -> SpeechResult:
        """Google TTS."""
        # Stub - требует google-cloud-texttotpeech
        return SpeechResult(audio_path="Requires google-cloud-texttotpeech")

    def _coqui_tts(self, text: str, output_path: str) -> SpeechResult:
        """Coqui TTS (open source)."""
        try:
            subprocess.run([
                "tts",
                f"--text '{text}'",
                f"--out_path {output_path}",
            ], capture_output=True)
            
            return SpeechResult(audio_path=output_path)
        except Exception as e:
            return SpeechResult(audio_path=f"Error: {e}")

    def _elevenlabs_tts(self, text: str, output_path: str) -> SpeechResult:
        """ElevenLabs TTS."""
        if not self._api_key:
            return SpeechResult(audio_path="API key required")
        
        # API call
        import requests
        
        response = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": self._api_key},
            json={"text": text},
        )
        
        if response.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(response.content)
            
            return SpeechResult(audio_path=output_path)
        
        return SpeechResult(audio_path=f"Error: {response.text}")


class VoiceAI:
    """
    Главная Voice AI система.

    Combines STT + TTS.
    """

    def __init__(
        self,
        stt_model: str = "base",
        tts_provider: TTSProvider = TTSProvider.AZURE,
    ):
        self.stt = WhisperSTT(stt_model)
        self.tts = TTSEngine(tts_provider)

    def set_tts_key(self, key: str) -> None:
        """Установить TTS ключ."""
        self.tts.set_api_key(key)

    def speech_to_text(self, audio_path: str) -> TranscriptionResult:
        """Speech → Text."""
        return self.stt.transcribe(audio_path)

    def text_to_speech(
        self,
        text: str,
        output_path: str = "output.mp3",
    ) -> SpeechResult:
        """Text → Speech."""
        return self.tts.speak(text, output_path)

    def voice_command(
        self,
        audio_path: str,
        execute_fn: Optional[callable] = None,
    ) -> str:
        """
        Выполнить голосовую команду.

        Args:
            audio_path: Путь к аудио.
            execute_fn: Функция для выполнения.

        Returns:
            Результат.
        """
        # Transcription
        trans = self.speech_to_text(audio_path)
        
        if execute_fn:
            return execute_fn(trans.text)
        
        return trans.text


# =============================================================================
# Глобальный instance
# =============================================================================

_voice_ai: Optional[VoiceAI] = None


def get_voice_ai() -> VoiceAI:
    """Получить Voice AI."""
    global _voice_ai
    if _voice_ai is None:
        _voice_ai = VoiceAI()
    return _voice_ai


if __name__ == "__main__":
    voice = get_voice_ai()
    print("🎙️ Voice AI ready")
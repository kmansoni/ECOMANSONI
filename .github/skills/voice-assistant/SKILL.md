---
name: voice-assistant
description: >-
  Голосовой помощник для навигации: Web Speech API, русский TTS, speed warnings,
  turn-by-turn инструкции, human-like паузы. Use when: navigation voice, TTS,
  speech synthesis, turn instructions, speed alerts.
license: Apache 2.0
---

# Voice Assistant — Голосовой помощник для навигации

Голосовое сопровождение навигации с русским TTS и safety-critical speed warnings.

## Когда использовать

- Навигация с голосовыми подсказками
- Speed limit warnings (safety-critical)
- Turn-by-turn инструкции
- Озвучка POI и точек интереса
- Режим "кофе-кофе" (ручное управление голосом)

## Web Speech API Setup

```typescript
// src/lib/navigation/voiceAssistant.ts
export type SoundMode = 'mute' | 'alert_only' | 'full';

interface VoiceSettings {
  selectedVoice: string;
  volume: number;
  rate: number;
  pitch: number;
  soundMode: SoundMode;
}

class VoiceAssistant {
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private settings: VoiceSettings;
  
  constructor(settings: VoiceSettings) {
    this.settings = settings;
    this.initVoices();
  }
  
  private initVoices() {
    return new Promise<void>((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.voices = voices.filter(v => v.lang.startsWith('ru'));
        resolve();
      } else {
        speechSynthesis.onvoiceschanged = () => {
          this.voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('ru'));
          resolve();
        };
      }
    });
  }
  
  speak(text: string, priority: 'normal' | 'safety' = 'normal') {
    // Safety-critical: speed_warning ALWAYS spoken in non-mute modes
    if (priority === 'safety' && this.settings.soundMode === 'mute') {
      return; // Muted - don't speak even safety alerts
    }
    
    if (this.settings.soundMode === 'mute' && priority !== 'safety') {
      return;
    }
    
    this.cancel();
    
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.volume = this.settings.volume;
    this.utterance.rate = this.settings.rate;
    this.utterance.pitch = this.settings.pitch;
    this.utterance.lang = 'ru-RU';
    
    const voice = this.voices.find(v => v.name.includes(this.settings.selectedVoice)) 
               || this.voices[0];
    if (voice) this.utterance.voice = voice;
    
    speechSynthesis.speak(this.utterance);
  }
  
  cancel() {
    speechSynthesis.cancel();
  }
}
```

## Speed Warning (Safety-Critical)

```typescript
// src/lib/navigation/speedWarning.ts
const SPEED_WARNING_THRESHOLD = 5; // km/h over limit

export function checkSpeedWarning(
  currentSpeed: number,
  speedLimit: number,
  soundMode: SoundMode,
  lastWarningTime: number
): { shouldWarn: boolean; message?: string } {
  const overLimit = currentSpeed - speedLimit;
  
  // Must warn if over threshold
  if (overLimit > SPEED_WARNING_THRESHOLD) {
    const timeSinceLast = Date.now() - lastWarningTime;
    if (timeSinceLast > 10000) { // Don't spam
      return {
        shouldWarn: true,
        message: `Снизьте скорость. Лимит ${speedLimit} километров в час`
      };
    }
  }
  
  return { shouldWarn: false };
}

// In navigator hook
useEffect(() => {
  if (navigatorSettings.soundMode !== 'mute') {
    const warning = checkSpeedWarning(
      speed, speedLimit, navigatorSettings.soundMode, lastWarningRef.current
    );
    if (warning.shouldWarn) {
      voiceAssistant.speak(warning.message!, 'safety');
      lastWarningRef.current = Date.now();
    }
  }
}, [speed, speedLimit]);
```

## Turn-by-Turn Instructions

```typescript
// src/lib/navigation/turnInstructions.ts
interface TurnInstruction {
  type: 'turn-left' | 'turn-right' | 'straight' | 'u-turn' | 'arrive';
  distance: number;
  roadName?: string;
  bearings: [number, number];
}

class TurnInstructionGenerator {
  private static ROAD_TYPES: Record<string, string> = {
    'motorway': 'автомагистраль',
    'trunk': 'трасса',
    'primary': 'шоссе',
    'secondary': 'главная улица',
    'tertiary': 'улица',
    'residential': 'переулок'
  };
  
  generate(instruction: TurnInstruction): string {
    const road = instruction.roadName || this.ROAD_TYPES[this.getRoadType(instruction)] || 'безымянная дорога';
    
    switch (instruction.type) {
      case 'turn-left':
        return `Поверните налево на ${road}. Едьте ${this.formatDistance(instruction.distance)}`;
      case 'turn-right':
        return `Поверните направо на ${road}. Едьте ${this.formatDistance(instruction.distance)}`;
      case 'straight':
        return `Едьте прямо через ${this.formatDistance(instruction.distance)}`;
      case 'u-turn':
        return `Развернитесь на ${road}. Едьте ${this.formatDistance(instruction.distance)}`;
      case 'arrive':
        return `Вы приехали. Прибыли на ${road}`;
    }
  }
  
  private formatDistance(meters: number): string {
    if (meters < 1000) return `${meters} метров`;
    return `${(meters / 1000).toFixed(1)} километров`;
  }
  
  private getRoadType(instruction: TurnInstruction): string {
    return instruction.type;
  }
}

// Human-like filler patterns
const FILLERS = [
  'мгновение...',
  'секунду...',
  'ещё секунда...',
  ''
];

function speakWithFiller(voice: VoiceAssistant, text: string) {
  const filler = FILLERS[Math.floor(Math.random() * FILLERS.length)];
  if (filler) {
    setTimeout(() => voice.speak(text), 300);
  } else {
    voice.speak(text);
  }
}
```

## Integration with Navigator

```typescript
// src/hooks/useVoiceNavigation.ts
import { useStore } from '~/stores/navigatorSettingsStore';

export function useVoiceNavigation() {
  const { soundMode, selectedVoice, volume } = useStore();
  const voiceAssistant = useMemo(() => 
    new VoiceAssistant({ soundMode, selectedVoice, volume, rate: 1.0, pitch: 1.0 }),
    [soundMode, selectedVoice, volume]
  );
  
  const announce = useCallback((text: string, safety = false) => {
    voiceAssistant.speak(text, safety ? 'safety' : 'normal');
  }, [voiceAssistant]);
  
  return { announce, voiceAssistant };
}
```

## Checklist

- [ ] Web Speech API с русским голосом
- [ ] `speed_warning` ВСЕГДА spoken в non-mute (safety-critical)
- [ ] Volume из store применяется к utterance.volume
- [ ] Голос выбирается из navigatorSettings.selectedVoice
- [ ] Turn-by-turn с русскими названиями дорог
- [ ] Human-like паузы между фразами
- [ ] Отмена предыдущей речи перед новой
- [ ] Speed warnings с throttling (не спам)
/**
 * Генерация субтитров для видео через Web Speech API (SpeechRecognition).
 * Формат: WebVTT.
 */

export interface VTTCue {
  startTime: number; // секунды
  endTime: number;
  text: string;
}

/**
 * Парсинг WebVTT текста в массив cues.
 */
export function parseCaptions(vttText: string): VTTCue[] {
  const cues: VTTCue[] = [];
  const lines = vttText.split('\n');
  let i = 0;

  // Пропустить заголовок WEBVTT
  while (i < lines.length && !lines[i].includes('-->')) i++;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map(s => s.trim());
      const startTime = parseVTTTime(startStr);
      const endTime = parseVTTTime(endStr);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      if (textLines.length > 0) {
        cues.push({ startTime, endTime, text: textLines.join('\n') });
      }
    } else {
      i++;
    }
  }

  return cues;
}

function parseVTTTime(str: string): number {
  const parts = str.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str);
}

function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`;
}

function buildVTT(cues: VTTCue[]): string {
  const lines = ['WEBVTT', ''];
  cues.forEach((cue, idx) => {
    lines.push(String(idx + 1));
    lines.push(`${formatVTTTime(cue.startTime)} --> ${formatVTTTime(cue.endTime)}`);
    lines.push(cue.text);
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Генерирует субтитры для видеоэлемента через Web Speech API.
 * Возвращает Blob с WebVTT содержимым.
 */
export function generateCaptions(videoElement: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reject(new Error('Web Speech API не поддерживается в этом браузере'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'ru-RU';

    const cues: VTTCue[] = [];
    const startTime = Date.now();

    recognition.onresult = (event: any) => {
      const now = (Date.now() - startTime) / 1000;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            cues.push({
              startTime: Math.max(0, now - 3),
              endTime: now,
              text,
            });
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      reject(new Error(`Speech recognition error: ${event.error}`));
    };

    recognition.onend = () => {
      const vttText = buildVTT(cues);
      resolve(new Blob([vttText], { type: 'text/vtt' }));
    };

    // Запускаем распознавание на время видео
    recognition.start();

    const duration = videoElement.duration > 0 ? videoElement.duration * 1000 : 60000;
    setTimeout(() => {
      recognition.stop();
    }, Math.min(duration, 300000)); // максимум 5 минут
  });
}

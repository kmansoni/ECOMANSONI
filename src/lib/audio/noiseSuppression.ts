/**
 * Шумоподавление через Web Audio API.
 * High-pass фильтр (80Hz) + noise gate с мягким attack/release.
 *
 * Цепочка: source → highpass(80Hz) → analyser → gate(GainNode) → destination
 * Анализатор измеряет RMS и плавно регулирует gain gate:
 *   RMS > threshold → gain 1.0 (пропустить)
 *   RMS < threshold → gain 0.05 (почти тишина)
 */

import { logger } from '@/lib/logger';

const NOISE_FLOOR_RMS = 0.008;  // -42dB порог шума
const ATTACK_MS = 20;           // Время открытия gate
const RELEASE_MS = 100;         // Время закрытия gate
const GATE_CLOSED_GAIN = 0.05;  // Остаточный gain при закрытом gate
const HIGHPASS_FREQ = 80;       // Частота среза высокочастотного фильтра
const ANALYSIS_FFT_SIZE = 256;  // Размер буфера для анализа

export class NoiseSuppressor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private gate: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private enabled = true;
  private smoothGain = 1.0;
  private readonly sourceStream: MediaStream;

  constructor(stream: MediaStream) {
    this.sourceStream = stream;
    this.buildGraph();
  }

  private buildGraph(): void {
    try {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaStreamSource(this.sourceStream);
      this.destination = this.ctx.createMediaStreamDestination();

      // High-pass фильтр — убирает гул вентилятора/кондиционера
      this.highpass = this.ctx.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = HIGHPASS_FREQ;
      this.highpass.Q.value = 0.7;

      // Анализатор RMS уровня
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = ANALYSIS_FFT_SIZE;

      // Gate (GainNode) — мягко открывается/закрывается
      this.gate = this.ctx.createGain();
      this.gate.gain.value = 1.0;

      // Цепочка: source → highpass → analyser → gate → destination
      this.source.connect(this.highpass);
      this.highpass.connect(this.analyser);
      this.analyser.connect(this.gate);
      this.gate.connect(this.destination);

      this.startProcessing();
      logger.info('[NoiseSuppressor] Граф обработки создан');
    } catch (error) {
      logger.error('[NoiseSuppressor] Ошибка создания графа', { error });
      this.close();
    }
  }

  private startProcessing(): void {
    if (!this.analyser || !this.gate || !this.ctx) return;

    const dataArray = new Float32Array(this.analyser.fftSize);

    const process = (): void => {
      if (!this.analyser || !this.gate || !this.ctx) return;

      this.analyser.getFloatTimeDomainData(dataArray);

      // Вычисляем RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (this.enabled) {
        const targetGain = rms > NOISE_FLOOR_RMS ? 1.0 : GATE_CLOSED_GAIN;

        // Плавная интерполяция для избежания щелчков
        const timeConstant = targetGain > this.smoothGain
          ? ATTACK_MS / 1000
          : RELEASE_MS / 1000;
        const framesPerAnalysis = this.analyser.fftSize / this.ctx.sampleRate;
        const alpha = 1 - Math.exp(-framesPerAnalysis / timeConstant);
        this.smoothGain += alpha * (targetGain - this.smoothGain);

        this.gate.gain.setTargetAtTime(this.smoothGain, this.ctx.currentTime, 0.01);
      } else {
        this.gate.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.01);
      }

      this.rafId = requestAnimationFrame(process);
    };

    this.rafId = requestAnimationFrame(process);
  }

  /** Возвращает обработанный MediaStream (замена оригинального аудио). */
  getProcessedStream(): MediaStream | null {
    return this.destination?.stream ?? null;
  }

  /** Включить/выключить шумоподавление (bypass). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    logger.debug('[NoiseSuppressor] Состояние изменено', { enabled: on });
  }

  /** Освобождает все ресурсы AudioContext. */
  close(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.source?.disconnect();
    this.highpass?.disconnect();
    this.analyser?.disconnect();
    this.gate?.disconnect();

    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => { /* ignore */ });
    }

    this.source = null;
    this.highpass = null;
    this.analyser = null;
    this.gate = null;
    this.destination = null;
    this.ctx = null;

    logger.info('[NoiseSuppressor] Ресурсы освобождены');
  }
}

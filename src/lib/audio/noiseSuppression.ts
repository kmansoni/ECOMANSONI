/**
 * Шумоподавление через Web Audio API.
 *
 * Важный момент:
 *  Раньше здесь использовался динамический noise-gate (RMS + requestAnimationFrame),
 *  который в реальных WebView иногда вызывал тональные артефакты/"сигналы".
 *
 * Текущая реализация использует только стабильные нативные узлы:
 *  source → highpass(90Hz) → lowpass(7.2kHz) → compressor → wetGain
 *  source → dryGain (bypass)
 *  wetGain + dryGain → destination
 *
 * setEnabled(true):  wet=1, dry=0
 * setEnabled(false): wet=0, dry=1
 */

import { logger } from '@/lib/logger';

const HIGHPASS_FREQ = 90;
const LOWPASS_FREQ = 7200;
const COMPRESSOR_THRESHOLD = -28;
const COMPRESSOR_KNEE = 24;
const COMPRESSOR_RATIO = 3;
const COMPRESSOR_ATTACK = 0.003;
const COMPRESSOR_RELEASE = 0.18;
const BYPASS_RAMP_SEC = 0.02;

export class NoiseSuppressor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private enabled = true;
  private readonly sourceStream: MediaStream;

  constructor(stream: MediaStream) {
    this.sourceStream = stream;
    this.buildGraph();
  }

  private buildGraph(): void {
    try {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.source = this.ctx.createMediaStreamSource(this.sourceStream);
      this.destination = this.ctx.createMediaStreamDestination();

      // Убираем инфранизкие шумы (гул).
      this.highpass = this.ctx.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = HIGHPASS_FREQ;
      this.highpass.Q.value = 0.8;

      // Мягко срезаем высокочастотный шип/цифровой "свист".
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = LOWPASS_FREQ;
      this.lowpass.Q.value = 0.7;

      // Лёгкая динамическая компрессия для стабилизации голоса без gating-артефактов.
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = COMPRESSOR_THRESHOLD;
      this.compressor.knee.value = COMPRESSOR_KNEE;
      this.compressor.ratio.value = COMPRESSOR_RATIO;
      this.compressor.attack.value = COMPRESSOR_ATTACK;
      this.compressor.release.value = COMPRESSOR_RELEASE;

      this.wetGain = this.ctx.createGain();
      this.dryGain = this.ctx.createGain();
      this.wetGain.gain.value = 1;
      this.dryGain.gain.value = 0;

      // Wet (обработанный) путь
      this.source.connect(this.highpass);
      this.highpass.connect(this.lowpass);
      this.lowpass.connect(this.compressor);
      this.compressor.connect(this.wetGain);

      // Dry (bypass) путь
      this.source.connect(this.dryGain);

      this.wetGain.connect(this.destination);
      this.dryGain.connect(this.destination);

      this.setEnabled(this.enabled);
      void this.ctx.resume().catch((error) => {
        logger.debug('[NoiseSuppressor] AudioContext resume skipped/failed', { error });
      });
      logger.info('[NoiseSuppressor] Граф обработки создан');
    } catch (error) {
      logger.error('[NoiseSuppressor] Ошибка создания графа', { error });
      this.close();
    }
  }

  /** Возвращает обработанный MediaStream (замена оригинального аудио). */
  getProcessedStream(): MediaStream | null {
    return this.destination?.stream ?? null;
  }

  /** Включить/выключить шумоподавление (bypass). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    const ctx = this.ctx;
    const wet = this.wetGain;
    const dry = this.dryGain;
    if (ctx && wet && dry) {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch((error) => {
          logger.debug('[NoiseSuppressor] AudioContext resume failed during toggle', { error });
        });
      }
      const now = ctx.currentTime;
      wet.gain.cancelScheduledValues(now);
      dry.gain.cancelScheduledValues(now);
      wet.gain.setValueAtTime(wet.gain.value, now);
      dry.gain.setValueAtTime(dry.gain.value, now);
      wet.gain.linearRampToValueAtTime(on ? 1 : 0, now + BYPASS_RAMP_SEC);
      dry.gain.linearRampToValueAtTime(on ? 0 : 1, now + BYPASS_RAMP_SEC);
    }
    logger.debug('[NoiseSuppressor] Состояние изменено', { enabled: on });
  }

  /** Освобождает все ресурсы AudioContext. */
  close(): void {
    this.source?.disconnect();
    this.highpass?.disconnect();
    this.lowpass?.disconnect();
    this.compressor?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();

    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => { /* ignore */ });
    }

    this.source = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.wetGain = null;
    this.dryGain = null;
    this.destination = null;
    this.ctx = null;

    logger.info('[NoiseSuppressor] Ресурсы освобождены');
  }
}

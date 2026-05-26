/**
 * Умное шумоподавление на базе спектрального анализа.
 *
 * Алгоритм:
 *  - Спектральный анализ через AnalyserNode (FFT 2048) для классификации голос/шум
 *  - Голос в диапазоне 300-3400Hz (телефонный диапазон)
 *  - VAD (Voice Activity Detection) с порогом 15dB SNR
 *  - Адаптивное подавление: gain 0.9 когда голос активен, 0.2 когда нет
 *  - Dry/wet микс для плавного переключения
 *
 * setEnabled(true):  wet=1, dry=0
 * setEnabled(false): wet=0, dry=1
 */

import { logger } from '@/lib/logger';

const VOICE_FREQ_LOW = 300;
const VOICE_FREQ_HIGH = 3400;
const BYPASS_RAMP_SEC = 0.05;
const VAD_SNR_THRESHOLD = 15;
const SMOOTH_FACTOR = 0.1;

export class SmartNoiseSuppressor {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private enabled = true;
  private processingInterval: number | null = null;
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

      // Анализатор спектра
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Фильтры (полосовой проход для голоса)
      this.highpass = this.ctx.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = VOICE_FREQ_LOW;
      this.highpass.Q.value = 0.7;

      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = VOICE_FREQ_HIGH;
      this.lowpass.Q.value = 0.7;

      // Компрессор для стабилизации
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      // Wet/dry gains
      this.wetGain = this.ctx.createGain();
      this.dryGain = this.ctx.createGain();
      this.wetGain.gain.value = 1;
      this.dryGain.gain.value = 0;

      // Граф соединений
      // Wet путь: source → analyser → highpass → lowpass → compressor → wetGain
      this.source.connect(this.analyser);
      this.analyser.connect(this.highpass);
      this.highpass.connect(this.lowpass);
      this.lowpass.connect(this.compressor);
      this.compressor.connect(this.wetGain);

      // Dry путь: source → dryGain
      this.source.connect(this.dryGain);

      // Микс к destination
      this.wetGain.connect(this.destination);
      this.dryGain.connect(this.destination);

      this.setEnabled(this.enabled);

      // Обязательный resume после создания графа
      void this.ctx.resume().catch((error) => {
        logger.debug('[SmartNoiseSuppressor] AudioContext resume failed', { error });
      });

      this.startProcessing();
      logger.info('[SmartNoiseSuppressor] Graph created');
    } catch (error) {
      logger.error('[SmartNoiseSuppressor] Graph creation failed', { error });
      this.close();
    }
  }

  /** Спектральный анализ для классификации голос/шум */
  private spectralAnalysis(): { voiceEnergy: number; noiseEnergy: number } {
    if (!this.analyser || !this.ctx) return { voiceEnergy: 0, noiseEnergy: 0 };

    const bufferLength = this.analyser.frequencyBinCount;
    const spectrum = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(spectrum);

    const sampleRate = this.ctx.sampleRate;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / bufferLength;

    let voiceEnergy = 0;
    let noiseEnergy = 0;
    const voiceStartBin = Math.max(0, Math.floor(VOICE_FREQ_LOW / binWidth));
    const voiceEndBin = Math.min(bufferLength - 1, Math.floor(VOICE_FREQ_HIGH / binWidth));

    for (let i = 0; i < bufferLength; i++) {
      if (i >= voiceStartBin && i <= voiceEndBin) {
        voiceEnergy += spectrum[i];
      } else {
        noiseEnergy += spectrum[i];
      }
    }

    const voiceBins = voiceEndBin - voiceStartBin + 1;
    const noiseBins = bufferLength - voiceBins;
    voiceEnergy /= voiceBins || 1;
    noiseEnergy /= noiseBins || 1;

    return { voiceEnergy, noiseEnergy };
  }

  /** VAD - определение наличия голоса */
  private voiceActivityDetection(): boolean {
    const { voiceEnergy, noiseEnergy } = this.spectralAnalysis();
    const snr = voiceEnergy - noiseEnergy;
    return snr > VAD_SNR_THRESHOLD;
  }

  /** Адаптивное подавление */
  private adaptiveSuppress(): void {
    if (!this.enabled || !this.ctx || !this.wetGain) return;

    const isVoiceActive = this.voiceActivityDetection();
    const currentGain = this.wetGain.gain.value;
    const targetGain = isVoiceActive ? 0.9 : 0.2;
    this.wetGain.gain.value = currentGain + SMOOTH_FACTOR * (targetGain - currentGain);
  }

  /** Запуск обработки */
  private startProcessing(): void {
    if (this.processingInterval) return;

    const process = () => {
      this.adaptiveSuppress();
      this.processingInterval = requestAnimationFrame(process);
    };
    this.processingInterval = requestAnimationFrame(process);
  }

  /** Возвращает обработанный MediaStream */
  getProcessedStream(): MediaStream | null {
    return this.destination?.stream ?? null;
  }

  /** Включить/выключить шумоподавление */
  setEnabled(on: boolean): void {
    this.enabled = on;
    const ctx = this.ctx;
    const wet = this.wetGain;
    const dry = this.dryGain;

    if (ctx && wet && dry) {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch((error) => {
          logger.debug('[SmartNoiseSuppressor] Resume failed during toggle', { error });
        });
      }
      const now = ctx.currentTime;
      const target = on ? 1 : 0;

      wet.gain.cancelScheduledValues(now);
      dry.gain.cancelScheduledValues(now);
      wet.gain.setTargetAtTime(target, now, BYPASS_RAMP_SEC);
      dry.gain.setTargetAtTime(1 - target, now, BYPASS_RAMP_SEC);
    }
    logger.debug('[SmartNoiseSuppressor] State changed', { enabled: on });
  }

  /** Освобождение ресурсов */
  close(): void {
    if (this.processingInterval) {
      cancelAnimationFrame(this.processingInterval);
      this.processingInterval = null;
    }

    this.source?.disconnect();
    this.analyser?.disconnect();
    this.highpass?.disconnect();
    this.lowpass?.disconnect();
    this.compressor?.disconnect();
    this.wetGain?.disconnect();
    this.dryGain?.disconnect();

    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => { /* ignore */ });
    }

    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.wetGain = null;
    this.dryGain = null;
    this.destination = null;

    logger.info('[SmartNoiseSuppressor] Resources released');
  }
}
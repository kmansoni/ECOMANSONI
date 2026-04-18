let synthesis: SpeechSynthesis | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let voiceQueue: string[] = [];
let isSpeaking = false;
let voiceConfig: VoiceConfig = {
  volume: 1.0,
  rate: 1.0,
  pitch: 1.0,
  lang: 'ru-RU',
};

export interface VoiceConfig {
  volume: number;
  rate: number;
  pitch: number;
  lang: string;
}

export function initVoice(): boolean {
  if (typeof window === 'undefined') return false;
  
  if (!window.speechSynthesis) {
    console.warn('Speech synthesis not supported');
    return false;
  }
  
  synthesis = window.speechSynthesis;
  return true;
}

export function configureVoice(config: Partial<VoiceConfig>): void {
  voiceConfig = { ...voiceConfig, ...config };
}

export function speakInstruction(text: string): void {
  if (typeof window === 'undefined') return;
  
  if (!synthesis) {
    initVoice();
  }
  
  if (!synthesis) return;
  
  voiceQueue.push(text);
  
  if (!isSpeaking) {
    processQueue();
  }
}

function processQueue(): void {
  if (!synthesis || voiceQueue.length === 0) {
    isSpeaking = false;
    currentUtterance = null;
    return;
  }
  
  isSpeaking = true;
  const text = voiceQueue.shift()!;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.volume = voiceConfig.volume;
  utterance.rate = voiceConfig.rate;
  utterance.pitch = voiceConfig.pitch;
  utterance.lang = voiceConfig.lang;
  
  const voices = synthesis.getVoices();
  const russianVoice = voices.find(v => v.lang.startsWith('ru')) || voices[0];
  if (russianVoice) {
    utterance.voice = russianVoice;
  }
  
  utterance.onend = () => {
    currentUtterance = null;
    processQueue();
  };
  
  utterance.onerror = (event) => {
    console.warn('Speech error:', event.error);
    currentUtterance = null;
    processQueue();
  };
  
  currentUtterance = utterance;
  synthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (!synthesis) return;
  
  synthesis.cancel();
  voiceQueue = [];
  isSpeaking = false;
  currentUtterance = null;
}

export function pauseSpeaking(): void {
  if (!synthesis) return;
  synthesis.pause();
}

export function resumeSpeaking(): void {
  if (!synthesis) return;
  synthesis.resume();
}

export function isVoiceEnabled(): boolean {
  return isSpeaking;
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!synthesis) return [];
  return synthesis.getVoices();
}

export const voiceGuidance = {
  init: initVoice,
  speak: speakInstruction,
  stop: stopSpeaking,
  pause: pauseSpeaking,
  resume: resumeSpeaking,
  configure: configureVoice,
  isSpeaking: () => isSpeaking,
  getVoices,
};

export default voiceGuidance;
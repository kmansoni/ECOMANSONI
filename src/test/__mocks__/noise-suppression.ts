// src/test/__mocks__/noise-suppression.ts
export class SmartNoiseSuppressor {
  constructor(stream: MediaStream) {}
  getProcessedStream(): MediaStream | null { return null; }
  setEnabled(on: boolean): void {}
  close(): void {}
}

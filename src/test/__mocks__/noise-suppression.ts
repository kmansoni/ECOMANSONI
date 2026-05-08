// src/test/__mocks__/noise-suppression.ts
export class NoiseSuppressor {
  static async create(): Promise<NoiseSuppressor> {
    return new NoiseSuppressor();
  }
  
  close(): void {
    // mock
  }
  
  process(): void {
    // mock
  }
}

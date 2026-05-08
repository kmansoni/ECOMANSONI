// src/test/__mocks__/video-blur-processor.ts
export class VideoBlurProcessor {
  static async create(): Promise<VideoBlurProcessor> {
    return new VideoBlurProcessor();
  }
  
  start(): void {
    // mock
  }
  
  stop(): void {
    // mock
  }
}

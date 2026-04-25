/**
 * Media Decoder — mock for measuring energy consumption
 * In reality, would wrap VideoDecoder API or native codec library.
 */

export class MediaDecoder {
  private width: number;
  private height: number;
  private fps: number;
  private hardware: boolean;
  private codec: string;

  constructor(options: { width: number; height: number; fps?: number; codec?: string; hardware?: boolean }) {
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps || 30;
    this.codec = options.codec || 'VP8';
    this.hardware = options.hardware ?? true;
  }

  async measureEnergyPerFrame(): Promise<number> {
    // Rough estimate: energy (arbitrary units) proportional to pixel count × fps
    const pixels = this.width * this.height;
    const baseEnergyPerPixel = this.hardware ? 0.0001 : 0.0002; // hardware 2× efficient
    return pixels * this.fps * baseEnergyPerPixel;
  }

  async measureEnergyPerSecond(): Promise<number> {
    const perFrame = await this.measureEnergyPerFrame();
    return perFrame * this.fps;
  }
}

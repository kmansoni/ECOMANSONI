/**
 * ffmpeg-pipeline.ts — Promise-based FFmpeg pipeline builder wrapping fluent-ffmpeg.
 *
 * Architecture:
 *  - Builder pattern for composing complex filter_complex graphs.
 *  - Promise-based run() with progress callback and configurable timeout.
 *  - All FFmpeg invocations use execFile-style (fluent-ffmpeg default) — no shell.
 *  - stderr is captured and parsed for progress reporting.
 *  - On timeout, the process is killed with SIGKILL to prevent zombie processes.
 *
 * Concurrency:
 *  - Each pipeline instance is single-use — create a new one per operation.
 *  - The underlying fluent-ffmpeg spawns a child process per run().
 *  - The worker should not run multiple pipelines concurrently on the same
 *    temp directory (filesystem contention).
 *
 * Error handling:
 *  - FFmpeg errors are captured with full stderr output for diagnostics.
 *  - Timeout errors include the elapsed time for debugging slow encodes.
 *  - The caller is responsible for cleanup of input/output files.
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { logger } from '../logger.js';

// Point fluent-ffmpeg to the bundled static binary.
// ffprobe is expected on PATH (installed via system package manager).
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath('ffprobe');

// ── Types ───────────────────────────────────────────────────────────────────

export interface InputOptions {
  /** Seek to this position before decoding (seconds) */
  seekTo?: number;
  /** Stop reading at this position (seconds) */
  duration?: number;
  /** Additional input options (raw FFmpeg flags) */
  inputOptions?: string[];
}

export interface OutputOptions {
  /** Video codec (e.g., 'libx264') */
  videoCodec?: string;
  /** Audio codec (e.g., 'aac') */
  audioCodec?: string;
  /** Additional output options (raw FFmpeg flags) */
  outputOptions?: string[];
  /** Output format override (e.g., 'mp4', 'gif', 'null') */
  format?: string;
}

export interface FFmpegInput {
  path: string;
  options: InputOptions;
}

// Default timeout: 30 minutes (covers 4K H.265 encodes on modest hardware)
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// ── Pipeline Class ──────────────────────────────────────────────────────────

export class FFmpegPipeline {
  private inputs: FFmpegInput[] = [];
  private filters: string[] = [];
  private outputOpts: string[] = [];
  private outputPath: string = '';
  private outputFormat: string | null = null;
  private mapStreams: string[] = [];
  private videoCodec: string | null = null;
  private audioCodec: string | null = null;
  private timeoutMs: number = DEFAULT_TIMEOUT_MS;
  private totalDurationSec: number = 0;

  /**
   * Adds an input file to the pipeline.
   * Inputs are referenced in filter_complex as [0:v], [1:v], etc.
   */
  addInput(path: string, options: InputOptions = {}): this {
    this.inputs.push({ path, options });
    return this;
  }

  /**
   * Adds a filter to the filter_complex chain.
   * Filters are joined with ';' to form the complete filter graph.
   *
   * Example: '[0:v]trim=0:5,setpts=PTS-STARTPTS[v0]'
   */
  addFilter(filter: string): this {
    this.filters.push(filter);
    return this;
  }

  /**
   * Adds multiple filters at once.
   */
  addFilters(filters: string[]): this {
    for (const f of filters) {
      if (f.trim()) this.filters.push(f);
    }
    return this;
  }

  /**
   * Maps an output stream label for the final output.
   * Example: '[vout]', '[aout]'
   */
  addMap(streamLabel: string): this {
    this.mapStreams.push(streamLabel);
    return this;
  }

  /**
   * Sets the output path and codec options.
   */
  setOutput(path: string, options: OutputOptions = {}): this {
    this.outputPath = path;
    if (options.videoCodec) this.videoCodec = options.videoCodec;
    if (options.audioCodec) this.audioCodec = options.audioCodec;
    if (options.outputOptions) this.outputOpts.push(...options.outputOptions);
    if (options.format) this.outputFormat = options.format;
    return this;
  }

  /**
   * Adds raw output options (e.g., '-crf', '20', '-preset', 'medium').
   */
  addOutputOptions(options: string[]): this {
    this.outputOpts.push(...options);
    return this;
  }

  /**
   * Sets the total expected duration for progress calculation.
   * Without this, progress callback receives raw seconds instead of percentage.
   */
  setDuration(durationSec: number): this {
    this.totalDurationSec = durationSec;
    return this;
  }

  /**
   * Sets the timeout for this pipeline.
   * If FFmpeg doesn't complete within this time, the process is killed.
   */
  setTimeout(ms: number): this {
    this.timeoutMs = ms;
    return this;
  }

  /**
   * Builds the filter_complex string from all added filters.
   * Returns empty string if no filters are set.
   */
  buildFilterComplex(): string {
    return this.filters.join(';\n');
  }

  /**
   * Executes the FFmpeg pipeline.
   *
   * @param onProgress - Optional callback receiving completion percentage (0-100).
   *                     Progress is derived from FFmpeg's stderr time= output
   *                     compared against totalDurationSec.
   * @returns Promise that resolves on successful completion, rejects on error.
   *
   * Error classes:
   *  - Timeout: 'FFmpeg timed out after Xms'
   *  - FFmpeg error: 'FFmpeg failed: <stderr excerpt>'
   *  - No output: 'FFmpeg produced no output file'
   */
  run(onProgress?: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.outputPath) {
        reject(new Error('FFmpegPipeline: output path not set'));
        return;
      }

      if (this.inputs.length === 0) {
        reject(new Error('FFmpegPipeline: no inputs added'));
        return;
      }

      // Build the fluent-ffmpeg command
      let cmd = ffmpeg();

      // Add inputs with per-input options
      for (const input of this.inputs) {
        cmd = cmd.input(input.path);
        const inputOpts: string[] = [];

        if (input.options.seekTo !== undefined) {
          inputOpts.push('-ss', String(input.options.seekTo));
        }
        if (input.options.duration !== undefined) {
          inputOpts.push('-t', String(input.options.duration));
        }
        if (input.options.inputOptions) {
          inputOpts.push(...input.options.inputOptions);
        }
        if (inputOpts.length > 0) {
          cmd = cmd.inputOptions(inputOpts);
        }
      }

      // Add filter_complex
      const filterComplex = this.buildFilterComplex();
      if (filterComplex) {
        cmd = cmd.complexFilter(filterComplex);
      }

      // Add stream maps
      for (const map of this.mapStreams) {
        cmd = cmd.outputOptions('-map', map);
      }

      // Add codecs
      if (this.videoCodec) {
        cmd = cmd.videoCodec(this.videoCodec);
      }
      if (this.audioCodec) {
        cmd = cmd.audioCodec(this.audioCodec);
      }

      // Add output options
      if (this.outputOpts.length > 0) {
        cmd = cmd.outputOptions(this.outputOpts);
      }

      // Set output format
      if (this.outputFormat) {
        cmd = cmd.format(this.outputFormat);
      }

      // Set output path
      cmd = cmd.output(this.outputPath);

      // Overwrite output file without asking
      cmd = cmd.outputOptions('-y');

      // ── Timeout mechanism ────────────────────────────────────────────
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        cmd.kill('SIGKILL');
        reject(
          new Error(
            `FFmpeg timed out after ${this.timeoutMs}ms ` +
            `(${Math.round(this.timeoutMs / 60000)}min). ` +
            `Output: ${this.outputPath}`,
          ),
        );
      }, this.timeoutMs);

      // ── Progress tracking ────────────────────────────────────────────
      if (onProgress && this.totalDurationSec > 0) {
        cmd = cmd.on('progress', (progress: { timemark?: string; percent?: number }) => {
          if (progress.percent !== undefined) {
            onProgress(Math.min(100, Math.round(progress.percent)));
          } else if (progress.timemark) {
            const parts = progress.timemark.split(':');
            if (parts.length === 3) {
              const secs =
                parseFloat(parts[0]!) * 3600 +
                parseFloat(parts[1]!) * 60 +
                parseFloat(parts[2]!);
              const pct = Math.min(100, Math.round((secs / this.totalDurationSec) * 100));
              onProgress(pct);
            }
          }
        });
      }

      // ── Error / End handlers ─────────────────────────────────────────
      let stderrOutput = '';

      cmd = cmd.on('stderr', (line: string) => {
        // Keep last 20 lines for error diagnostics
        stderrOutput += line + '\n';
        const lines = stderrOutput.split('\n');
        if (lines.length > 20) {
          stderrOutput = lines.slice(-20).join('\n');
        }
      });

      cmd = cmd.on('error', (err: Error) => {
        clearTimeout(timer);
        if (timedOut) return; // Already rejected by timeout

        const message = [
          `FFmpeg failed: ${err.message}`,
          `Output: ${this.outputPath}`,
          `Stderr: ${stderrOutput.trim().slice(-500)}`,
        ].join('\n');

        logger.error({
          event: 'ffmpeg_pipeline_error',
          output: this.outputPath,
          err: err.message,
          stderr: stderrOutput.trim().slice(-500),
        });

        reject(new Error(message));
      });

      cmd = cmd.on('end', () => {
        clearTimeout(timer);
        if (timedOut) return;

        logger.debug({
          event: 'ffmpeg_pipeline_complete',
          output: this.outputPath,
          inputCount: this.inputs.length,
          filterCount: this.filters.length,
        });

        resolve();
      });

      // ── Execute ──────────────────────────────────────────────────────
      logger.info({
        event: 'ffmpeg_pipeline_start',
        output: this.outputPath,
        inputCount: this.inputs.length,
        filterCount: this.filters.length,
        filterComplex: filterComplex.slice(0, 200),
        timeout: this.timeoutMs,
      });

      cmd.run();
    });
  }
}

// ── Convenience Factory ─────────────────────────────────────────────────────

/**
 * Creates a simple single-input, single-output FFmpeg pipeline.
 * For quick operations like trim, speed change, or filter application.
 */
export function createSimplePipeline(
  inputPath: string,
  outputPath: string,
  options?: {
    inputOptions?: string[];
    outputOptions?: string[];
    filters?: string[];
    videoCodec?: string;
    audioCodec?: string;
    timeout?: number;
    duration?: number;
  },
): FFmpegPipeline {
  const pipeline = new FFmpegPipeline();

  pipeline.addInput(inputPath, {
    inputOptions: options?.inputOptions,
  });

  if (options?.filters && options.filters.length > 0) {
    pipeline.addFilters(options.filters);
  }

  pipeline.setOutput(outputPath, {
    videoCodec: options?.videoCodec ?? 'libx264',
    audioCodec: options?.audioCodec ?? 'aac',
    outputOptions: options?.outputOptions,
  });

  if (options?.timeout) {
    pipeline.setTimeout(options.timeout);
  }

  if (options?.duration) {
    pipeline.setDuration(options.duration);
  }

  return pipeline;
}

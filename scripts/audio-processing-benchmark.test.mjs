import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildResultMetrics,
  validateBenchmarkConfig,
} from './audio-processing-benchmark.mjs';

describe('audio-processing benchmark helpers', () => {
  it('computes comparable time, memory, and capacity metrics', () => {
    expect(
      buildResultMetrics({
        sourceBytes: 4 * 1024 * 1024,
        outputBytes: 100 * 1024 * 1024,
        durationSeconds: 240,
        wallMs: 120_000,
        cpuUsage: { user: 300_000_000, system: 60_000_000 },
        peakRssBytes: 2 * 1024 * 1024 * 1024,
      }),
    ).toEqual({
      sourceMiB: 4,
      outputMiB: 100,
      outputToSourceRatio: 25,
      wallSeconds: 120,
      realtimeFactor: 0.5,
      processingSpeed: 2,
      cpuSeconds: 360,
      averageCpuCores: 3,
      peakRssMiB: 2048,
    });
  });

  it('accepts isolated product baselines and the benchmark-only HQ4 candidate', () => {
    const root = path.resolve('tasks', 'audio-benchmark');
    const valid = {
      outputRoot: root,
      resultsPath: path.join(root, 'results.json'),
      jobs: [
        {
          trackId: 'track-1',
          title: 'Song',
          album: 'Album',
          durationSeconds: 200,
          inputPath: path.resolve('fixtures', 'song.webm'),
          outputDir: path.join(root, 'track-1', 'quick'),
          recipeId: 'quick',
          modelPath: path.resolve('models', 'kara2.onnx'),
          sourceSha256: 'a'.repeat(64),
          modelSha256: 'b'.repeat(64),
          ffmpegPath: path.resolve('tools', 'ffmpeg.exe'),
        },
      ],
    };

    expect(validateBenchmarkConfig(valid)).toEqual(valid);
    expect(
      validateBenchmarkConfig({
        ...valid,
        jobs: [
          {
            ...valid.jobs[0],
            outputDir: path.join(root, 'track-1', 'benchmark-hq4'),
            recipeId: 'benchmark-hq4',
            modelPath: path.resolve('models', 'inst-hq4.onnx'),
          },
        ],
      }),
    ).toMatchObject({ jobs: [{ recipeId: 'benchmark-hq4' }] });
    expect(() =>
      validateBenchmarkConfig({
        ...valid,
        jobs: [{ ...valid.jobs[0], recipeId: 'high-quality' }],
      }),
    ).toThrow(/recipe/i);
    expect(() =>
      validateBenchmarkConfig({
        ...valid,
        jobs: [{ ...valid.jobs[0], recipeId: 'toString' }],
      }),
    ).toThrow(/recipe/i);
    expect(() =>
      validateBenchmarkConfig({
        ...valid,
        jobs: [valid.jobs[0], { ...valid.jobs[0], recipeId: 'general' }],
      }),
    ).toThrow(/output directory/i);
    expect(() =>
      validateBenchmarkConfig({
        ...valid,
        jobs: [{ ...valid.jobs[0], modelSha256: 'not-a-sha' }],
      }),
    ).toThrow(/sha-256/i);
  });
});

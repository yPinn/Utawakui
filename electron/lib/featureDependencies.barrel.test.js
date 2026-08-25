import { describe, expect, it } from 'vitest';
import {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  ensureFfmpegDependency,
  ensureModelDependency,
  ensureYtdlpDependency,
  getFeatureDependencies,
  prepareFeatureDependency,
} from './featureDependencies.js';

describe('featureDependencies compatibility barrel', () => {
  it('keeps statically discoverable named CJS exports', () => {
    expect(FFMPEG_DEPENDENCY_ID).toBe('ffmpeg-gyan-essentials');
    expect(YTDLP_DEPENDENCY_ID).toBe('yt-dlp-provider-tool');
    for (const value of [
      ensureFfmpegDependency,
      ensureModelDependency,
      ensureYtdlpDependency,
      getFeatureDependencies,
      prepareFeatureDependency,
    ]) {
      expect(value).toBeTypeOf('function');
    }
  });
});

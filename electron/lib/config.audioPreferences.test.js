import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_PREFERENCES,
  hasStoredAudioPreferences,
  loadConfig,
  normalizeAudioPreferences,
  saveConfig,
} from './config.js';

describe('config audio preferences', () => {
  let directory;
  let configPath;

  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-audio-preferences-'),
    );
    configPath = path.join(directory, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('uses canonical defaults for a fresh config without claiming they were stored', () => {
    expect(hasStoredAudioPreferences(configPath)).toBe(false);
    expect(loadConfig(configPath).audioPreferences).toEqual(
      DEFAULT_AUDIO_PREFERENCES,
    );
  });

  it('round-trips valid preferences, including when no track is loaded', () => {
    const preferences = {
      performanceVolume: 0.72,
      performanceMuted: true,
      monitorGuideVocalLevel: 0.35,
      captureGuideVocalLevel: 0.15,
    };

    saveConfig(configPath, { audioPreferences: preferences });

    expect(hasStoredAudioPreferences(configPath)).toBe(true);
    expect(loadConfig(configPath).audioPreferences).toEqual(preferences);
  });

  it('falls back per field without discarding valid neighboring preferences', () => {
    expect(
      normalizeAudioPreferences({
        performanceVolume: 0.8,
        performanceMuted: 'yes',
        monitorGuideVocalLevel: Number.NaN,
        captureGuideVocalLevel: 0.2,
      }),
    ).toEqual({
      performanceVolume: 0.8,
      performanceMuted: false,
      monitorGuideVocalLevel: 0.5,
      captureGuideVocalLevel: 0.2,
    });
  });

  it('rejects out-of-range legacy values instead of clamping corrupted storage', () => {
    expect(
      normalizeAudioPreferences({
        performanceVolume: 2,
        performanceMuted: true,
        monitorGuideVocalLevel: -1,
        captureGuideVocalLevel: 1.5,
      }),
    ).toEqual({
      performanceVolume: 0.5,
      performanceMuted: true,
      monitorGuideVocalLevel: 0.5,
      captureGuideVocalLevel: 0,
    });
  });
});

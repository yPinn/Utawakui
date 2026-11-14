import { afterEach, expect, it, vi } from 'vitest';
import {
  loadSingAlongPreferences,
  saveSingAlongPreferences,
} from './singAlongPreferences.js';

afterEach(() => vi.unstubAllGlobals());

it('defaults to an enabled microphone and both level displays and restores changed choices', () => {
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  });
  const defaults = loadSingAlongPreferences();
  expect(defaults).toMatchObject({
    microphone: { enabled: true, deviceId: '', gainDb: 0 },
    showMeter: true,
    showLevelHistory: true,
    showReferencePitch: true,
    correctionMs: 0,
  });
  const changed = {
    microphone: {
      enabled: false,
      deviceId: 'mic-b',
      gainDb: -3,
      highPassHz: 80,
      noiseSuppression: true,
    },
    correctionMs: -30,
    showMeter: false,
    showLevelHistory: false,
    showReferencePitch: false,
  };
  saveSingAlongPreferences(changed);
  expect(loadSingAlongPreferences()).toEqual(changed);
  saveSingAlongPreferences({ correctionMs: 14 });
  expect(loadSingAlongPreferences().correctionMs).toBe(10);
  saveSingAlongPreferences({ correctionMs: 900 });
  expect(loadSingAlongPreferences().correctionMs).toBe(500);
});

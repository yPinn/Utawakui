import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  comparePhase,
} = require('../prototypes/reference-pitch/phaseComparison.cjs');
const {
  registerReferencePitch,
} = require('../prototypes/reference-pitch/register.cjs');
const {
  readGuideTechniqueCues,
  readGuideTechniqueReview,
} = require('../prototypes/reference-pitch/guideReview.cjs');

it('accepts bounded technique cues only for the exact separation version', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-cues-'));
  const cacheFile = path.join(directory, 'reference-pitch-v1.json');
  const file = path.join(directory, 'reference-pitch-technique-cues-v1.json');
  const source = { trackId: 'track', recipeId: 'general', completedAtMs: 123 };
  const cue = { kind: 'rise', fromMs: 1600, toMs: 1800, hintMs: 1360 };
  const write = (cues, hidden) =>
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, ...source, cues, hidden }),
    );
  try {
    expect(readGuideTechniqueCues(cacheFile, source, 2)).toEqual([]);
    write([{ ...cue, privateField: 'extra' }]);
    expect(readGuideTechniqueCues(cacheFile, source, 2)).toEqual([cue]);
    const hidden = [{ kind: 'fall', atMs: 1000 }];
    write([cue], [{ ...hidden[0], privateField: 'extra' }]);
    expect(readGuideTechniqueReview(cacheFile, source, 2)).toEqual({
      techniqueCues: [cue],
      hiddenTechniqueMarks: hidden,
    });
    expect(
      readGuideTechniqueReview(cacheFile, { ...source, completedAtMs: 124 }, 2),
    ).toEqual({ techniqueCues: [], hiddenTechniqueMarks: [] });
    write([cue], [{ ...hidden[0], atMs: 2001 }]);
    expect(readGuideTechniqueReview(cacheFile, source, 2)).toEqual({
      techniqueCues: [cue],
      hiddenTechniqueMarks: [],
    });
    expect(
      readGuideTechniqueCues(cacheFile, { ...source, completedAtMs: 124 }, 2),
    ).toEqual([]);
    expect(readGuideTechniqueCues(cacheFile, source, 1)).toEqual([]);
    write([{ ...cue, hintMs: 1650 }]);
    expect(readGuideTechniqueCues(cacheFile, source, 2)).toEqual([]);
    const fullSong = Array.from({ length: 128 }, (_, index) => ({
      kind: 'vibrato',
      hintMs: 500 * index,
      fromMs: 500 * index + 120,
      toMs: 500 * index + 420,
    }));
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, ...source, cues: fullSong }, null, 2),
    );
    expect(readGuideTechniqueCues(cacheFile, source, 65)).toEqual(fullSong);
    write([...fullSong, { ...cue, hintMs: 64000, fromMs: 64120, toMs: 64420 }]);
    expect(readGuideTechniqueCues(cacheFile, source, 65)).toEqual([]);
    fs.writeFileSync(file, '{');
    expect(readGuideTechniqueCues(cacheFile, source, 2)).toEqual([]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('accepts comparison intent only from the main frame and checks the audio gate', async () => {
  const senderFrame = {};
  const sender = {
    mainFrame: senderFrame,
    once: vi.fn(),
    removeListener: vi.fn(),
  };
  const getScope = vi.fn();
  const requireGate = vi.fn(() => {
    throw new Error('Disabled');
  });
  const handlers = new Map();
  registerReferencePitch({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getMainWindow: () => ({ webContents: sender, isDestroyed: () => false }),
    requireGate,
    getScope,
  });
  const analyze = handlers.get('reference-pitch:analyze');
  const id = '00000000-0000-4000-8000-000000000000';
  const authorized = { sender, senderFrame };
  await expect(
    analyze({ sender, senderFrame: {} }, 'track', id, false, true),
  ).resolves.toEqual({ status: 'unavailable' });
  await expect(
    analyze(authorized, 'track', id, false, 'true'),
  ).resolves.toEqual({ status: 'unavailable' });
  await expect(analyze(authorized, 'track', id, true, true)).resolves.toEqual({
    status: 'unavailable',
  });
  expect(requireGate).not.toHaveBeenCalled();
  await expect(analyze(authorized, 'track', id, false, true)).resolves.toEqual({
    status: 'gate-disabled',
  });
  expect(getScope).not.toHaveBeenCalled();
});

it('bounds Live vocal PCM and checks the gate before scheduling offline work', async () => {
  const handlers = new Map();
  const schedule = vi.fn();
  const requireGate = vi.fn(() => {
    throw new Error('Disabled');
  });
  registerReferencePitch({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getPerformerSource: () => null,
    requireGate,
    scheduler: { schedule },
  });
  const analyze = handlers.get('performer-pitch:analyze-live');
  const id = '00000000-0000-4000-8000-000000000000';
  await expect(analyze({}, id, 'voice.wav')).resolves.toEqual({
    status: 'unavailable',
  });
  await expect(analyze({}, id, new ArrayBuffer(1025))).resolves.toEqual({
    status: 'unavailable',
  });
  expect(requireGate).not.toHaveBeenCalled();
  await expect(analyze({}, id, new ArrayBuffer(1024))).resolves.toEqual({
    status: 'gate-disabled',
  });
  expect(schedule).not.toHaveBeenCalled();
});

it('retains seven-frame candidates and masks an eight-frame inverse-phase run', () => {
  const hz = 187.5;
  const backing = Float32Array.from({ length: 40 * 256 }, (_, i) =>
    Array.from(
      { length: 6 },
      (_, h) =>
        Math.sin((2 * Math.PI * hz * (h + 1) * i) / 16000) / (8 * (h + 1)),
    ).reduce((a, b) => a + b),
  );
  const guide = backing.map((sample) => -sample / 5);
  const pitches = new Float32Array(40);
  pitches.fill(hz, 4, 11);
  pitches.fill(hz, 20, 28);
  const baseline = pitches.slice();
  const expected = pitches.slice();
  expected.fill(0, 20, 28);
  expect(comparePhase(pitches, guide, backing)).toEqual(expected);
  expect(comparePhase(pitches, guide, guide)).toEqual(baseline);
  expect(
    comparePhase(
      pitches,
      backing.map((sample) => sample / 5),
      backing,
    ),
  ).toEqual(baseline);
  expect(pitches).toEqual(baseline);
});

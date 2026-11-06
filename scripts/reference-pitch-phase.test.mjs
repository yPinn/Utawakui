import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  comparePhase,
} = require('../prototypes/reference-pitch/phaseComparison.cjs');
const {
  registerReferencePitch,
} = require('../prototypes/reference-pitch/register.cjs');

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

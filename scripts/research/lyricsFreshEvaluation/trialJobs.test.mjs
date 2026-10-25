import path from 'node:path';
import { expect, it } from 'vitest';
import { runOwnedJob, validateTrialCases } from './trialJobs.cjs';
it('refuses unsupported v1 formats before any expensive inference', () => {
  const item = {
    id: 'case-a',
    filename: 'main.vtt',
    audio: path.resolve('private/audio.wav'),
    language: 'zh',
    durationMs: 30000,
  };
  expect(() => validateTrialCases([item])).not.toThrow();
  expect(() =>
    validateTrialCases([{ ...item, audio: path.resolve('private/audio.mp3') }]),
  ).toThrow();
  expect(() =>
    validateTrialCases([{ ...item, filename: 'main.lrc' }]),
  ).toThrow();
  expect(() => validateTrialCases([item, item])).toThrow();
});
it('does not launch after preflight cancellation and waits for an active owned job to settle', async () => {
  const controller = new AbortController();
  let launches = 0;
  await Promise.resolve();
  controller.abort();
  await expect(
    runOwnedJob(() => {
      launches++;
    }, controller.signal),
  ).rejects.toThrow();
  expect(launches).toBe(0);
  const active = new AbortController();
  let cancel = 0,
    settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });
  const running = runOwnedJob(
    () => ({
      result,
      cancel: async () => {
        cancel++;
        settle('closed');
      },
    }),
    active.signal,
  );
  active.abort();
  await expect(running).rejects.toThrow();
  expect(cancel).toBeGreaterThan(0);
});

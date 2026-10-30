import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, it, expect } from 'vitest';
import { recoverSeparationOutputArtifacts } from './separationOutputRecovery.js';
import { createSeparationOutputJob } from './separationOutputJob.js';

const helper = path.resolve('scripts/fixtures/separationCrashChild.cjs');
describe('actual hard termination recovery', () => {
  it('cleans a dead transaction before a retry worker starts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-hard-retry-'));
    const child = fork(helper, [dir, 'worker'], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    try {
      const [ready] = await once(child, 'message');
      expect(ready.error).toBeUndefined();
      const oldStage = fs
        .readdirSync(dir)
        .find((n) => n.startsWith('.separation-'));
      const stopped = once(child, 'exit');
      child.kill('SIGKILL');
      await stopped;
      let entered = false;
      const retry = createSeparationOutputJob({
        workerData: { outputDir: dir, recipeId: 'general' },
        createWorkerJob: () => {
          entered = true;
          expect(fs.existsSync(path.join(dir, oldStage))).toBe(false);
          return {
            result: Promise.reject(new Error('retry sentinel')),
            cancel: async () => {},
          };
        },
      });
      await expect(retry.result).rejects.toThrow('retry sentinel');
      expect(entered).toBe(true);
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGKILL');
        await stopped;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each(['worker', 'publishing', 'committed', 'encoding'])(
    'recovers the %s window without touching old audio',
    async (phase) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-hard-stop-'));
      fs.writeFileSync(path.join(dir, 'general.wav'), 'old audio');
      const old = JSON.stringify({
        version: 2,
        selectedRecipeId: 'general',
        results: { general: { artifactFilename: 'general.wav' } },
      });
      fs.writeFileSync(path.join(dir, 'manifest.json'), old);
      // Keep the liveness control outside the helper's process tree. The first
      // attempt did not retain the expected live child; it did not diagnose why.
      const keeper =
        phase === 'encoding'
          ? spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
              windowsHide: true,
              stdio: 'ignore',
            })
          : null;
      const child = fork(helper, [dir, phase, String(keeper?.pid ?? '')], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      try {
        const ready = await Promise.race([
          once(child, 'message').then(([m]) => m),
          once(child, 'exit').then(([c]) => {
            throw new Error(`helper exited ${c}`);
          }),
        ]);
        expect(ready.error).toBeUndefined();
        const journalDir = fs
          .readdirSync(dir)
          .find((n) => n.startsWith('.separation-'));
        expect(journalDir).toBeTruthy();
        if (phase === 'encoding') {
          const journal = JSON.parse(
            fs.readFileSync(
              path.join(dir, journalDir, 'transaction.json'),
              'utf8',
            ),
          );
          expect(journal.phase).toBe('encoding');
          expect(journal.childPids).toContain(keeper.pid);
        }
        const stopped = once(child, 'exit');
        child.kill('SIGKILL');
        await stopped;
        if (phase === 'encoding') {
          const first = recoverSeparationOutputArtifacts(dir);
          expect(first.deferred).toHaveLength(1);
          expect(first.deferred[0].reason).toBe('process-may-be-alive');
          // Only terminate the exact process held by this test, never a PID
          // read from a user directory or discovered by broad process enumeration.
          const keeperExit = once(keeper, 'exit');
          keeper.kill('SIGKILL');
          await keeperExit;
        }
        const result = recoverSeparationOutputArtifacts(dir);
        expect(result.removed).toHaveLength(1);
        expect(fs.readFileSync(path.join(dir, 'general.wav'), 'utf8')).toBe(
          'old audio',
        );
        const published = fs
          .readdirSync(dir)
          .filter((n) => /^general-.*\.wav$/.test(n));
        expect(published).toHaveLength(phase === 'committed' ? 1 : 0);
        if (phase !== 'committed')
          expect(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe(
            old,
          );
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const end = once(child, 'exit');
          child.kill('SIGKILL');
          await end;
        }
        if (keeper && keeper.exitCode === null && keeper.signalCode === null) {
          const end = once(keeper, 'exit');
          keeper.kill('SIGKILL');
          await end;
        }
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

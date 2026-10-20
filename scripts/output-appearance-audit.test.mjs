import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  launchAuditChild,
  preflightAuditAssets,
  runAudit,
} from './output-appearance-audit.mjs';

describe('F4 audit process boundaries', () => {
  it('does not turn the F5 entry extension into an arbitrary script launcher', async () => {
    await expect(
      launchAuditChild({ dir: '.', entryName: '../private.js' }),
    ).rejects.toThrow('Unknown audit entry');
  });
  it('lists bounded selections without launching Electron or creating a profile', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await runAudit(['--list', '--template', 'art-card'])).toBeNull();
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    'passed',
    'cancelled',
    'failed',
    'missing-report',
    'bad-report',
    'missing-asset',
    'source-error',
  ])('persists partial evidence and cleans profiles on %s', async (mode) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const previousExit = process.exitCode;
    let runDir;
    try {
      const report = await runAudit(['--template', 'art-card'], {
        collect: () => {
          if (mode === 'source-error') throw Error('missing-source');
          return { commit: 'synthetic', dirty: true, files: [] };
        },
        preflight: () => {
          if (mode === 'missing-asset') throw Error('Missing audit asset');
        },
        launch: async ({ dir }) => {
          runDir = dir;
          if (mode === 'bad-report') {
            writeFileSync(path.join(dir, 'report.json'), 'invalid JSON');
            return { code: 0, reason: null };
          }
          const report = JSON.parse(
            readFileSync(path.join(dir, 'report.json'), 'utf8'),
          );
          if (mode === 'passed') {
            report.cases[0].captureStatus = 'passed';
            report.status = 'passed';
          }
          if (mode === 'failed') {
            report.status = 'failed';
            report.cases[0].captureStatus = 'failed';
          }
          writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));
          return {
            code: ['cancelled', 'failed'].includes(mode) ? 1 : 0,
            reason: mode === 'cancelled' ? 'cancelled' : null,
          };
        },
      });
      expect(report.status).toBe(
        mode === 'passed'
          ? 'passed'
          : mode === 'cancelled'
            ? 'cancelled'
            : 'failed',
      );
      expect(report.profileCleanup).toBe('passed');
      expect(report.cases).toHaveLength(1);
      if (!runDir)
        runDir = path.resolve(
          String(log.mock.calls[0][0]).replace('Output audit: ', ''),
        );
      expect(
        JSON.parse(readFileSync(path.join(runDir, 'report.json'), 'utf8'))
          .status,
      ).toBe(report.status);
    } finally {
      process.exitCode = previousExit;
      log.mockRestore();
      if (
        runDir &&
        path.basename(runDir).startsWith('output-appearance-audit-')
      )
        rmSync(runDir, { recursive: true, force: true });
    }
  });
  it('reports missing source assets explicitly', () => {
    expect(() =>
      preflightAuditAssets(['overlay/lyrics/lyrics.mjs']),
    ).not.toThrow();
    expect(() =>
      preflightAuditAssets(['overlay/not-a-real-asset.css']),
    ).toThrow(/Missing audit asset/);
  });

  it('unsets Electron node mode and retains only bounded logs, then removes its handlers', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'output-audit-test-'));
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 123;
    const signals = new EventEmitter();
    let spawnOptions;
    try {
      const result = launchAuditChild({
        dir,
        signals,
        timeoutMs: 1000,
        spawnChild: (_exe, _args, options) => {
          spawnOptions = options;
          queueMicrotask(() => {
            child.stdout.emit('data', Buffer.alloc(1100000, 97));
            child.emit('close', 0, null);
          });
          return child;
        },
      });
      expect(await result).toEqual({ code: 0, reason: null });
      expect(spawnOptions.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(
        readFileSync(path.join(dir, 'process.log')).length,
      ).toBeLessThanOrEqual(1048576);
      expect(signals.listenerCount('SIGINT')).toBe(0);
      expect(signals.listenerCount('SIGTERM')).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cooperatively cancels, preserves terminal reason, and cleans signal handlers after close', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'output-audit-test-'));
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 123;
    const signals = new EventEmitter();
    try {
      const promise = launchAuditChild({
        dir,
        signals,
        timeoutMs: 1000,
        spawnChild: () => child,
      });
      signals.emit('SIGINT');
      expect(readFileSync(path.join(dir, 'cancel'), 'utf8')).toBe('cancelled');
      expect(signals.listenerCount('SIGINT')).toBe(1);
      child.emit('close', 1, null);
      expect(await promise).toEqual({ code: 1, reason: 'cancelled' });
      expect(signals.listenerCount('SIGINT')).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports spawn errors and timeouts instead of treating an absent report as success', async () => {
    for (const mode of ['error', 'timeout']) {
      const dir = mkdtempSync(path.join(tmpdir(), 'output-audit-test-'));
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.pid = 123;
      try {
        const promise = launchAuditChild({
          dir,
          signals: new EventEmitter(),
          timeoutMs: 5,
          graceMs: 5,
          terminate: () => {
            writeFileSync(path.join(dir, 'terminated'), 'owned child');
            child.emit('close', 1, null);
          },
          spawnChild: () => {
            if (mode === 'error')
              queueMicrotask(() => child.emit('error', Error('start')));
            return child;
          },
        });
        expect((await promise).reason).toBe(
          mode === 'error' ? 'spawn-failed' : 'timed-out',
        );
        if (mode === 'timeout')
          expect(readFileSync(path.join(dir, 'terminated'), 'utf8')).toBe(
            'owned child',
          );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});

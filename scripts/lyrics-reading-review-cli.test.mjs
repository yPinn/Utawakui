import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildLocalLyricsReadingCorpus } from './lib/lyricsReadingCorpus/localCorpus.mjs';
import {
  applyLocalReadingReview,
  createLocalReadingReviewManifest,
  validateLocalReadingReviewManifest,
} from './lib/lyricsReadingCorpus/review.mjs';
import {
  localReadingReviewPaths,
  runLyricsReadingReviewCli,
} from './lyrics-reading-review-cli.mjs';

const COHORTS = [
  'standard',
  'proper-noun',
  'mixed',
  'jukujikun',
  'song-specific',
];

function sourceCorpus(caseCount = 105) {
  return buildLocalLyricsReadingCorpus(
    Array.from({ length: caseCount }, (_, index) => ({
      trackId: `track-${index}`,
      document: {
        schemaVersion: 3,
        script: 'ja',
        analyzer: { id: 'kuromoji-wanakana', version: '0.1.2+5.3.1' },
        lines: [
          {
            text: `試験文${index}`,
            segments: [{ t: `試験文${index}`, r: `しけんぶん${index}` }],
            edited: index === 0,
          },
        ],
      },
    })),
    {
      generatedAt: '2026-09-10T00:00:00.000Z',
      identitySalt: 'review-cli-test',
      limit: Math.max(100, caseCount),
    },
  );
}

function privateFixture(caseCount = 105) {
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-reading-review-'),
  );
  const paths = localReadingReviewPaths(privateRoot);
  const source = sourceCorpus(caseCount);
  fs.writeFileSync(paths.corpus, `${JSON.stringify(source, null, 2)}\n`, {
    mode: 0o600,
  });
  return { privateRoot, paths, source };
}

function promptAnswers(...answers) {
  const queue = [...answers];
  return async () => queue.shift() ?? 'q';
}

function outputCollector() {
  const lines = [];
  return {
    lines,
    consoleLike: {
      log(value) {
        lines.push(String(value));
      },
    },
  };
}

function runCli(options) {
  return runLyricsReadingReviewCli({
    secureDirectory() {},
    async acquireSessionLease() {
      return {
        assertHeld() {},
        async release() {},
      };
    },
    ...options,
  });
}

function sourceCases(source) {
  return [...source.goldSeed.cases, ...source.reviewQueue.cases];
}

describe('local lyrics reading review CLI', () => {
  afterEach(() => vi.restoreAllMocks());

  it('initializes an independent mutable file without hardlink publication and never clobbers an existing manifest', async () => {
    const { privateRoot, paths } = privateFixture();
    const link = vi.spyOn(fs, 'linkSync');
    await runCli({
      argv: ['init'],
      privateRoot,
      consoleLike: outputCollector().consoleLike,
    });
    if (process.platform === 'win32') expect(link).not.toHaveBeenCalled();
    expect(fs.statSync(paths.reviews).nlink).toBe(1);
    const original = fs.readFileSync(paths.reviews, 'utf8');
    await expect(
      runCli({
        argv: ['init'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      }),
    ).rejects.toThrow('already exists');
    expect(fs.readFileSync(paths.reviews, 'utf8')).toBe(original);
    await runCli({
      argv: ['review'],
      privateRoot,
      prompt: promptAnswers('s', 'q'),
      consoleLike: outputCollector().consoleLike,
    });
    expect(JSON.parse(fs.readFileSync(paths.reviews)).reviews[0].decision).toBe(
      'skipped',
    );
  });

  it.runIf(process.platform === 'win32')(
    'publishes only complete initialization and refuses a destination created during staging',
    async () => {
      const { privateRoot, paths, source } = privateFixture();
      const competing = `${JSON.stringify(createLocalReadingReviewManifest(source))}\n`;
      const sync = fs.fsyncSync;
      vi.spyOn(fs, 'fsyncSync').mockImplementation((descriptor) => {
        expect(fs.existsSync(paths.reviews)).toBe(false);
        const staged = fs
          .readdirSync(privateRoot)
          .find((name) => name.endsWith('.tmp'));
        expect(() =>
          validateLocalReadingReviewManifest(
            source,
            JSON.parse(fs.readFileSync(path.join(privateRoot, staged))),
          ),
        ).not.toThrow();
        sync(descriptor);
        fs.writeFileSync(paths.reviews, competing, { flag: 'wx' });
      });
      await expect(
        runCli({
          argv: ['init'],
          privateRoot,
          consoleLike: outputCollector().consoleLike,
        }),
      ).rejects.toThrow('without overwriting');
      expect(fs.readFileSync(paths.reviews, 'utf8')).toBe(competing);
      expect(
        fs.readdirSync(privateRoot).filter((name) => name.endsWith('.tmp')),
      ).toEqual([]);
    },
  );

  it.each(['writeFileSync', 'fsyncSync'])(
    'removes only its own incomplete initial manifest after %s fails',
    async (method) => {
      const { privateRoot, paths } = privateFixture();
      const failure = Object.assign(new Error('storage failed'), {
        code: 'ENOSPC',
      });
      vi.spyOn(fs, method).mockImplementation(() => {
        expect(fs.existsSync(paths.reviews)).toBe(false);
        throw failure;
      });
      await expect(
        runCli({
          argv: ['init'],
          privateRoot,
          consoleLike: outputCollector().consoleLike,
        }),
      ).rejects.toBe(failure);
      expect(fs.existsSync(paths.reviews)).toBe(false);
      vi.restoreAllMocks();
      await runCli({
        argv: ['init'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      });
      expect(() =>
        validateLocalReadingReviewManifest(
          sourceCorpus(),
          JSON.parse(fs.readFileSync(paths.reviews)),
        ),
      ).not.toThrow();
    },
  );

  it.runIf(process.platform === 'win32')(
    'saves after a real Windows reader releases its non-delete-sharing handle',
    async () => {
      const { privateRoot, paths } = privateFixture();
      await runCli({
        argv: ['init'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      });
      // FileShare.ReadWrite allows our safety reads but prevents atomic replacement.
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$f=[System.IO.File]::Open($env:READING_REVIEW_TEST_FILE,'Open','Read','ReadWrite'); try { [Console]::Out.WriteLine('ready'); [Console]::In.ReadLine() | Out-Null } finally { $f.Dispose() }",
        ],
        {
          env: { ...process.env, READING_REVIEW_TEST_FILE: paths.reviews },
          windowsHide: true,
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const exited = once(child, 'exit');
      let denials = 0;
      try {
        const ready = await Promise.race([
          once(child.stdout, 'data'),
          exited.then(() => {
            throw new Error('reader exited before readiness');
          }),
        ]);
        expect(String(ready[0]).trim()).toBe('ready');
        const rename = fs.renameSync;
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
          try {
            return rename(from, to);
          } catch (error) {
            if (to === paths.reviews) {
              expect(error.code).toBe('EPERM');
              denials++;
              if (!child.stdin.writableEnded) child.stdin.end('\n');
            }
            throw error;
          }
        });
        const output = outputCollector();
        await runCli({
          argv: ['review'],
          privateRoot,
          prompt: promptAnswers('a', '1', 'q'),
          consoleLike: output.consoleLike,
        });
        expect(denials).toBeGreaterThan(0);
        expect(output.lines).toContain('saved=approved');
        expect(
          JSON.parse(fs.readFileSync(paths.reviews)).reviews.filter(
            ({ decision }) => decision === 'approved',
          ),
        ).toHaveLength(1);
        expect(
          fs
            .readdirSync(privateRoot)
            .filter((name) => /\.(tmp|lock)$/.test(name)),
        ).toEqual([]);
      } finally {
        if (!child.stdin.writableEnded) child.stdin.end('\n');
        await exited;
      }
    },
  );

  it.each([
    ['EPERM', 'skip'],
    ['EACCES', 'approve'],
    ['EBUSY', 'undo'],
  ])(
    'retries transient %s during %s only on Windows while retaining locks and the original',
    async (code, action) => {
      const { privateRoot, paths } = privateFixture();
      await runCli({
        argv: ['init'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      });
      if (action === 'undo') {
        await runCli({
          argv: ['review'],
          privateRoot,
          prompt: promptAnswers('s', 'q'),
          consoleLike: outputCollector().consoleLike,
        });
      }
      const original = fs.readFileSync(paths.reviews, 'utf8');
      const rename = fs.renameSync;
      let attempts = 0;
      let released = false;
      const denial = Object.assign(new Error('sharing denied'), { code });
      vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (to === paths.reviews) {
          attempts++;
          expect(released).toBe(false);
          expect(fs.existsSync(`${paths.reviews}.lock`)).toBe(true);
          expect(fs.readFileSync(paths.reviews, 'utf8')).toBe(original);
          if (attempts < 3) throw denial;
        }
        return rename(from, to);
      });
      const output = outputCollector();
      const saving = runCli({
        argv: [action === 'undo' ? 'undo' : 'review'],
        privateRoot,
        prompt:
          action === 'approve'
            ? promptAnswers('a', '1', 'q')
            : promptAnswers('s', 'q'),
        consoleLike: output.consoleLike,
        async acquireSessionLease() {
          return {
            assertHeld() {},
            async release() {
              released = true;
            },
          };
        },
      });
      if (process.platform === 'win32') {
        await saving;
        expect(attempts).toBeGreaterThanOrEqual(3);
        expect(output.lines).toContain(
          action === 'undo'
            ? 'undo=ok'
            : action === 'approve'
              ? 'saved=approved'
              : 'saved=skipped',
        );
      } else {
        await expect(saving).rejects.toBe(denial);
        expect(attempts).toBe(1);
      }
      expect(released).toBe(true);
      expect(
        fs
          .readdirSync(privateRoot)
          .filter((name) => /\.(tmp|lock)$/.test(name)),
      ).toEqual([]);
    },
  );

  it.each(['EPERM', 'ENOSPC', 'EXDEV'])(
    'preserves the original and reports %s when replacement cannot succeed',
    async (code) => {
      const { privateRoot, paths } = privateFixture();
      await runCli({
        argv: ['init'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      });
      const original = fs.readFileSync(paths.reviews, 'utf8');
      const denial = Object.assign(new Error('cannot rename'), { code });
      const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw denial;
      });
      const output = outputCollector();
      await expect(
        runCli({
          argv: ['review'],
          privateRoot,
          prompt: promptAnswers('s', 'q'),
          consoleLike: output.consoleLike,
        }),
      ).rejects.toBe(denial);
      expect(rename).toHaveBeenCalledTimes(
        code === 'EPERM' && process.platform === 'win32' ? 21 : 1,
      );
      expect(fs.readFileSync(paths.reviews, 'utf8')).toBe(original);
      expect(output.lines).not.toContain('saved=skipped');
      expect(
        fs
          .readdirSync(privateRoot)
          .filter((name) => /\.(tmp|lock)$/.test(name)),
      ).toEqual([]);
    },
  );

  it
    .runIf(process.platform === 'win32')
    .each(['changed', 'hardlinked', 'lease-lost'])(
    'aborts a retry when the destination or lease becomes %s',
    async (change) => {
      const { privateRoot, paths } = privateFixture();
      await runCli({
        argv: ['review'],
        privateRoot,
        prompt: promptAnswers('s', 'q'),
        consoleLike: outputCollector().consoleLike,
      });
      const original = fs.readFileSync(paths.reviews, 'utf8');
      let leaseHeld = true;
      const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        // This event-loop turn runs during the retry wait, after the first validation.
        setImmediate(() => {
          if (change === 'hardlinked')
            fs.linkSync(paths.reviews, path.join(privateRoot, 'other.json'));
          if (change === 'lease-lost') leaseHeld = false;
          if (change === 'changed') {
            const manifest = JSON.parse(original);
            manifest.reviews[0].decision = 'pending';
            fs.writeFileSync(paths.reviews, JSON.stringify(manifest));
          }
        });
        throw Object.assign(new Error('sharing denied'), { code: 'EPERM' });
      });
      const output = outputCollector();
      await expect(
        runCli({
          argv: ['undo'],
          privateRoot,
          consoleLike: output.consoleLike,
          async acquireSessionLease() {
            return {
              assertHeld() {
                if (!leaseHeld) throw new Error('lease lost');
              },
              async release() {},
            };
          },
        }),
      ).rejects.toThrow(
        change === 'changed'
          ? 'changed in another session'
          : change === 'hardlinked'
            ? /private reading reviews/
            : 'lease lost',
      );
      expect(rename).toHaveBeenCalledTimes(1);
      expect(output.lines).not.toContain('undo=ok');
      if (change !== 'changed')
        expect(fs.readFileSync(paths.reviews, 'utf8')).toBe(original);
      expect(
        fs
          .readdirSync(privateRoot)
          .filter((name) => /\.(tmp|lock)$/.test(name)),
      ).toEqual([]);
    },
  );

  it('auto-initializes, accepts one case, saves it, and resumes without editing JSON', async () => {
    const { privateRoot, paths, source } = privateFixture();
    const output = outputCollector();

    const secured = [];
    await runCli({
      argv: ['review'],
      privateRoot,
      prompt: promptAnswers('a', '1', 'q'),
      consoleLike: output.consoleLike,
      secureDirectory(directory) {
        secured.push(directory);
      },
    });
    expect(secured).toEqual([privateRoot]);

    const manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(() =>
      validateLocalReadingReviewManifest(source, manifest),
    ).not.toThrow();
    expect(manifest.reviews[0]).toMatchObject({
      decision: 'approved',
      cohort: 'standard',
      analyzerAddressable: true,
    });
    expect(output.lines.join('\n')).toContain(sourceCases(source)[0].text);

    const status = outputCollector();
    await runCli({
      argv: ['status'],
      privateRoot,
      consoleLike: status.consoleLike,
    });
    expect(status.lines).toEqual([
      'total=105',
      'pending=104',
      'approved=1',
      'skipped=0',
      'cohort-standard=1',
      'cohort-proper-noun=0',
      'cohort-mixed=0',
      'cohort-jukujikun=0',
      'cohort-song-specific=0',
    ]);
    expect(status.lines.join('\n')).not.toContain(sourceCases(source)[0].text);
  });

  it('supports an indexed segment correction and song-specific classification', async () => {
    const { privateRoot, paths, source } = privateFixture();

    await runCli({
      argv: [],
      privateRoot,
      prompt: promptAnswers('e 1=そら', '5', 'q'),
      consoleLike: outputCollector().consoleLike,
    });

    const manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews[0]).toMatchObject({
      decision: 'approved',
      cohort: 'song-specific',
      analyzerAddressable: false,
      expectedKana: 'そら',
    });
    expect(manifest.reviews[0].expectedSegments).toEqual([
      { t: sourceCases(source)[0].text, r: 'そら' },
    ]);
  });

  it('skips uncertain cases and undo restores the most recent decision', async () => {
    const { privateRoot, paths } = privateFixture();
    await runCli({
      argv: ['review'],
      privateRoot,
      prompt: promptAnswers('s', 'q'),
      consoleLike: outputCollector().consoleLike,
    });

    let manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews[0].decision).toBe('skipped');

    const output = outputCollector();
    await runCli({
      argv: ['undo'],
      privateRoot,
      consoleLike: output.consoleLike,
    });
    manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews[0].decision).toBe('pending');
    expect(output.lines).toEqual(['undo=ok', 'pending=105']);
  });

  it('exports a no-clobber benchmark after 100 approved reviews', async () => {
    const { privateRoot, paths, source } = privateFixture();
    const manifest = createLocalReadingReviewManifest(source);
    sourceCases(source)
      .slice(0, 100)
      .forEach((sourceCase, index) => {
        applyLocalReadingReview(source, manifest, {
          caseId: sourceCase.id,
          decision: 'approved',
          cohort: COHORTS[index % COHORTS.length],
        });
      });
    fs.writeFileSync(paths.reviews, `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });

    const output = outputCollector();
    await runCli({
      argv: ['export'],
      privateRoot,
      consoleLike: output.consoleLike,
    });
    const benchmark = JSON.parse(fs.readFileSync(paths.benchmark, 'utf8'));
    expect(benchmark.cases).toHaveLength(100);
    expect(output.lines).toEqual(['case-count=100']);
    await expect(
      runCli({
        argv: ['export'],
        privateRoot,
        consoleLike: output.consoleLike,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects linked private artifacts and invalid commands', async () => {
    const { privateRoot, paths } = privateFixture();
    const linkedPath = path.join(privateRoot, 'linked-corpus.json');
    fs.linkSync(paths.corpus, linkedPath);

    await expect(
      runCli({
        argv: ['status'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      }),
    ).rejects.toThrow(/unsafe/i);
    await expect(
      runCli({
        argv: ['unknown'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      }),
    ).rejects.toThrow(/arguments/i);
  });

  it('fails before reading or writing when private-directory hardening fails', async () => {
    const { privateRoot, paths } = privateFixture();

    await expect(
      runCli({
        argv: ['review'],
        privateRoot,
        prompt: promptAnswers('q'),
        consoleLike: outputCollector().consoleLike,
        secureDirectory() {
          throw new TypeError('private ACL is invalid');
        },
      }),
    ).rejects.toThrow(/ACL/i);
    expect(fs.existsSync(paths.reviews)).toBe(false);
  });

  it('rejects a second review session before it can lose a saved decision', async () => {
    const { privateRoot, paths, source } = privateFixture();
    let leaseHeld = false;
    const acquireSessionLease = async () => {
      if (leaseHeld) {
        throw new TypeError(
          'private reading reviews are active in another session',
        );
      }
      leaseHeld = true;
      return {
        assertHeld() {
          if (!leaseHeld) throw new TypeError('session lease was lost');
        },
        async release() {
          leaseHeld = false;
        },
      };
    };
    let continueFirst;
    const firstMayContinue = new Promise((resolve) => {
      continueFirst = resolve;
    });
    let firstPromptReached;
    const reachedFirstPrompt = new Promise((resolve) => {
      firstPromptReached = resolve;
    });
    let firstDecisionPrompts = 0;
    const first = runCli({
      argv: ['review'],
      privateRoot,
      acquireSessionLease,
      prompt: async (question) => {
        if (!question.startsWith('decision')) return '1';
        firstDecisionPrompts += 1;
        if (firstDecisionPrompts > 1) return 'q';
        firstPromptReached();
        await firstMayContinue;
        return 's';
      },
      consoleLike: outputCollector().consoleLike,
    });
    await reachedFirstPrompt;

    await expect(
      runCli({
        argv: ['review'],
        privateRoot,
        acquireSessionLease,
        prompt: promptAnswers('a', '1', 'q'),
        consoleLike: outputCollector().consoleLike,
      }),
    ).rejects.toThrow(/another session/i);
    continueFirst();
    await first;

    const manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(() =>
      validateLocalReadingReviewManifest(source, manifest),
    ).not.toThrow();
    expect(
      manifest.reviews.filter(({ decision }) => decision !== 'pending'),
    ).toHaveLength(1);
  });

  it('recovers an expired dead-owner lock but never steals a live-owner lock', async () => {
    const { privateRoot, paths } = privateFixture();
    await runCli({
      argv: ['review'],
      privateRoot,
      prompt: promptAnswers('q'),
      consoleLike: outputCollector().consoleLike,
    });
    const lockPath = `${paths.reviews}.lock`;
    const lock = (pid, createdAtMs) => ({
      schemaVersion: 1,
      pid,
      createdAtMs,
      token: '00000000-0000-4000-8000-000000000001',
    });

    fs.writeFileSync(
      lockPath,
      JSON.stringify(lock(2_147_483_647, Date.now() - 60_000)),
      { mode: 0o600 },
    );
    await runCli({
      argv: ['review'],
      privateRoot,
      prompt: promptAnswers('s', 'q'),
      consoleLike: outputCollector().consoleLike,
    });
    expect(fs.existsSync(lockPath)).toBe(false);
    let manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews[0].decision).toBe('skipped');

    fs.writeFileSync(lockPath, JSON.stringify(lock(process.pid, Date.now())), {
      mode: 0o600,
    });
    await expect(
      runCli({
        argv: ['undo'],
        privateRoot,
        consoleLike: outputCollector().consoleLike,
      }),
    ).rejects.toThrow(/another session/i);
    manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews[0].decision).toBe('skipped');
  });
});

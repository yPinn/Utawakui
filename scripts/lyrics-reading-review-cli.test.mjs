import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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

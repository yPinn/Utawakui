import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCandidatePreparationCli } from './lyrics-provider-corpus-prepare-cli.mjs';

const temporaryDirectories = [];

function temporaryWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-corpus-'));
  temporaryDirectories.push(directory);
  return directory;
}

function candidateSet() {
  return {
    schemaVersion: 1,
    candidateSetId: 'lyrics-provider-private-candidates-v4',
    status: 'needs-review',
    policy: {
      targetCount: 40,
      casesPerStratum: 8,
      mainstreamCasesPerStratum: 7,
      longTailCasesPerStratum: 1,
      minimumFirstReleaseYear: 2010,
      mainstreamSelection: 'highest-user-count-then-listen-count',
      popularityBasis: 'listenbrainz-users-within-stratum',
      middlePopularityBand: 'excluded',
      maxPrimaryArtistPerStratum: 2,
    },
    candidates: [{ id: 'candidate-0000000000000000', privateTitle: 'secret' }],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('private lyrics candidate preparation CLI', () => {
  it('writes only the fixed ignored candidate path and prints counts only', async () => {
    const cwd = temporaryWorkspace();
    const log = vi.fn();
    const prepare = vi.fn(async ({ onProgress }) => {
      onProgress({ stage: 'wikidata', count: 5 });
      onProgress({ stage: 'selected', count: 40 });
      return candidateSet();
    });

    await expect(
      runCandidatePreparationCli({
        argv: [],
        cwd,
        consoleLike: { log },
        prepare,
      }),
    ).resolves.toBe(0);

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ version: 4 }),
    );

    const outputPath = path.join(
      cwd,
      '.benchmarks',
      'lyrics-provider',
      'candidates.json',
    );
    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual(
      candidateSet(),
    );
    expect(
      fs.existsSync(
        path.join(cwd, '.benchmarks', 'lyrics-provider', 'corpus.json'),
      ),
    ).toBe(false);
    expect(log.mock.calls.flat()).toEqual([
      'wikidata-count=5',
      'selected-count=40',
      'candidate-count=1',
    ]);
    expect(log.mock.calls.flat().join('\n')).not.toContain('secret');
  });

  it('refuses to overwrite an existing private candidate artifact', async () => {
    const cwd = temporaryWorkspace();
    const outputDirectory = path.join(cwd, '.benchmarks', 'lyrics-provider');
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, 'candidates.json'), 'existing');

    await expect(
      runCandidatePreparationCli({
        argv: [],
        cwd,
        consoleLike: { log: vi.fn() },
        prepare: vi.fn(async () => candidateSet()),
      }),
    ).rejects.toThrow(/already exists/i);
    expect(
      fs.readFileSync(path.join(outputDirectory, 'candidates.json'), 'utf8'),
    ).toBe('existing');
  });

  it('rejects an unsafe private output directory', async () => {
    const cwd = temporaryWorkspace();
    fs.writeFileSync(path.join(cwd, '.benchmarks'), 'not-a-directory');

    await expect(
      runCandidatePreparationCli({
        argv: [],
        cwd,
        consoleLike: { log: vi.fn() },
        prepare: async () => candidateSet(),
      }),
    ).rejects.toThrow(/directory is unsafe/i);
  });

  it('rejects an oversized private candidate artifact', async () => {
    const cwd = temporaryWorkspace();
    const oversized = {
      ...candidateSet(),
      privatePadding: 'x'.repeat(1_048_576),
    };

    await expect(
      runCandidatePreparationCli({
        argv: [],
        cwd,
        consoleLike: { log: vi.fn() },
        prepare: async () => oversized,
      }),
    ).rejects.toThrow(/too large/i);
    expect(
      fs.existsSync(
        path.join(cwd, '.benchmarks', 'lyrics-provider', 'candidates.json'),
      ),
    ).toBe(false);
  });

  it('removes its temporary file when the destination appears during publication', async () => {
    const cwd = temporaryWorkspace();
    const outputDirectory = path.join(cwd, '.benchmarks', 'lyrics-provider');
    const outputPath = path.join(outputDirectory, 'candidates.json');
    const linkSync = fs.linkSync.bind(fs);
    vi.spyOn(fs, 'linkSync').mockImplementationOnce((source, destination) => {
      fs.writeFileSync(destination, 'concurrent', { flag: 'wx' });
      return linkSync(source, destination);
    });

    await expect(
      runCandidatePreparationCli({
        argv: [],
        cwd,
        consoleLike: { log: vi.fn() },
        prepare: async () => candidateSet(),
      }),
    ).rejects.toThrow();
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('concurrent');
    expect(
      fs
        .readdirSync(outputDirectory)
        .some((name) => name.startsWith('.candidates-')),
    ).toBe(false);
  });

  it('runs a read-only smoke with no private artifact', async () => {
    const cwd = temporaryWorkspace();
    const log = vi.fn();
    const smoke = vi.fn(async () => ({
      seedCount: 5,
      recordingCount: 10,
      popularityAvailableCount: 9,
      popularityUnavailableCount: 1,
    }));

    await expect(
      runCandidatePreparationCli({
        argv: ['--smoke'],
        cwd,
        consoleLike: { log },
        smoke,
      }),
    ).resolves.toBe(0);

    expect(smoke).toHaveBeenCalledWith({ version: 4 });

    expect(fs.existsSync(path.join(cwd, '.benchmarks'))).toBe(false);
    expect(log.mock.calls.flat()).toEqual([
      'seed-count=5',
      'recording-count=10',
      'popularity-available-count=9',
      'popularity-unavailable-count=1',
    ]);
  });

  it.each([['private.json'], ['--replace'], ['--smoke', 'extra']])(
    'rejects unsupported arguments without calling network work',
    async (...argv) => {
      const prepare = vi.fn();
      const smoke = vi.fn();
      await expect(
        runCandidatePreparationCli({
          argv,
          cwd: temporaryWorkspace(),
          consoleLike: { log: vi.fn() },
          prepare,
          smoke,
        }),
      ).rejects.toThrow(/arguments/i);
      expect(prepare).not.toHaveBeenCalled();
      expect(smoke).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ argv: false, consoleLike: { log: vi.fn() } }],
    [{ argv: [], consoleLike: false }],
    [{ argv: [], consoleLike: {} }],
  ])('rejects malformed CLI input', async (options) => {
    await expect(
      runCandidatePreparationCli({
        ...options,
        cwd: temporaryWorkspace(),
      }),
    ).rejects.toThrow(/CLI input is invalid/i);
  });
});

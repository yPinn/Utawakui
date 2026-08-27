import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildPrivateCandidateSet,
  CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION,
} from './lyrics-provider-corpus-candidates.mjs';
import { runLyricsProviderCorpusReviewCli } from './lyrics-provider-corpus-review-cli.mjs';

const temporaryDirectories = [];
const STRATA = [
  ['chinese-rap', 'mandarin'],
  ['chinese-pop', 'mandarin'],
  ['english-catalog', 'english'],
  ['japanese-catalog', 'japanese'],
  ['korean-catalog', 'korean'],
];

function recordingId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function candidateSet() {
  let sequence = 1;
  return buildPrivateCandidateSet(
    STRATA.flatMap(([stratum, languageTag]) =>
      Array.from({ length: 60 }, (_, index) => {
        const candidate = {
          stratum,
          languageTag,
          recordingMbid: recordingId(sequence),
          primaryArtistMbid: recordingId(500_000 + sequence),
          workQid: `Q${100_000 + sequence}`,
          workMbid: recordingId(100_000 + sequence),
          title: `Secret title ${sequence}`,
          artist: `Secret artist ${sequence}`,
          album: null,
          durationMs: 180_000 + index,
          firstReleaseDate: '2024',
          listenCount: 100_000 - index * 100,
          userCount: 10_000 - index,
        };
        sequence += 1;
        return candidate;
      }),
    ),
    {
      candidateSetVersion: CURRENT_PRIVATE_LYRICS_CANDIDATE_SET_VERSION,
    },
  );
}

function temporaryWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-review-'));
  temporaryDirectories.push(directory);
  return directory;
}

function privatePaths(cwd) {
  const directory = path.join(cwd, '.benchmarks', 'lyrics-provider');
  return {
    directory,
    candidates: path.join(directory, 'candidates.json'),
    reviews: path.join(directory, 'reviews.json'),
    corpus: path.join(directory, 'corpus.json'),
  };
}

function writeCandidates(cwd, value = candidateSet()) {
  const paths = privatePaths(cwd);
  fs.mkdirSync(paths.directory, { recursive: true });
  fs.writeFileSync(paths.candidates, JSON.stringify(value));
  return paths;
}

function approveManifest(candidates, manifest) {
  const byId = new Map(candidates.candidates.map((item) => [item.id, item]));
  for (const review of manifest.reviews) {
    const candidate = byId.get(review.candidateId);
    Object.assign(review, {
      decision: 'approved',
      rejectionReason: null,
      stratum: candidate.stratum,
      languageTag: candidate.languageTag,
      version: 'studio',
      eraTag: 'recent-release',
      versionTrap: false,
      reference: {
        title: candidate.reference.title,
        artist: candidate.reference.artist,
        album: candidate.reference.album,
        durationSeconds: candidate.reference.durationSeconds,
        version: 'studio',
      },
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('private lyrics corpus review CLI', () => {
  it('initializes only the fixed all-pending private review path', async () => {
    const cwd = temporaryWorkspace();
    const paths = writeCandidates(cwd);
    const log = vi.fn();

    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['init'],
        cwd,
        consoleLike: { log },
      }),
    ).resolves.toBe(0);

    const manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    expect(manifest.reviews).toHaveLength(40);
    expect(
      manifest.reviews.every(({ decision }) => decision === 'pending'),
    ).toBe(true);
    expect(fs.existsSync(paths.corpus)).toBe(false);
    expect(log.mock.calls.flat()).toEqual([
      'review-count=40',
      'pending-count=40',
    ]);
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/Secret|candidate-/u);
  });

  it('blocks pending reviews without creating a corpus', async () => {
    const cwd = temporaryWorkspace();
    const paths = writeCandidates(cwd);
    await runLyricsProviderCorpusReviewCli({
      argv: ['init'],
      cwd,
      consoleLike: { log: vi.fn() },
    });

    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['export'],
        cwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow(/all 40 candidate reviews must be approved/i);
    expect(fs.existsSync(paths.corpus)).toBe(false);
  });

  it('exports an approved review manifest without private provenance', async () => {
    const cwd = temporaryWorkspace();
    const candidates = candidateSet();
    const paths = writeCandidates(cwd, candidates);
    await runLyricsProviderCorpusReviewCli({
      argv: ['init'],
      cwd,
      consoleLike: { log: vi.fn() },
    });
    const manifest = JSON.parse(fs.readFileSync(paths.reviews, 'utf8'));
    approveManifest(candidates, manifest);
    fs.writeFileSync(paths.reviews, JSON.stringify(manifest));
    const log = vi.fn();

    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['export'],
        cwd,
        consoleLike: { log },
      }),
    ).resolves.toBe(0);

    const corpusText = fs.readFileSync(paths.corpus, 'utf8');
    const corpus = JSON.parse(corpusText);
    expect(corpus.cases).toHaveLength(40);
    expect(corpusText).not.toMatch(
      /candidate-|recordingMbid|listenCount|workQid/u,
    );
    expect(log.mock.calls.flat()).toEqual(['case-count=40']);
    expect(log.mock.calls.flat().join('\n')).not.toContain('Secret');
  });

  it('refuses to overwrite review or corpus artifacts', async () => {
    const cwd = temporaryWorkspace();
    const paths = writeCandidates(cwd);
    fs.writeFileSync(paths.reviews, 'existing');
    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['init'],
        cwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow(/already exists/i);
    expect(fs.readFileSync(paths.reviews, 'utf8')).toBe('existing');

    fs.writeFileSync(paths.corpus, 'existing corpus');
    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['export'],
        cwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow(/already exists/i);
    expect(fs.readFileSync(paths.corpus, 'utf8')).toBe('existing corpus');
  });

  it('rejects oversized, symbolic-link and non-file private inputs', async () => {
    const oversizedCwd = temporaryWorkspace();
    const oversizedPaths = privatePaths(oversizedCwd);
    fs.mkdirSync(oversizedPaths.directory, { recursive: true });
    fs.writeFileSync(oversizedPaths.candidates, 'x'.repeat(1_048_577));
    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['init'],
        cwd: oversizedCwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow(/size limit/i);

    const linkCwd = temporaryWorkspace();
    const linkPaths = privatePaths(linkCwd);
    fs.mkdirSync(linkPaths.directory, { recursive: true });
    const target = path.join(linkCwd, 'candidate-target.json');
    fs.writeFileSync(target, JSON.stringify(candidateSet()));
    try {
      fs.symlinkSync(target, linkPaths.candidates, 'file');
      await expect(
        runLyricsProviderCorpusReviewCli({
          argv: ['init'],
          cwd: linkCwd,
          consoleLike: { log: vi.fn() },
        }),
      ).rejects.toThrow(/unsafe/i);
    } catch (error) {
      if (error?.code !== 'EPERM') throw error;
    }

    const directoryCwd = temporaryWorkspace();
    const directoryPaths = privatePaths(directoryCwd);
    fs.mkdirSync(directoryPaths.candidates, { recursive: true });
    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['init'],
        cwd: directoryCwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow(/unsafe/i);
  });

  it('cleans its temporary file when the destination appears during publication', async () => {
    const cwd = temporaryWorkspace();
    const paths = writeCandidates(cwd);
    const linkSync = fs.linkSync.bind(fs);
    vi.spyOn(fs, 'linkSync').mockImplementationOnce((source, destination) => {
      fs.writeFileSync(destination, 'concurrent', { flag: 'wx' });
      return linkSync(source, destination);
    });

    await expect(
      runLyricsProviderCorpusReviewCli({
        argv: ['init'],
        cwd,
        consoleLike: { log: vi.fn() },
      }),
    ).rejects.toThrow();
    expect(fs.readFileSync(paths.reviews, 'utf8')).toBe('concurrent');
    expect(
      fs
        .readdirSync(paths.directory)
        .some((name) => name.startsWith('.reviews-')),
    ).toBe(false);
  });

  it.each([[], ['review'], ['init', 'extra'], ['--path', 'private.json']])(
    'rejects unsupported arguments %j',
    async (argv) => {
      await expect(
        runLyricsProviderCorpusReviewCli({
          argv,
          cwd: temporaryWorkspace(),
          consoleLike: { log: vi.fn() },
        }),
      ).rejects.toThrow(/arguments/i);
    },
  );
});

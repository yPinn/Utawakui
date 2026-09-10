import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLocalLyricsReadingCorpus,
  defaultPrivateCorpusRoot,
  parseLocalLyricsReadingCorpusArgs,
  prepareLocalLyricsReadingCorpus,
  scanLocalLyricsReadingDocuments,
} from './lyrics-reading-local-corpus.mjs';

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-local-reading-corpus-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function readingDocument(lines, overrides = {}) {
  return {
    version: 3,
    sourceFilename: 'ja.lrc',
    script: 'ja',
    analyzer: { id: 'kuromoji-wanakana', version: '0.1.2' },
    sourceFingerprint: 'a'.repeat(64),
    lines,
    ...overrides,
  };
}

function readingLine(text, segments, overrides = {}) {
  return {
    text,
    segments,
    romaji: 'local-only',
    edited: false,
    ...overrides,
  };
}

function writeReadingDocument(libraryDirectory, trackId, filename, document) {
  const readingsDirectory = path.join(
    libraryDirectory,
    'tracks',
    trackId,
    'lyrics',
    'readings',
  );
  fs.mkdirSync(readingsDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(readingsDirectory, filename),
    `${JSON.stringify(document)}\n`,
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('local lyrics reading corpus contract', () => {
  it('separates edited gold seeds from unreviewed lines without recording metadata', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'private-track-id',
          sourceKey: 'private-source-name',
          document: readingDocument([
            readingLine('君の声', [
              { t: '君', r: 'きみ' },
              { t: 'の' },
              { t: '声', r: 'こえ' },
            ]),
            readingLine('宇宙', [{ t: '宇宙', r: 'そら' }], {
              edited: true,
            }),
            readingLine('English only', [{ t: 'English only' }]),
            readingLine('長'.repeat(161), [
              { t: '長'.repeat(161), r: 'ながい' },
            ]),
          ]),
        },
      ],
      { generatedAt: '2026-09-10T00:00:00.000Z', limit: 200 },
    );

    expect(corpus.reviewQueue.cases).toEqual([
      expect.objectContaining({
        text: '君の声',
        currentKana: 'きみのこえ',
        currentSegments: [
          { t: '君', r: 'きみ' },
          { t: 'の' },
          { t: '声', r: 'こえ' },
        ],
        review: {
          status: 'pending',
          cohort: null,
          analyzerAddressable: null,
          expectedKana: null,
          expectedSegments: null,
          notes: null,
        },
      }),
    ]);
    expect(corpus.goldSeed.cases).toEqual([
      expect.objectContaining({
        text: '宇宙',
        expectedKana: 'そら',
        expectedSegments: [{ t: '宇宙', r: 'そら' }],
        review: {
          status: 'needs-classification',
          cohort: null,
          analyzerAddressable: null,
          notes: null,
        },
      }),
    ]);
    expect(corpus.summary).toMatchObject({
      documentsScanned: 1,
      eligibleAutomaticLines: 1,
      editedGoldSeedLines: 1,
      excludedNonJapaneseLines: 1,
      excludedLongLines: 1,
      reviewQueueLines: 1,
    });

    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toContain('private-track-id');
    expect(serialized).not.toContain('private-source-name');
    expect(serialized).not.toContain('ja.lrc');
    expect(serialized).not.toContain('local-only');
    expect(corpus.reviewQueue.cases[0].recordingIdentity).toMatch(
      /^local:[a-f0-9]{64}$/,
    );
  });

  it('deduplicates exact text, limits each recording, and prefers diverse script shapes', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
            readingLine('青い空', [{ t: '青い空', r: 'あおいそら' }]),
          ]),
        },
        {
          trackId: 'track-b',
          sourceKey: 'source-b',
          document: readingDocument([
            readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
            readingLine('夢 tonight', [
              { t: '夢', r: 'ゆめ' },
              { t: ' tonight' },
            ]),
            readingLine('だから', [{ t: 'だから' }]),
          ]),
        },
      ],
      {
        generatedAt: '2026-09-10T00:00:00.000Z',
        limit: 3,
        perRecordingLimit: 2,
      },
    );

    expect(corpus.reviewQueue.cases).toHaveLength(3);
    expect(
      new Set(corpus.reviewQueue.cases.map((candidate) => candidate.text)).size,
    ).toBe(3);
    expect(
      new Set(corpus.reviewQueue.cases.map((candidate) => candidate.shape)),
    ).toEqual(new Set(['kanji-kana', 'mixed-latin', 'kana-only']));
    const perRecording = Object.values(
      Object.groupBy(
        corpus.reviewQueue.cases,
        (candidate) => candidate.recordingIdentity,
      ),
    ).map((entries) => entries.length);
    expect(Math.max(...perRecording)).toBeLessThanOrEqual(2);
    expect(corpus.summary.excludedDuplicateTextLines).toBe(1);
  });

  it('uses alternate recordings when duplicate text would exhaust one recording budget', () => {
    const sharedLines = ['春', '夏', '秋', '冬'].map((text) =>
      readingLine(text, [{ t: text, r: 'かな' }]),
    );
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument(sharedLines),
        },
        {
          trackId: 'track-b',
          sourceKey: 'source-b',
          document: readingDocument(sharedLines),
        },
      ],
      {
        identitySalt: 'private-run',
        limit: 4,
        perRecordingLimit: 2,
      },
    );

    expect(corpus.summary.eligibleAutomaticLines).toBe(4);
    expect(corpus.reviewQueue.cases).toHaveLength(4);
    expect(
      Object.values(
        Object.groupBy(
          corpus.reviewQueue.cases,
          (candidate) => candidate.recordingIdentity,
        ),
      )
        .map((entries) => entries.length)
        .sort(),
    ).toEqual([2, 2]);
  });

  it('reassigns an earlier duplicate so asymmetric alternatives can fill the limit', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('春', [{ t: '春', r: 'はる' }]),
            readingLine('秋', [{ t: '秋', r: 'あき' }]),
          ]),
        },
        {
          trackId: 'track-b',
          sourceKey: 'source-b',
          document: readingDocument([
            readingLine('春', [{ t: '春', r: 'はる' }]),
          ]),
        },
      ],
      {
        identitySalt: 'private-run',
        limit: 2,
        perRecordingLimit: 1,
      },
    );

    expect(corpus.summary.eligibleAutomaticLines).toBe(2);
    expect(corpus.reviewQueue.cases).toHaveLength(2);
    expect(
      new Set(
        corpus.reviewQueue.cases.map(
          (candidate) => candidate.recordingIdentity,
        ),
      ).size,
    ).toBe(2);
  });

  it('fails closed when matching exceeds its edge-visit work budget', () => {
    expect(() =>
      buildLocalLyricsReadingCorpus(
        [
          {
            trackId: 'track-a',
            sourceKey: 'source-a',
            document: readingDocument([
              readingLine('春', [{ t: '春', r: 'はる' }]),
              readingLine('秋', [{ t: '秋', r: 'あき' }]),
            ]),
          },
        ],
        {
          identitySalt: 'private-run',
          limit: 2,
          perRecordingLimit: 1,
          matchingEdgeVisitLimit: 1,
        },
      ),
    ).toThrow(/matching work budget/i);
  });

  it('fails closed on malformed Japanese reading lines', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('壊れた', [{ t: '違う', r: 'こわれた' }]),
            readingLine('空', [{ t: '空', r: 42 }]),
            readingLine('声', [{ t: '声', r: 'こえ' }]),
          ]),
        },
      ],
      { generatedAt: '2026-09-10T00:00:00.000Z', limit: 200 },
    );

    expect(corpus.reviewQueue.cases.map((candidate) => candidate.text)).toEqual(
      ['声'],
    );
    expect(corpus.summary.excludedMalformedLines).toBe(2);
  });

  it('uses a private run salt so opaque recording identities cannot be linked', () => {
    const records = [
      {
        trackId: 'guessable-track-id',
        sourceKey: 'ja.lrc.json',
        document: readingDocument([
          readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
        ]),
      },
    ];
    const first = buildLocalLyricsReadingCorpus(records, {
      generatedAt: '2026-09-10T00:00:00.000Z',
      identitySalt: 'private-run-a',
      limit: 200,
    });
    const second = buildLocalLyricsReadingCorpus(records, {
      generatedAt: '2026-09-10T00:00:00.000Z',
      identitySalt: 'private-run-b',
      limit: 200,
    });

    expect(first.reviewQueue.cases[0].recordingIdentity).not.toBe(
      second.reviewQueue.cases[0].recordingIdentity,
    );
    expect(JSON.stringify(first)).not.toContain('private-run-a');
  });

  it('keeps sample selection stable when the private identity salt changes', () => {
    const records = [
      {
        trackId: 'track-a',
        sourceKey: 'ja.lrc.json',
        document: readingDocument(
          ['空', '声', '夢', '愛', '歌', '光'].map((text) =>
            readingLine(text, [{ t: text, r: 'かな' }]),
          ),
        ),
      },
    ];
    const first = buildLocalLyricsReadingCorpus(records, {
      identitySalt: 'private-run-a',
      limit: 3,
      perRecordingLimit: 3,
    });
    const second = buildLocalLyricsReadingCorpus(records, {
      identitySalt: 'private-run-b',
      limit: 3,
      perRecordingLimit: 3,
    });

    expect(first.reviewQueue.cases.map((candidate) => candidate.text)).toEqual(
      second.reviewQueue.cases.map((candidate) => candidate.text),
    );
  });

  it('applies the per-recording limit across multiple sidecars', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'same-track',
          sourceKey: 'ja.lrc.json',
          document: readingDocument([
            readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
          ]),
        },
        {
          trackId: 'same-track',
          sourceKey: 'ja.vtt.json',
          document: readingDocument(
            [readingLine('青い空', [{ t: '青い空', r: 'あおいそら' }])],
            { sourceFilename: 'ja.vtt' },
          ),
        },
      ],
      {
        identitySalt: 'private-run',
        limit: 3,
        perRecordingLimit: 1,
      },
    );

    expect(corpus.reviewQueue.cases).toHaveLength(1);
  });

  it('caps edited gold seeds by total and per-recording limits', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument(
            ['空', '声', '夢', '愛', '歌'].map((text) =>
              readingLine(text, [{ t: text, r: 'かな' }], { edited: true }),
            ),
          ),
        },
      ],
      {
        generatedAt: '2026-09-10T00:00:00.000Z',
        identitySalt: 'private-run',
        limit: 3,
        perRecordingLimit: 2,
      },
    );

    expect(corpus.goldSeed.cases).toHaveLength(2);
    expect(corpus.summary.availableEditedGoldSeedLines).toBe(5);
    expect(corpus.summary.editedGoldSeedLines).toBe(2);
    expect(corpus.summary.goldSeedTruncated).toBe(true);
  });

  it('shares one per-recording budget across gold and automatic cases', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            ...['空', '声', '夢', '愛'].map((text) =>
              readingLine(text, [{ t: text, r: 'かな' }], { edited: true }),
            ),
            ...['歌', '光', '夜', '朝'].map((text) =>
              readingLine(text, [{ t: text, r: 'かな' }]),
            ),
          ]),
        },
      ],
      {
        identitySalt: 'private-run',
        limit: 10,
        perRecordingLimit: 4,
      },
    );

    expect(corpus.goldSeed.cases.length + corpus.reviewQueue.cases.length).toBe(
      4,
    );
  });

  it('reassigns a gold duplicate so automatic cases can fill the combined limit', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('春', [{ t: '春', r: 'はる' }], { edited: true }),
            readingLine('秋', [{ t: '秋', r: 'あき' }]),
          ]),
        },
        {
          trackId: 'track-b',
          sourceKey: 'source-b',
          document: readingDocument([
            readingLine('春', [{ t: '春', r: 'はる' }], { edited: true }),
          ]),
        },
      ],
      {
        identitySalt: 'private-run',
        limit: 2,
        perRecordingLimit: 1,
      },
    );

    expect(corpus.goldSeed.cases).toHaveLength(1);
    expect(corpus.reviewQueue.cases).toHaveLength(1);
    expect(
      new Set([
        corpus.goldSeed.cases[0].recordingIdentity,
        corpus.reviewQueue.cases[0].recordingIdentity,
      ]).size,
    ).toBe(2);
  });

  it('rejects control characters instead of hashing ambiguous tuples', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('歌\0う', [{ t: '歌\0う', r: 'た' }]),
            readingLine('歌', [{ t: '歌', r: 'う\0た' }]),
          ]),
        },
      ],
      { identitySalt: 'private-run', limit: 10 },
    );

    expect(corpus.reviewQueue.cases).toEqual([]);
    expect(corpus.summary.excludedControlCharacterLines).toBe(2);
  });

  it('fails closed when one edited text has conflicting readings', () => {
    const corpus = buildLocalLyricsReadingCorpus(
      [
        {
          trackId: 'track-a',
          sourceKey: 'source-a',
          document: readingDocument([
            readingLine('宇宙', [{ t: '宇宙', r: 'うちゅう' }], {
              edited: true,
            }),
          ]),
        },
        {
          trackId: 'track-b',
          sourceKey: 'source-b',
          document: readingDocument([
            readingLine('宇宙', [{ t: '宇宙', r: 'そら' }], { edited: true }),
          ]),
        },
      ],
      { identitySalt: 'private-run', limit: 3 },
    );

    expect(corpus.goldSeed.cases).toEqual([]);
    expect(corpus.summary.conflictingEditedGoldLines).toBe(2);
  });
});

describe('local lyrics reading corpus CLI', () => {
  it('enforces aggregate source-byte and raw-directory-entry budgets', () => {
    const root = temporaryDirectory();
    const libraryDirectory = path.join(root, 'library');
    writeReadingDocument(
      libraryDirectory,
      'track-a',
      'ja.lrc.json',
      readingDocument([
        readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
      ]),
    );

    expect(() =>
      scanLocalLyricsReadingDocuments(libraryDirectory, {
        maxTotalBytes: 10,
      }),
    ).toThrow(/byte budget/i);
    expect(() =>
      scanLocalLyricsReadingDocuments(libraryDirectory, {
        maxDirectoryEntries: 1,
      }),
    ).toThrow(/entry limit/i);
  });

  it('validates the bounded review limit and separate output directory', () => {
    const privateRoot = defaultPrivateCorpusRoot();
    expect(
      parseLocalLyricsReadingCorpusArgs([
        'library',
        path.join(privateRoot, 'output'),
        '--limit',
        '200',
      ]),
    ).toMatchObject({ limit: 200 });
    expect(() =>
      parseLocalLyricsReadingCorpusArgs([
        'library',
        path.join(privateRoot, 'output'),
        '--limit',
        '99',
      ]),
    ).toThrow(/limit/i);
    expect(() =>
      parseLocalLyricsReadingCorpusArgs(['library', 'library/output']),
    ).toThrow(/private output root/i);
    const libraryInsidePrivateRoot = path.join(privateRoot, 'library');
    expect(() =>
      parseLocalLyricsReadingCorpusArgs([
        libraryInsidePrivateRoot,
        path.join(libraryInsidePrivateRoot, '..private', 'corpus.json'),
      ]),
    ).toThrow(/outside the library/i);

    if (process.platform === 'win32') {
      expect(() =>
        parseLocalLyricsReadingCorpusArgs([
          'library',
          privateRoot.toUpperCase(),
        ]),
      ).toThrow(/private output root/i);
    }
  });

  it('writes private files once and reports statistics without paths or lyrics', () => {
    const root = temporaryDirectory();
    const libraryDirectory = path.join(root, 'library');
    const outputPath = path.join(root, 'private-output', 'corpus.json');
    writeReadingDocument(
      libraryDirectory,
      'private-track-id',
      'ja.lrc.json',
      readingDocument([
        readingLine('君の声', [{ t: '君の声', r: 'きみのこえ' }]),
        readingLine('宇宙', [{ t: '宇宙', r: 'そら' }], { edited: true }),
      ]),
    );

    const summary = prepareLocalLyricsReadingCorpus({
      libraryDirectory,
      outputPath,
      privateOutputRoot: root,
      generatedAt: '2026-09-10T00:00:00.000Z',
      limit: 200,
    });

    const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(written.reviewQueue.cases).toHaveLength(1);
    expect(written.goldSeed.cases).toHaveLength(1);
    expect(summary).toMatchObject({
      reviewQueueLines: 1,
      editedGoldSeedLines: 1,
    });
    expect(JSON.stringify(summary)).not.toContain('君の声');
    expect(JSON.stringify(summary)).not.toContain(root);
    expect(() =>
      prepareLocalLyricsReadingCorpus({
        libraryDirectory,
        outputPath,
        privateOutputRoot: root,
        generatedAt: '2026-09-10T00:00:00.000Z',
        limit: 200,
      }),
    ).toThrow(/already exists/i);
  });
});

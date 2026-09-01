import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteTrackReading,
  getTrackReading,
  loadTrackReadingForIdentity,
  readingSidecarPath,
  saveTrackReading,
  setReadingLine,
} from './lyricsReadings.js';

let trackDir;

beforeEach(() => {
  trackDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-lyrics-readings-test-'),
  );
});

afterEach(() => {
  fs.rmSync(trackDir, { recursive: true, force: true });
});

const sampleDoc = {
  analyzer: { id: 'fake-ja', version: '0' },
  lines: [
    {
      text: '歌う声',
      segments: [{ t: '歌', r: 'うた' }, { t: 'う' }, { t: '声', r: 'こえ' }],
      romaji: 'utau koe',
      edited: false,
    },
    { text: 'です', segments: [{ t: 'です' }], romaji: 'desu', edited: false },
  ],
};

const sampleKoreanDoc = {
  analyzer: { id: 'fake-koroman', version: '0' },
  lines: [
    {
      text: '한글',
      segments: [{ t: '한글' }],
      romaji: 'hangeul',
      edited: false,
    },
  ],
};

const canonicalIdentity = {
  documentId: 'lyr_document',
  normalizerProfileId: 'lyrics-source-v2',
  sourceFingerprint: 'a'.repeat(64),
  lines: [
    { lineId: 'line_1', text: '歌う声' },
    { lineId: 'line_2', text: 'です' },
  ],
};

describe('readingSidecarPath', () => {
  it('rejects filenames with path separators or an unsupported extension', () => {
    expect(readingSidecarPath(trackDir, '../evil.lrc')).toBeNull();
    expect(readingSidecarPath(trackDir, 'a/b.lrc')).toBeNull();
    expect(readingSidecarPath(trackDir, 'notes.txt')).toBeNull();
  });

  it('uses the full source filename, not its stem, so extensions never collide', () => {
    const lrcPath = readingSidecarPath(trackDir, 'manual.lrc');
    const vttPath = readingSidecarPath(trackDir, 'manual.vtt');
    expect(path.basename(lrcPath)).toBe('manual.lrc.json');
    expect(path.basename(vttPath)).toBe('manual.vtt.json');
    expect(lrcPath).not.toBe(vttPath);
  });
});

describe('getTrackReading', () => {
  it('returns null when no sidecar exists yet', () => {
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();
  });

  it('returns null for an invalid source filename', () => {
    expect(getTrackReading(trackDir, 'a/b.lrc')).toBeNull();
  });

  it('returns null for a corrupt sidecar file', () => {
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(sidecarPath, '{not json');
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();
  });

  it('returns null when the stored version or sourceFilename does not match', () => {
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({ version: 999, sourceFilename: 'ja.vtt', lines: [] }),
    );
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();

    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        version: 2,
        sourceFilename: 'ja.vtt',
        lines: [{ lineId: 'line_1', text: '歌う声' }],
      }),
    );
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();

    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({ version: 1, sourceFilename: 'other.vtt', lines: [] }),
    );
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();
  });
});

describe('saveTrackReading / getTrackReading round trip', () => {
  it('writes a versioned sidecar readable back with the same lines', () => {
    const saved = saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);

    expect(saved.version).toBe(1);
    expect(saved.sourceFilename).toBe('ja.vtt');
    expect(saved.script).toBe('ja');
    expect(saved.analyzer).toEqual({ id: 'fake-ja', version: '0' });
    expect(typeof saved.generatedAt).toBe('string');
    expect(saved.lines).toEqual(sampleDoc.lines);

    const reloaded = getTrackReading(trackDir, 'ja.vtt');
    expect(reloaded).toEqual(saved);
  });

  it('overwrites a previous doc for the same source wholesale', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);
    const next = { ...sampleDoc, lines: [sampleDoc.lines[0]] };
    saveTrackReading(trackDir, 'ja.vtt', 'ja', next);

    expect(getTrackReading(trackDir, 'ja.vtt').lines).toHaveLength(1);
  });

  it('writes current stable document, normalizer, and line identity when canonical identity is supplied', () => {
    const saved = saveTrackReading(
      trackDir,
      'ja.vtt',
      'ja',
      sampleDoc,
      canonicalIdentity,
    );

    expect(saved).toMatchObject({
      version: 3,
      documentId: 'lyr_document',
      normalizerProfileId: 'lyrics-source-v2',
      sourceFingerprint: 'a'.repeat(64),
    });
    expect(saved.lines.map((line) => line.lineId)).toEqual([
      'line_1',
      'line_2',
    ]);
    expect(getTrackReading(trackDir, 'ja.vtt')).toEqual(saved);
  });

  it('atomically migrates a text-compatible v2 identity and preserves manual readings', () => {
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        version: 2,
        sourceFilename: 'ja.vtt',
        script: 'ja',
        generatedAt: '2026-08-23T00:00:00.000Z',
        analyzer: sampleDoc.analyzer,
        documentId: 'lyr_old_profile',
        sourceFingerprint: 'a'.repeat(64),
        lines: sampleDoc.lines.map((line, index) => ({
          ...line,
          lineId: `old_line_${index + 1}`,
          edited: index === 0,
        })),
      }),
    );

    const migrated = loadTrackReadingForIdentity(
      trackDir,
      'ja.vtt',
      canonicalIdentity,
    );

    expect(migrated).toMatchObject({
      version: 3,
      documentId: 'lyr_document',
      normalizerProfileId: 'lyrics-source-v2',
      sourceFingerprint: 'a'.repeat(64),
      generatedAt: '2026-08-23T00:00:00.000Z',
      lines: [
        expect.objectContaining({
          lineId: 'line_1',
          text: '歌う声',
          romaji: 'utau koe',
          edited: true,
        }),
        expect.objectContaining({ lineId: 'line_2', text: 'です' }),
      ],
    });
    expect(typeof migrated.identityMigratedAt).toBe('string');
    expect(getTrackReading(trackDir, 'ja.vtt')).toEqual(migrated);
  });

  it('repairs analyzer-only whitespace while loading an identity-matched sidecar', () => {
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        version: 3,
        sourceFilename: 'ja.vtt',
        script: 'ja',
        documentId: canonicalIdentity.documentId,
        normalizerProfileId: canonicalIdentity.normalizerProfileId,
        sourceFingerprint: canonicalIdentity.sourceFingerprint,
        lines: [
          {
            lineId: 'line_1',
            text: '歌う声',
            segments: [
              { t: '歌', r: 'うた' },
              { t: 'う' },
              { t: ' ' },
              { t: '声', r: 'こえ' },
            ],
          },
          {
            lineId: 'line_2',
            text: 'です',
            segments: [{ t: 'です' }],
          },
        ],
      }),
    );

    const loaded = loadTrackReadingForIdentity(
      trackDir,
      'ja.vtt',
      canonicalIdentity,
    );

    expect(loaded.lines[0].segments).toEqual([
      { t: '歌', r: 'うた' },
      { t: 'う' },
      { t: '声', r: 'こえ' },
    ]);
    expect(loaded.lines[0].segments.map((segment) => segment.t).join('')).toBe(
      '歌う声',
    );
    expect(getTrackReading(trackDir, 'ja.vtt')).toEqual(loaded);
  });

  it('drops a synthetic gap without removing the source-authored gap later in the line', () => {
    const identity = {
      ...canonicalIdentity,
      lines: [{ lineId: 'line_1', text: '閻魔さま 調子はどう' }],
    };
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        version: 3,
        sourceFilename: 'ja.vtt',
        script: 'ja',
        documentId: identity.documentId,
        normalizerProfileId: identity.normalizerProfileId,
        sourceFingerprint: identity.sourceFingerprint,
        lines: [
          {
            lineId: 'line_1',
            text: '閻魔さま 調子はどう',
            segments: [
              { t: '閻' },
              { t: ' ' },
              { t: '魔', r: 'ま' },
              { t: 'さま' },
              { t: ' ' },
              { t: '調子', r: 'ちょうし' },
              { t: 'は' },
              { t: 'どう' },
            ],
          },
        ],
      }),
    );

    const loaded = loadTrackReadingForIdentity(trackDir, 'ja.vtt', identity);

    expect(loaded.lines[0].segments).toEqual([
      { t: '閻' },
      { t: '魔', r: 'ま' },
      { t: 'さま' },
      { t: ' ' },
      { t: '調子', r: 'ちょうし' },
      { t: 'は' },
      { t: 'どう' },
    ]);
    expect(loaded.lines[0].segments.map((segment) => segment.t).join('')).toBe(
      identity.lines[0].text,
    );
  });

  it('returns null instead of re-keying a reading whose line text is stale', () => {
    const sidecarPath = readingSidecarPath(trackDir, 'ja.vtt');
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        version: 2,
        sourceFilename: 'ja.vtt',
        script: 'ja',
        documentId: 'lyr_old_profile',
        sourceFingerprint: 'a'.repeat(64),
        lines: [
          { lineId: 'old_line_1', text: '歌詞已改變', romaji: 'stale' },
          { lineId: 'old_line_2', text: 'です', romaji: 'desu' },
        ],
      }),
    );

    expect(
      loadTrackReadingForIdentity(trackDir, 'ja.vtt', canonicalIdentity),
    ).toBeNull();
    expect(getTrackReading(trackDir, 'ja.vtt').version).toBe(2);
  });

  it('returns null for an invalid source filename or a malformed doc', () => {
    expect(saveTrackReading(trackDir, 'a/b.lrc', 'ja', sampleDoc)).toBeNull();
    expect(saveTrackReading(trackDir, 'ja.vtt', 'ja', {})).toBeNull();
    expect(saveTrackReading(trackDir, 'ja.vtt', 'ja', null)).toBeNull();
    expect(
      saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc, {
        ...canonicalIdentity,
        lines: [{ lineId: 'wrong', text: 'different' }],
      }),
    ).toBeNull();
  });
});

describe('deleteTrackReading', () => {
  it('removes an existing sidecar and returns true', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);
    expect(deleteTrackReading(trackDir, 'ja.vtt')).toBe(true);
    expect(getTrackReading(trackDir, 'ja.vtt')).toBeNull();
  });

  it('returns false when there is nothing to delete', () => {
    expect(deleteTrackReading(trackDir, 'ja.vtt')).toBe(false);
  });
});

describe('setReadingLine', () => {
  it('returns null when no doc exists yet for this source', () => {
    expect(setReadingLine(trackDir, 'ja.vtt', 0, 'うた')).toBeNull();
  });

  it('returns null for an out-of-range line index', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);
    expect(setReadingLine(trackDir, 'ja.vtt', 5, 'うた')).toBeNull();
  });

  it('re-derives segments from the supplied whole-line kana and marks the line edited', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);

    // Correction: 声's original reading was こえ (see sampleDoc above);
    // the full line reading here supplies ごえ (voiced) instead.
    const updated = setReadingLine(trackDir, 'ja.vtt', 0, 'うたうごえ');

    expect(updated.lines[0]).toEqual({
      text: '歌う声',
      segments: [{ t: '歌', r: 'うた' }, { t: 'う' }, { t: '声', r: 'ごえ' }],
      romaji: 'utau koe',
      edited: true,
    });
    // The other line is untouched.
    expect(updated.lines[1]).toEqual(sampleDoc.lines[1]);
    expect(getTrackReading(trackDir, 'ja.vtt')).toEqual(updated);
  });

  it('upgrades a legacy v1 document on explicit stable-id editing', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);

    const updated = setReadingLine(
      trackDir,
      'ja.vtt',
      {
        ...canonicalIdentity,
        targetLineId: 'line_2',
      },
      'デス',
    );

    expect(updated.version).toBe(3);
    expect(updated.documentId).toBe('lyr_document');
    expect(updated.normalizerProfileId).toBe('lyrics-source-v2');
    expect(updated.lines.map((line) => line.lineId)).toEqual([
      'line_1',
      'line_2',
    ]);
    expect(updated.lines[1]).toMatchObject({ lineId: 'line_2', edited: true });
  });

  it('falls back to one atomic segment when the supplied kana does not align', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);

    const updated = setReadingLine(trackDir, 'ja.vtt', 0, 'そら');

    expect(updated.lines[0].segments).toEqual([{ t: '歌う声', r: 'そら' }]);
    expect(updated.lines[0].edited).toBe(true);
  });

  it('clears segments to plain text when given an empty reading', () => {
    saveTrackReading(trackDir, 'ja.vtt', 'ja', sampleDoc);

    const updated = setReadingLine(trackDir, 'ja.vtt', 0, '');

    expect(updated.lines[0].segments).toEqual([{ t: '歌う声' }]);
    expect(updated.lines[0].edited).toBe(true);
  });

  describe('non-Japanese scripts (Stage 5c: Korean)', () => {
    it('treats the supplied value as the final romaji directly, no re-alignment', () => {
      saveTrackReading(trackDir, 'ko.vtt', 'ko', sampleKoreanDoc);

      const updated = setReadingLine(trackDir, 'ko.vtt', 0, 'han-geul');

      expect(updated.lines[0]).toEqual({
        text: '한글',
        // Always the single plain segment buildRomanizationDoc produces —
        // Korean never has a kana-to-ruby step to redo.
        segments: [{ t: '한글' }],
        romaji: 'han-geul',
        edited: true,
      });
    });

    it('ignores kanaToRomaji for a non-ja doc even if supplied', () => {
      saveTrackReading(trackDir, 'ko.vtt', 'ko', sampleKoreanDoc);

      const updated = setReadingLine(trackDir, 'ko.vtt', 0, 'hangeul', {
        kanaToRomaji: () => 'should-not-be-called',
      });

      expect(updated.lines[0].romaji).toBe('hangeul');
    });
  });
});

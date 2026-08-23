import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LYRICSFILE_LIMITS, parseLyricsfile } from './lyricsfile.js';

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

function fixture(name) {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8');
}

describe('parseLyricsfile', () => {
  it('normalizes a complete 1.0 word-synced document without inventing times', () => {
    expect(parseLyricsfile(fixture('valid-word.lyricsfile.yaml'))).toEqual({
      status: 'ok',
      version: '1.0',
      document: {
        metadata: {
          title: 'Small Hours',
          artist: 'Example Artist',
          album: 'Night Window',
          durationMs: 180000,
          offsetMs: null,
          language: 'en',
          instrumental: false,
        },
        plain: 'Stay until the morning\n',
        lines: [
          {
            text: 'Stay until the morning',
            startMs: 4200,
            endMs: 6800,
            words: [
              { text: 'Stay ', startMs: 4200, endMs: 4800 },
              { text: 'until ', startMs: 4800, endMs: 5400 },
              { text: 'the ', startMs: 5400, endMs: 5750 },
              { text: 'morning', startMs: 5750, endMs: 6800 },
            ],
          },
        ],
      },
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      warnings: [],
    });
  });

  it('preserves missing line and word ends as null', () => {
    const result = parseLyricsfile(`version: '1.0'
metadata: { title: Song, artist: Artist }
lines:
  - text: Hello
    start_ms: 1000
    words:
      - { text: Hello, start_ms: 1000 }
`);

    expect(result.status).toBe('ok');
    expect(result.document.lines[0]).toMatchObject({
      endMs: null,
      words: [{ text: 'Hello', startMs: 1000, endMs: null }],
    });
  });

  it.each([
    ['duplicate-key.lyricsfile.yaml', 'duplicate-key'],
    ['alias.lyricsfile.yaml', 'alias-not-allowed'],
    ['custom-tag.lyricsfile.yaml', 'tag-not-allowed'],
    ['multi-document.lyricsfile.yaml', 'multiple-documents'],
  ])('rejects hostile YAML fixture %s structurally', (name, issue) => {
    expect(parseLyricsfile(fixture(name))).toEqual({
      status: 'error',
      reason: 'structural-error',
      issues: [issue],
    });
  });

  it('rejects oversized input before parsing', () => {
    expect(parseLyricsfile('x'.repeat(101), { maxBytes: 100 })).toEqual({
      status: 'error',
      reason: 'structural-error',
      issues: ['document-too-large'],
    });
  });

  it('rejects excessive nesting and node counts with stable structural codes', () => {
    const nestedMapping = Array.from(
      { length: 12 },
      (_, index) => `${'  '.repeat(index + 1)}child:`,
    ).join('\n');
    const deeplyNested = `version: '1.0'\nmetadata:\n  title: Song\n  artist: Artist\nextra:\n${nestedMapping}\n${'  '.repeat(13)}value: end\n`;
    expect(parseLyricsfile(deeplyNested, { maxDepth: 8 })).toMatchObject({
      status: 'error',
      reason: 'structural-error',
      issues: ['nesting-too-deep'],
    });

    expect(
      parseLyricsfile(fixture('valid-word.lyricsfile.yaml'), { maxNodes: 5 }),
    ).toEqual({
      status: 'error',
      reason: 'structural-error',
      issues: ['too-many-nodes'],
    });
  });

  it('preserves but never interprets an unknown version', () => {
    expect(parseLyricsfile(fixture('unknown-version.lyricsfile.yaml'))).toEqual(
      {
        status: 'unsupported',
        reason: 'unknown-version',
        version: '2.0',
      },
    );
  });

  it.each([
    ['invalid-timestamp.lyricsfile.yaml', 'line-end-before-start'],
    ['text-mismatch.lyricsfile.yaml', 'word-text-mismatch'],
  ])('separates semantic failure in %s from YAML structure', (name, issue) => {
    expect(parseLyricsfile(fixture(name))).toEqual({
      status: 'error',
      reason: 'semantic-error',
      issues: [issue],
    });
  });

  it('preserves allowed overlaps and offset while denying direct T2 import', () => {
    const result = parseLyricsfile(fixture('overlap.lyricsfile.yaml'));

    expect(result).toMatchObject({
      status: 'ok',
      capability: { level: 'T2', partial: false },
      compatibility: { t0: false, t1: true, t2: false },
      warnings: ['offset-present', 'overlapping-lines', 'overlapping-words'],
    });
    expect(result.document.metadata.offsetMs).toBe(120);
  });

  it('distinguishes line sync, partial word sync, and plain-only capability', () => {
    const lineOnly = parseLyricsfile(`version: '1.0'
metadata: { title: Song, artist: Artist }
lines: [{ text: Hello, start_ms: 1000 }]
`);
    const partial = parseLyricsfile(`version: '1.0'
metadata: { title: Song, artist: Artist }
lines:
  - text: Hello
    start_ms: 1000
    words: [{ text: Hello, start_ms: 1000 }]
  - { text: Again, start_ms: 2000 }
`);
    const plain = parseLyricsfile(`version: '1.0'
metadata: { title: Song, artist: Artist }
plain: Hello
`);

    expect(lineOnly).toMatchObject({
      capability: { level: 'T1', partial: false },
      compatibility: { t0: false, t1: true, t2: false },
    });
    expect(partial).toMatchObject({
      capability: { level: 'T2', partial: true },
      compatibility: { t0: false, t1: true, t2: false },
      warnings: ['partial-word-timing'],
    });
    expect(plain).toMatchObject({
      capability: { level: 'T0', partial: false },
      compatibility: { t0: true, t1: false, t2: false },
    });
  });

  it('enforces bounded line and word counts', () => {
    const lines = Array.from(
      { length: 3 },
      (_, index) => `  - { text: Line ${index}, start_ms: ${index * 1000} }`,
    ).join('\n');
    expect(
      parseLyricsfile(
        `version: '1.0'\nmetadata: { title: Song, artist: Artist }\nlines:\n${lines}\n`,
        { maxLines: 2 },
      ),
    ).toMatchObject({
      status: 'error',
      reason: 'structural-error',
      issues: ['too-many-lines'],
    });

    expect(LYRICSFILE_LIMITS.maxWordsTotal).toBeGreaterThan(0);
  });
});

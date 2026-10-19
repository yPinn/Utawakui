import { describe, expect, it } from 'vitest';
import {
  buildAcousticChunks,
  validateAcousticEstimate,
} from './lyricsAcousticEstimate.mjs';

function document() {
  return {
    schemaVersion: 1,
    estimateId: 'estimate-1',
    documentId: 'document-1',
    source: {
      filename: 'main.lrc',
      sha256: 'a'.repeat(64),
      normalizerProfileId: 'lyrics-source-v2',
      timingSha256: null,
      intervalsSha256: 'b'.repeat(64),
      offsetUsedMs: 0,
    },
    audio: {
      sha256: 'c'.repeat(64),
      role: 'mix',
      decodeProfileId: 'source-v1',
    },
    method: {
      kind: 'fixture',
      id: 'synthetic-v1',
      version: '1',
      modelManifestSha256: null,
      environmentLockSha256: null,
      decoderVersion: 'fixture-v1',
      g2pVersion: 'none-v1',
      chunkerVersion: 'fixture-v1',
      nodeVersion: '24.0.0',
      icuVersion: '77.0',
    },
    lines: [
      {
        lineId: 'line-1',
        text: '你 好👩‍🎤！',
        startMs: 1000,
        endMs: 4000,
        status: 'ready',
        reason: null,
        chunks: [
          { chunkId: 'chunk-1', from: 0, to: 2, startMs: 1000 },
          { chunkId: 'chunk-2', from: 2, to: 9, startMs: 2700 },
        ],
      },
    ],
  };
}

describe('independent acoustic estimate validation', () => {
  it('preserves lossless original ranges and never adds sung ends', () => {
    const input = document();
    const result = validateAcousticEstimate(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(
      result.lines[0].chunks
        .map((c) => result.lines[0].text.slice(c.from, c.to))
        .join(''),
    ).toBe(input.lines[0].text);
    expect(result.lines[0].chunks.every((c) => !('endMs' in c))).toBe(true);
  });

  it.each([
    [
      'schema',
      (d) => {
        d.schemaVersion = 2;
      },
    ],
    [
      'path',
      (d) => {
        d.source.filename = '../main.lrc';
      },
    ],
    [
      'hash',
      (d) => {
        d.audio.sha256 = 'invalid';
      },
    ],
    [
      'offset',
      (d) => {
        d.source.offsetUsedMs = 3600001;
      },
    ],
    [
      'private extra field',
      (d) => {
        d.audio.path = 'private';
      },
    ],
    [
      'unknown method',
      (d) => {
        d.method.kind = 'automatic';
      },
    ],
    [
      'text size',
      (d) => {
        d.lines[0].text = '字'.repeat(2001);
      },
    ],
    [
      'line limit',
      (d) => {
        d.lines = Array(5001).fill(d.lines[0]);
      },
    ],
    [
      'chunk limit',
      (d) => {
        d.lines[0].chunks = Array(1001).fill(d.lines[0].chunks[0]);
      },
    ],
    [
      'nonfinite',
      (d) => {
        d.lines[0].chunks[1].startMs = Infinity;
      },
    ],
    [
      'fractional',
      (d) => {
        d.lines[0].chunks[1].startMs = 2700.5;
      },
    ],
    [
      'nonmonotonic',
      (d) => {
        d.lines[0].chunks[1].startMs = 999;
      },
    ],
    [
      'equal starts',
      (d) => {
        d.lines[0].chunks[1].startMs = 1000;
      },
    ],
    [
      'outside',
      (d) => {
        d.lines[0].chunks[1].startMs = 4001;
      },
    ],
    [
      'lost text',
      (d) => {
        d.lines[0].chunks[1].to = 8;
      },
    ],
    [
      'overlap',
      (d) => {
        d.lines[0].chunks[1].from = 1;
      },
    ],
    [
      'grapheme split',
      (d) => {
        d.lines[0].chunks[0].to = 5;
        d.lines[0].chunks[1].from = 5;
      },
    ],
    [
      'false end',
      (d) => {
        d.lines[0].chunks[0].endMs = 2000;
      },
    ],
    [
      'repeated identity',
      (d) => {
        d.lines.push(structuredClone(d.lines[0]));
      },
    ],
    [
      'unresolved ready interval',
      (d) => {
        d.lines[0].endMs = null;
      },
    ],
  ])('rejects %s', (_, change) => {
    const input = document();
    change(input);
    expect(() => validateAcousticEstimate(input)).toThrow();
  });

  it('allows explicit unsupported lines without fabricating time', () => {
    const input = document();
    Object.assign(input.lines[0], {
      status: 'unsupported',
      reason: 'unresolved-interval',
      startMs: null,
      endMs: null,
      chunks: [],
    });
    expect(validateAcousticEstimate(input).lines[0].chunks).toEqual([]);
  });

  it('keeps same-text occurrences separate', () => {
    const input = document();
    const second = structuredClone(input.lines[0]);
    second.lineId = 'line-2';
    second.startMs += 4000;
    second.endMs += 4000;
    second.chunks.forEach((c, i) => {
      c.chunkId = `repeat-${i}`;
      c.startMs += 4000;
    });
    input.lines.push(second);
    expect(validateAcousticEstimate(input).lines[1].chunks[0].startMs).toBe(
      5000,
    );
  });

  it('merges missing cuts without altering script or inventing an internal start', () => {
    expect(
      buildAcousticChunks(
        'カナ 中文！',
        [0, 2, 3, 6],
        new Map([[3, 2200]]),
        1000,
        4000,
        'line',
      ),
    ).toEqual([
      { chunkId: 'line-c-0', from: 0, to: 3, startMs: 1000 },
      { chunkId: 'line-c-3', from: 3, to: 6, startMs: 2200 },
    ]);
    expect(
      buildAcousticChunks(
        '你 好',
        [0, 1, 3],
        new Map([[1, 900]]),
        1000,
        4000,
        'line',
      ),
    ).toBeNull();
  });

  it('never accepts unsafe range boundaries from a chunk producer', () => {
    expect(() =>
      buildAcousticChunks(
        '👩‍🎤你',
        [0, 2, 6],
        new Map([[2, 2000]]),
        1000,
        4000,
        'line',
      ),
    ).toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  LYRICS_TEXT_VARIANTS,
  projectLyricsTextVariant,
} from './lyricsTextVariant.js';

function document(lines, overrides = {}) {
  return {
    schemaVersion: 1,
    documentId: 'lyrics-source-1',
    normalizerProfileId: 'lyrics-source-v2',
    source: { filename: 'main.lrc', sha256: null },
    granularity: 'T1',
    lines,
    ...overrides,
  };
}

describe('projectLyricsTextVariant', () => {
  it('defaults every Chinese source to Taiwan Traditional without mutating canonical text', () => {
    const canonical = document([
      {
        lineId: 'line-1',
        text: '我喜欢你的头发和声音',
        startMs: 1000,
        endMs: 3000,
      },
    ]);

    const projected = projectLyricsTextVariant(canonical);

    expect(projected).not.toBe(canonical);
    expect(projected.documentId).not.toBe(canonical.documentId);
    expect(projected.lines).toEqual([
      {
        lineId: 'line-1',
        text: '我喜歡你的頭髮和聲音',
        startMs: 1000,
        endMs: 3000,
      },
    ]);
    expect(canonical.lines[0].text).toBe('我喜欢你的头发和声音');
  });

  it('returns the canonical document for Original display', () => {
    const canonical = document([
      { lineId: 'line-1', text: '简体歌词', startMs: null, endMs: null },
    ]);

    expect(
      projectLyricsTextVariant(canonical, {
        variant: LYRICS_TEXT_VARIANTS.ORIGINAL,
      }),
    ).toBe(canonical);
  });

  it.each([
    ['Japanese', '君の声が聞こえる'],
    ['Korean', '너의 목소리가 들려'],
    ['Latin', 'I can hear your voice'],
  ])('does not convert %s lyrics', (_label, text) => {
    const canonical = document([
      { lineId: 'line-1', text, startMs: null, endMs: null },
    ]);

    expect(projectLyricsTextVariant(canonical)).toBe(canonical);
  });

  it('uses whole-line context while preserving T2 segment identities and timing', () => {
    const canonical = document(
      [
        {
          lineId: 'line-1',
          text: '头发',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 'segment-1',
              text: '头',
              startMs: 1000,
              endMs: 1500,
            },
            {
              segmentId: 'segment-2',
              text: '发',
              startMs: 1500,
              endMs: 2000,
            },
          ],
        },
      ],
      { granularity: 'T2' },
    );

    const projected = projectLyricsTextVariant(canonical);

    expect(projected.lines[0]).toEqual({
      lineId: 'line-1',
      text: '頭髮',
      startMs: 1000,
      endMs: 2000,
      segments: [
        {
          segmentId: 'segment-1',
          text: '頭',
          startMs: 1000,
          endMs: 1500,
        },
        {
          segmentId: 'segment-2',
          text: '髮',
          startMs: 1500,
          endMs: 2000,
        },
      ],
    });
  });

  it('keeps T2 line and segment text internally consistent if conversion changes length', () => {
    const canonical = document(
      [
        {
          lineId: 'line-1',
          text: '网络',
          startMs: 0,
          endMs: 1000,
          segments: [
            { segmentId: 'segment-1', text: '网', startMs: 0, endMs: 500 },
            {
              segmentId: 'segment-2',
              text: '络',
              startMs: 500,
              endMs: 1000,
            },
          ],
        },
      ],
      { granularity: 'T2' },
    );
    const convert = vi.fn((value) => {
      if (value === '网络') return '網際網路';
      return value === '网' ? '網' : value === '络' ? '絡' : value;
    });

    const projected = projectLyricsTextVariant(canonical, { convert });

    expect(projected.lines[0].text).toBe('網絡');
    expect(projected.lines[0].segments.map((segment) => segment.text)).toEqual([
      '網',
      '絡',
    ]);
    expect(convert).toHaveBeenCalledWith('网络');
  });
});

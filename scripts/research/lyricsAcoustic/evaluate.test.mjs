import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { outerVtt, summarize, scoreCase } = require('./evaluate.cjs');
const { providerReferenceRows, researchSource } = require('./evaluate.cjs');
const { scoreResults } = require('./evaluate.cjs');
describe('fixed-denominator research evaluation', () => {
  it('scopes reused external line ids to their own song', () => {
    const items = ['a', 'b'].map((id) => ({
      id,
      language: 'zh',
      durationMs: 5000,
      lines: [{ lineId: 'line:0' }],
    }));
    const results = items.map((item) => ({
      id: item.id,
      canonical: {
        lines: [
          { lineId: 'canonical', text: '你好世界', startMs: 1000, endMs: 4000 },
        ],
      },
      estimate: {
        preview: {
          lines: [{ status: 'ready', chunks: [{ from: 2, startMs: 2700 }] }],
        },
      },
      metrics: {},
    }));
    const references = {
      a: { 'line:0': [{ from: 2, startMs: 2700 }] },
      b: { 'line:0': [{ from: 2, startMs: 2000 }] },
    };
    expect(
      scoreResults(items, results, references).map((row) => row.D.onset100),
    ).toEqual([1, 0]);
  });
  it('keeps provider references available when external line ids are supplied', () => {
    const item = {
      language: 'zh',
      durationMs: 5000,
      lines: [{ lineId: 'external' }],
    };
    const line = {
      lineId: 'canonical',
      text: '你好世界',
      startMs: 1000,
      endMs: 4000,
      segments: [
        { text: '你好', startMs: 1000 },
        { text: '世界', startMs: 2700 },
      ],
    };
    const refs = providerReferenceRows(item, { lines: [line] });
    const canonical = { lines: [{ ...line, segments: undefined }] };
    const estimate = {
      preview: {
        lines: [
          {
            chunks: [
              { from: 0, startMs: 1000 },
              { from: 2, startMs: 2700 },
            ],
          },
        ],
      },
    };
    expect(scoreCase(item, canonical, estimate, refs).D).toMatchObject({
      requested: 1,
      scorable: 1,
      onset100: 1,
    });
  });
  it('preserves identical repeated cues through the actual source normalizer', async () => {
    const server = await require('vite').createServer({
      configFile: false,
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
    });
    try {
      const { normalizeLyricsDocument } = await server.ssrLoadModule(
        '/src/utils/lyricsDocument.js',
      );
      const text = outerVtt([
        { startMs: 1000, endMs: 2000, text: '你好世界' },
        { startMs: 3000, endMs: 4000, text: '你好世界' },
      ]);
      const doc = normalizeLyricsDocument({
        text,
        source: researchSource('main.vtt'),
      });
      expect(doc.lines.map((line) => line.startMs)).toEqual([1000, 3000]);
      expect(new Set(doc.lines.map((line) => line.lineId)).size).toBe(2);
    } finally {
      await server.close();
    }
  });
  it('serializes integer coarse T1 without any fine reference', () => {
    expect(outerVtt([{ startMs: 1000, endMs: 2345, text: '你好' }])).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.345\n你好\n',
    );
    expect(() =>
      outerVtt([{ startMs: 1.2, endMs: 2345, text: '你好' }]),
    ).toThrow();
  });
  it('uses the actual product baseline and keeps failed output in the denominator', () => {
    const canonical = {
      lines: [{ lineId: 'l', text: '你好世界', startMs: 1000, endMs: 4000 }],
    };
    const item = { language: 'zh', lines: [{ lineId: 'l' }], durationMs: 5000 };
    const result = scoreCase(
      item,
      canonical,
      { preview: { lines: [{ chunks: [] }] } },
      { l: [{ from: 2, startMs: 2700 }] },
    );
    expect(result.A).toMatchObject({
      requested: 1,
      scorable: 1,
      measured: 1,
      medianMs: 200,
    });
    expect(result.D).toMatchObject({
      requested: 1,
      scorable: 1,
      measured: 0,
      coverage: 0,
      onset100: 0,
    });
    expect(summarize([])).toMatchObject({
      requested: 0,
      onset100: null,
      medianMs: null,
    });
  });
});

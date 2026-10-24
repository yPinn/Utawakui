import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeLyricsDocument } from '../../utils/lyricsDocument.js';
import { useLyricsSourcePresentation } from './useLyricsSourcePresentation.js';

let scope;
afterEach(() => scope?.stop());
const source = (filename, extra = {}) => ({
  filename,
  kind: 'manual',
  offsetMs: 0,
  ...extra,
});
const result = (item, text) => ({
  text,
  source: item,
  timing: { sourceFingerprint: 'a'.repeat(64) },
});
function estimateFor(input, offsetMs = 0) {
  const document = normalizeLyricsDocument({
    ...input,
    sourceFingerprint: input.timing.sourceFingerprint,
    timing: input.timing,
  });
  return {
    status: 'ready',
    preview: {
      documentId: document.documentId,
      sourceFilename: document.source.filename,
      sourceFingerprint: document.source.sha256,
      normalizerProfileId: document.normalizerProfileId,
      offsetUsedMs: offsetMs,
      lines: document.lines.map((line, index) => ({
        lineId: line.lineId,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        status: line.endMs === null ? 'unsupported' : 'ready',
        reason: line.endMs === null ? 'unresolved-interval' : null,
        chunks:
          line.endMs === null
            ? []
            : [
                {
                  chunkId: `chunk-${index}-a`,
                  from: 0,
                  to: 2,
                  startMs: line.startMs,
                },
                {
                  chunkId: `chunk-${index}-b`,
                  from: 2,
                  to: line.text.length,
                  startMs: line.startMs + 500,
                },
              ],
      })),
    },
  };
}
function setup(items, bridge, overrides = {}) {
  const trackId = shallowRef('track');
  const sources = shallowRef(items);
  const selectedFilename = shallowRef(items[0]?.filename);
  scope = effectScope();
  const owner = scope.run(() =>
    useLyricsSourcePresentation({
      trackId,
      sources,
      selectedFilename,
      document: shallowRef(null),
      getBridge: () => bridge,
      ...overrides,
    }),
  );
  return { owner, trackId, sources, selectedFilename };
}

describe('read-only lyrics source presentation', () => {
  it('ranks every source using validated per-source analysis and preserves the selected source', async () => {
    const items = [
      'plain.lrc',
      'line.lrc',
      'estimate.lrc',
      'stale.lrc',
      'native.lrc',
      'broken.lrc',
    ].map((name) => source(name));
    const results = Object.fromEntries(
      items.map((item) => [
        item.filename,
        result(
          item,
          item.filename === 'plain.lrc'
            ? '今天唱歌'
            : item.filename === 'native.lrc'
              ? '[00:01.00]<00:01.00>今天<00:02.00>唱歌\n[00:04.00]再見'
              : '[00:01.00]今天唱歌\n[00:04.00]再見',
        ),
      ]),
    );
    const bridge = {
      getTrackLyrics: vi.fn(async (_id, name) => {
        if (name === 'broken.lrc') throw new Error('unreadable');
        return results[name];
      }),
      getExperimentalLyricsEstimate: vi.fn(async (_id, name) =>
        name === 'estimate.lrc'
          ? estimateFor(results[name])
          : name === 'stale.lrc'
            ? estimateFor(results[name], 100)
            : { status: 'missing' },
      ),
    };
    const { owner, selectedFilename } = setup(items, bridge);
    await owner.refresh();
    expect(owner.availableSources.value.map((s) => s.filename)).toEqual([
      'native.lrc',
      'estimate.lrc',
      'line.lrc',
      'stale.lrc',
      'plain.lrc',
      'broken.lrc',
    ]);
    expect(
      owner.availableSources.value.find((s) => s.filename === 'estimate.lrc'),
    ).toMatchObject({ timingTier: 'T1', hasEstimatedTiming: true });
    expect(
      owner.availableSources.value.find((s) => s.filename === 'broken.lrc')
        .timingTier,
    ).toBeUndefined();
    expect(selectedFilename.value).toBe('plain.lrc');
    expect(items.every((item) => !('timingTier' in item))).toBe(true);
  });

  it('rejects delayed reads after changing tracks even with the same filename', async () => {
    let release;
    const item = source('same.lrc');
    const bridge = {
      getTrackLyrics: vi.fn((id) =>
        id === 'track'
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(result(item, 'plain')),
      ),
    };
    const { owner, trackId } = setup([item], bridge);
    void owner.refresh();
    trackId.value = 'next';
    await owner.refresh();
    release(result(item, '[00:01.00]<00:01.00>old'));
    await nextTick();
    expect(owner.availableSources.value[0].timingTier).toBe('T0');
  });

  it('drops selected-source estimate status immediately when the current preparation becomes stale', async () => {
    const item = source('line.lrc');
    const input = result(item, '[00:01.00]今天唱歌\n[00:04.00]再見');
    const document = shallowRef(
      normalizeLyricsDocument({
        ...input,
        sourceFingerprint: input.timing.sourceFingerprint,
      }),
    );
    const prepared = shallowRef({
      status: 'ready',
      lines: [{ status: 'ready' }],
    });
    const { owner } = setup(
      [item],
      {
        getTrackLyrics: async () => input,
        getExperimentalLyricsEstimate: async () => estimateFor(input),
      },
      { document, experiment: { prepared } },
    );
    await owner.refresh();
    expect(owner.availableSources.value[0].hasEstimatedTiming).toBe(true);
    prepared.value = { status: 'stale' };
    expect(owner.availableSources.value[0]).toMatchObject({
      timingTier: 'T1',
      hasEstimatedTiming: false,
    });
    expect(document.value.granularity).toBe('T1');
  });

  it('discards a pending read when its owning scope stops', async () => {
    let release;
    const item = source('line.lrc');
    const { owner } = setup([item], {
      getTrackLyrics: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = owner.refresh();
    scope.stop();
    release(result(item, '[00:01.00]今天唱歌'));
    await pending;
    expect(owner.availableSources.value[0].timingTier).toBeUndefined();
  });
});

import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useExperimentalLyrics } from './useExperimentalLyrics.js';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
function setup(bridge) {
  const document = shallowRef({
    documentId: 'doc',
    normalizerProfileId: 'v1',
    source: { filename: 'zh.vtt', sha256: 'a'.repeat(64) },
    granularity: 'T1',
    lines: [
      { lineId: 'one', text: '今天唱歌', startMs: 1000, endMs: 5000 },
      {
        lineId: 'two',
        text: '原生歌詞',
        startMs: 5000,
        endMs: 8000,
        segments: [
          { segmentId: 'native', text: '原生歌詞', startMs: 5000, endMs: 8000 },
        ],
      },
      { lineId: 'three', text: '內容矛盾', startMs: 8000, endMs: 10000 },
    ],
  });
  const estimate = {
    status: 'ready',
    preview: {
      estimateId: 'est',
      documentId: 'doc',
      sourceFilename: 'zh.vtt',
      sourceFingerprint: 'a'.repeat(64),
      normalizerProfileId: 'v1',
      offsetUsedMs: 0,
      lines: document.value.lines.map((line, i) => ({
        lineId: line.lineId,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        status: i === 0 ? 'ready' : 'unsupported',
        reason: i === 0 ? null : 'no-evidence',
        chunks:
          i === 0
            ? [
                { chunkId: 'a', from: 0, to: 2, startMs: 1000 },
                { chunkId: 'b', from: 2, to: 4, startMs: 3000 },
              ]
            : [],
      })),
    },
  };
  const getBridge = () =>
    bridge ?? { getExperimentalLyricsEstimate: async () => estimate };
  const positionMs = shallowRef(3500),
    trackId = shallowRef('song'),
    offsetMs = shallowRef(0),
    filename = shallowRef('zh.vtt');
  const scope = effectScope();
  const owner = scope.run(() =>
    useExperimentalLyrics({
      document,
      trackId,
      filename,
      positionMs,
      offsetMs,
      getBridge,
    }),
  );
  return { owner, scope, document, positionMs, offsetMs, filename, trackId };
}
describe('manual experimental lyric application', () => {
  it('does not send transient track/source pairs while selection changes synchronously', async () => {
    const read = vi.fn(async () => ({ status: 'missing' }));
    const { scope, trackId, filename } = setup({
      getExperimentalLyricsEstimate: read,
    });
    await nextTick();
    read.mockClear();
    trackId.value = 'new-song';
    filename.value = 'new-source.lrc';
    await nextTick();
    await nextTick();
    expect(read.mock.calls).toEqual([['new-song', 'new-source.lrc']]);
    scope.stop();
  });
  it('explains offset invalidation immediately and clears it only for a matching new estimate', async () => {
    const { owner, scope, offsetMs, filename } = setup();
    await nextTick();
    owner.setApplied(true);
    offsetMs.value = -500;
    expect(owner.needsReanalysis.value).toBe(true);
    expect(owner.applied.value).toBe(false);
    expect(owner.outputDocument.value).toBeNull();
    await nextTick();
    expect(owner.needsReanalysis.value).toBe(true);
    filename.value = 'other.lrc';
    expect(owner.needsReanalysis.value).toBe(false);
    scope.stop();
  });
  it('never auto-applies; displays starts only after intent, preserving canonical T2 and T1 fallback', async () => {
    const { owner, scope, document, positionMs } = setup();
    await nextTick();
    const original = structuredClone(document.value);
    expect(owner.applied.value).toBe(false);
    expect(owner.frame.value).toBeNull();
    owner.setApplied(true);
    expect(owner.outputDocument.value.lines[0].estimatedStarts).toEqual({
      version: 1,
      segments: [
        { segmentId: 'model-a', text: '今天', startMs: 1000 },
        { segmentId: 'model-b', text: '唱歌', startMs: 3000 },
      ],
    });
    expect(owner.outputDocument.value.granularity).toBe('T1');
    expect(owner.outputDocument.value.lines[1].segments).toEqual(
      original.lines[1].segments,
    );
    expect(owner.outputDocument.value.lines[2]).not.toHaveProperty(
      'estimatedStarts',
    );
    expect(owner.frame.value.chunks[1]).toMatchObject({
      text: '唱歌',
      state: 'active',
    });
    expect(owner.frame.value.chunks[1]).not.toHaveProperty('progress');
    positionMs.value = 6000;
    expect(owner.frame.value).toBeNull();
    positionMs.value = 9000;
    expect(owner.frame.value).toBeNull();
    expect(document.value).toEqual(original);
    owner.setApplied(false);
    expect(owner.outputDocument.value).toBeNull();
    expect(owner.frame.value).toBeNull();
    scope.stop();
  });
  it('resets on offset and source changes and ignores delayed responses', async () => {
    const resolves = [];
    const { owner, scope, filename, offsetMs } = setup({
      getExperimentalLyricsEstimate: vi.fn(
        () => new Promise((resolve) => resolves.push(resolve)),
      ),
    });
    filename.value = 'ja.vtt';
    await nextTick();
    resolves[1]({ status: 'missing' });
    resolves[0]({ status: 'ready', preview: { documentId: 'old' } });
    await nextTick();
    expect(owner.estimate.value.status).toBe('missing');
    offsetMs.value = 100;
    expect(owner.applied.value).toBe(false);
    scope.stop();
  });
  it('fails closed when the bridge is unavailable or estimate is corrupt', async () => {
    const { owner, scope } = setup({
      getExperimentalLyricsEstimate: async () => {
        throw Error('private');
      },
    });
    await nextTick();
    owner.setApplied(true);
    expect(owner.applied.value).toBe(false);
    expect(owner.frame.value).toBeNull();
    scope.stop();
  });
  it('disabling experimental processing removes an applied estimate', async () => {
    globalThis.window = {
      Utawakui: {
        getExperimentalLyricsStatus: async () => ({ enabled: true }),
        setExperimentalLyricsEnabled: vi.fn(),
      },
    };
    const queue = useExperimentalLyricsQueue();
    await queue.refresh();
    const { owner, scope } = setup();
    await nextTick();
    owner.setApplied(true);
    expect(owner.applied.value).toBe(true);
    window.Utawakui.getExperimentalLyricsStatus = async () => ({
      enabled: false,
    });
    await queue.setEnabled(false);
    expect(owner.applied.value).toBe(false);
    expect(window.Utawakui.setExperimentalLyricsEnabled).toHaveBeenCalledWith(
      false,
    );
    scope.stop();
    delete globalThis.window;
  });
});

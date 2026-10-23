import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useExperimentalLyrics } from './useExperimentalLyrics.js';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
function setup(bridge, clockOptions = {}) {
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
    sourceRevision: 'source-v1',
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
    bridge ?? {
      getExperimentalLyricsEstimate: async () => structuredClone(estimate),
    };
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
      ...clockOptions,
    }),
  );
  return {
    owner,
    scope,
    document,
    positionMs,
    offsetMs,
    filename,
    trackId,
    estimate,
  };
}
describe('manual experimental lyric application', () => {
  it('keeps a coarse onset immediate when contradictory fine completion predates that onset', async () => {
    let release;
    const input = setup({
      getExperimentalLyricsEstimate: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const value = structuredClone(input.estimate);
    value.preview.lines[0].fineTiming = {
      version: 1,
      units: [
        { unitId: 'first', from: 0, to: 2, startMs: 1000, endMs: 1500 },
        { unitId: 'early', from: 2, to: 4, startMs: 2000, endMs: 2500 },
      ],
    };
    release(value);
    await nextTick();
    input.owner.setApplied(true);
    input.positionMs.value = 3000;
    expect(input.owner.frame.value.chunks[1].state).toBe('active');
    expect(input.owner.frame.value.fineTiming.units[1].startMs).toBe(2000);
    input.scope.stop();
  });
  it('clears offset invalidation only when a newly completed current-source result is usable', async () => {
    let response;
    const input = setup({
      getExperimentalLyricsEstimate: async () =>
        structuredClone(
          response ?? { status: 'missing', sourceRevision: 'before-offset' },
        ),
    });
    await nextTick();
    response = structuredClone(input.estimate);
    input.filename.value = 'other.lrc';
    await nextTick();
    await nextTick();
    input.filename.value = 'zh.vtt';
    await nextTick();
    await nextTick();
    input.owner.setApplied(true);
    input.offsetMs.value = 100;
    response = {
      status: 'stale',
      reason: 'offset-changed',
      sourceRevision: 'new-offset',
    };
    await nextTick();
    await nextTick();
    expect(input.owner.needsReanalysis.value).toBe(true);
    response = structuredClone(input.estimate);
    response.sourceRevision = 'new-offset';
    response.preview.offsetUsedMs = 100;
    const previousWindow = globalThis.window;
    globalThis.window = {
      Utawakui: {
        getExperimentalLyricsStatus: async () => ({
          items: [
            {
              jobId: 'new-offset-complete',
              trackId: 'song',
              sourceFilename: 'zh.vtt',
              sourceRevision: 'new-offset',
              status: 'ready',
            },
          ],
        }),
      },
    };
    try {
      await useExperimentalLyricsQueue().refresh();
      await nextTick();
      await nextTick();
      expect(input.owner.prepared.value.status).toBe('ready');
      expect(input.owner.needsReanalysis.value).toBe(false);
    } finally {
      input.scope.stop();
      globalThis.window = previousWindow;
    }
  });
  it('ignores an initial missing read arriving after the same-source completion reread', async () => {
    let finish;
    const read = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue({ status: 'missing', sourceRevision: 'new-version' });
    const previousWindow = globalThis.window;
    globalThis.window = {
      Utawakui: {
        getExperimentalLyricsStatus: async () => ({
          items: [
            {
              jobId: 'completed-before-initial-read',
              trackId: 'song',
              sourceFilename: 'zh.vtt',
              sourceRevision: 'new-version',
              status: 'ready',
            },
          ],
        }),
      },
    };
    const input = setup({ getExperimentalLyricsEstimate: read });
    try {
      await useExperimentalLyricsQueue().refresh();
      await nextTick();
      await nextTick();
      finish({ status: 'missing', sourceRevision: 'old-version' });
      await nextTick();
      expect(read).toHaveBeenCalledTimes(2);
      expect(input.owner.estimate.value.sourceRevision).toBe('new-version');
    } finally {
      input.scope.stop();
      globalThis.window = previousWindow;
    }
  });
  it('keeps current application when another source or an old version completes', async () => {
    const input = setup();
    await nextTick();
    input.owner.setApplied(true);
    let items = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      Utawakui: {
        getExperimentalLyricsStatus: async () => ({
          enabled: true,
          allowed: true,
          items,
        }),
      },
    };
    try {
      const queue = useExperimentalLyricsQueue();
      await queue.refresh();
      items = [
        {
          jobId: 'other-source',
          trackId: 'song',
          sourceFilename: 'other.lrc',
          sourceRevision: 'source-v1',
          status: 'running',
        },
      ];
      await queue.refresh();
      items = items.map((i) => ({ ...i, status: 'ready' }));
      await queue.refresh();
      await nextTick();
      expect(input.owner.applied.value).toBe(true);
      items = [
        {
          jobId: 'old-version',
          trackId: 'song',
          sourceFilename: 'zh.vtt',
          sourceRevision: 'source-old',
          status: 'ready',
        },
      ];
      await queue.refresh();
      await nextTick();
      expect(input.owner.applied.value).toBe(true);
      input.estimate.preview.estimateId = 'replacement';
      items = [
        {
          jobId: 'own-version',
          trackId: 'song',
          sourceFilename: 'zh.vtt',
          sourceRevision: 'source-v1',
          status: 'ready',
        },
      ];
      await queue.refresh();
      await nextTick();
      expect(input.owner.applied.value).toBe(false);
    } finally {
      globalThis.window = previousWindow;
      input.scope.stop();
    }
  });
  it('uses separate local paint timing and samples transport for starts-only data without publishing estimates', async () => {
    const sample = vi.fn(() => ({
      positionMs: 1500,
      sampledAt: '2026-10-22T00:00:00Z',
      rate: 2,
      phase: 'playing',
    }));
    const input = setup(undefined, { samplePlaybackClock: sample });
    await nextTick();
    input.owner.setApplied(true);
    const frame = input.owner.frame.value;
    expect(frame.paintTiming.units).toHaveLength(2);
    expect(frame.paintTiming.units[0]).toMatchObject({
      startMs: 1000,
      endMs: 3000,
      timingSource: 'display-estimate',
    });
    expect(frame.paintClock).toMatchObject({
      positionMs: 1500,
      rate: 2,
      playing: true,
    });
    expect(frame).not.toHaveProperty('fineTiming');
    const published = input.owner.outputDocument.value.lines[0];
    expect(published).not.toHaveProperty('estimatedFineTiming');
    expect(published).not.toHaveProperty('paintTiming');
    expect(published.estimatedStarts.segments[0].startMs).toBe(1000);
    input.owner.setApplied(false);
    expect(input.owner.frame.value).toBeNull();
    expect(input.owner.outputDocument.value).toBeNull();
    input.scope.stop();
  });
  it('carries independent fine ranges to both displays while keeping the coarse onset unchanged', async () => {
    const unit = { unitId: 'fine', from: 0, to: 1, startMs: 1200, endMs: 1600 };
    const input = setup();
    await nextTick();
    const estimate = JSON.parse(JSON.stringify(input.owner.estimate.value));
    estimate.preview.lines[0].fineTiming = { version: 1, units: [unit] };
    input.scope.stop();
    const { owner, scope, positionMs } = setup({
      getExperimentalLyricsEstimate: async () => estimate,
    });
    await nextTick();
    owner.setApplied(true);
    positionMs.value = 1000;
    expect(owner.frame.value.chunks[0].state).toBe('active');
    expect(owner.frame.value.fineTiming.units).toEqual([unit]);
    expect(
      owner.frame.value.paintTiming.units.some(
        (u) => u.timingSource === 'display-estimate',
      ),
    ).toBe(true);
    expect(
      owner.outputDocument.value.lines[0].estimatedFineTiming.units,
    ).toEqual([unit]);
    expect(owner.outputDocument.value.lines[0]).not.toHaveProperty(
      'paintTiming',
    );
    expect(
      owner.outputDocument.value.lines[0].estimatedStarts.segments[0].startMs,
    ).toBe(1000);
    scope.stop();
  });
  it('keeps exact onset highlights without turning the following gap into a delayed sweep', async () => {
    const { owner, scope, positionMs } = setup();
    await nextTick();
    owner.setApplied(true);
    try {
      for (const at of [999, 1000, 1050, 2999, 3000, 3050, 1050]) {
        positionMs.value = at;
        const chunks = owner.frame.value.chunks;
        expect(chunks[0].state).toBe(
          at < 1000 ? 'upcoming' : at < 3000 ? 'active' : 'past',
        );
        expect(chunks[1].state).toBe(at < 3000 ? 'upcoming' : 'active');
        for (const chunk of chunks) {
          expect(chunk).not.toHaveProperty('progress');
          expect(chunk).not.toHaveProperty('displaySweep');
        }
      }
    } finally {
      scope.stop();
    }
  });
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

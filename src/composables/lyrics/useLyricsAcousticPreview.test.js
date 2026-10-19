import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import { useLyricsAcousticPreview } from './useLyricsAcousticPreview.js';

function setup() {
  const document = shallowRef({
    documentId: 'doc',
    normalizerProfileId: 'lyrics-source-v2',
    granularity: 'T1',
    source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
    lines: [{ lineId: 'line', text: '你好', startMs: 1000, endMs: 4000 }],
  });
  const estimate = shallowRef({
    status: 'ready',
    preview: {
      estimateId: 'estimate',
      documentId: 'doc',
      sourceFilename: 'main.lrc',
      sourceFingerprint: 'a'.repeat(64),
      normalizerProfileId: 'lyrics-source-v2',
      offsetUsedMs: 0,
      methodKind: 'fixture',
      lines: [
        {
          ...document.value.lines[0],
          status: 'ready',
          reason: null,
          chunks: [
            { chunkId: 'a', from: 0, to: 1, startMs: 1000 },
            { chunkId: 'b', from: 1, to: 2, startMs: 3000 },
          ],
        },
      ],
    },
  });
  const offsetMs = shallowRef(0),
    positionMs = shallowRef(2700),
    sourceKey = shallowRef('track-a/main.lrc');
  const scope = effectScope();
  const preview = scope.run(() =>
    useLyricsAcousticPreview({
      document,
      estimate,
      offsetMs,
      positionMs,
      sourceKey,
    }),
  );
  return {
    scope,
    preview,
    document,
    estimate,
    offsetMs,
    positionMs,
    sourceKey,
  };
}
describe('source-local acoustic preview choice', () => {
  it('keeps a source without optional preview inputs on plain presentation', () => {
    const scope = effectScope();
    const owner = scope.run(() =>
      useLyricsAcousticPreview({
        document: shallowRef({
          lines: [
            { lineId: 'plain', text: '原文', startMs: null, endMs: null },
          ],
          granularity: 'T0',
        }),
      }),
    );
    expect(owner.frame.value.timingSource).toBe('plain');
    expect(owner.setEnabled(true)).toBe(false);
    scope.stop();
  });
  it('starts disabled, toggles the shared frame, and does not mutate canonical timing', () => {
    const f = setup();
    const before = JSON.stringify(f.document.value);
    expect(f.preview.frame.value.timingSource).toBe('line-estimate');
    expect(f.preview.setEnabled(true)).toBe(true);
    expect(f.preview.frame.value.timingSource).toBe('acoustic-estimate');
    f.preview.setEnabled(false);
    expect(f.preview.frame.value.timingSource).toBe('line-estimate');
    expect(JSON.stringify(f.document.value)).toBe(before);
    f.scope.stop();
  });

  it.each(['source', 'estimate', 'offset', 'document'])(
    'clears the session choice when %s changes',
    async (kind) => {
      const f = setup();
      f.preview.setEnabled(true);
      if (kind === 'source') f.sourceKey.value = 'track-b/main.lrc';
      if (kind === 'estimate') f.estimate.value = { status: 'missing' };
      if (kind === 'offset') f.offsetMs.value = 100;
      if (kind === 'document')
        f.document.value = { ...f.document.value, documentId: 'different' };
      await nextTick();
      expect(f.preview.enabled.value).toBe(false);
      expect(f.preview.frame.value.timingSource).toBe('line-estimate');
      f.scope.stop();
    },
  );

  it('keeps a choice through seek/rate clock changes and declines stale activation', () => {
    const f = setup();
    f.preview.setEnabled(true);
    f.positionMs.value = 3200;
    expect(f.preview.frame.value.chunks[1].state).toBe('active');
    f.positionMs.value = 1200;
    expect(f.preview.frame.value.chunks[1].state).toBe('upcoming');
    f.offsetMs.value = 10;
    expect(f.preview.setEnabled(true)).toBe(false);
    f.scope.stop();
  });
});

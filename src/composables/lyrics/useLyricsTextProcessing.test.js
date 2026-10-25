import { effectScope, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import { useLyricsTextProcessing } from './useLyricsTextProcessing.js';

describe('source-owned text selections', () => {
  it.each(['(和聲)', '（和聲）', '(和声)', '（和声）'])(
    'defaults exact %s markers hidden in Output, preserving sung text, source times and restoration',
    (marker) => {
      const scope = effectScope();
      const document = shallowRef({
        documentId: 'backing-marker',
        lines: [
          { lineId: 'label', text: marker, startMs: 1000, endMs: 2000 },
          { lineId: 'v', text: `${marker}一起唱`, startMs: 2000, endMs: 5000 },
          {
            lineId: 'body',
            text: '和聲讓夜色更美',
            startMs: 5000,
            endMs: 8000,
          },
        ],
      });
      const before = structuredClone(document.value);
      const owner = scope.run(() =>
        useLyricsTextProcessing({
          document,
          sourceKey: () => 'backing-source',
        }),
      );
      expect(owner.hiddenLineIds.value).toEqual(['label', 'v']);
      expect(owner.project(document.value).lines).toMatchObject([
        { lineId: 'v', text: '一起唱', startMs: 2000, endMs: 5000 },
        before.lines[2],
      ]);
      owner.setHidden('label', false);
      expect(owner.project(document.value).lines[0]).toMatchObject(
        before.lines[0],
      );
      owner.setHidden('v', false);
      expect(owner.project(document.value).lines).toMatchObject(before.lines);
      expect(document.value).toEqual(before);
      scope.stop();
    },
  );
  it('confirms artist prefixes reactively while respecting a manual restoration', () => {
    const scope = effectScope(),
      document = shallowRef({
        documentId: 'names',
        lines: [
          {
            lineId: 'a',
            text: 'Rapeter: Yo, yo check1212.',
            startMs: 0,
            endMs: 6000,
          },
        ],
      }),
      performers = shallowRef([]);
    const owner = scope.run(() =>
      useLyricsTextProcessing({
        document,
        sourceKey: () => 'track/source',
        performers,
      }),
    );
    expect(owner.hiddenLineIds.value).toEqual([]);
    expect(owner.project(document.value).lines[0].text).toBe(
      document.value.lines[0].text,
    );
    performers.value = ['Rapeter'];
    expect(owner.hiddenLineIds.value).toEqual(['a']);
    expect(owner.project(document.value).lines[0]).toMatchObject({
      text: 'Yo, yo check1212.',
      startMs: 0,
      endMs: 6000,
      vocalParts: [{ label: 'Rapeter', role: 'solo' }],
    });
    owner.setHidden('a', false);
    performers.value = ['Rapeter / DC'];
    expect(owner.hiddenLineIds.value).toEqual([]);
    expect(owner.project(document.value).lines[0].text).toBe(
      document.value.lines[0].text,
    );
    scope.stop();
  });

  it('restores a byline, a standalone label and an inline label independently', () => {
    const scope = effectScope(),
      document = shallowRef({
        documentId: 'cast',
        lines: [
          {
            lineId: 'c',
            text: '混音助理 Mixing Assistant: Grove Miki @ Jamroom',
          },
          { lineId: 'm', text: '（和聲）' },
          { lineId: 'v', text: '[女]（和聲）一起唱（啊啊）' },
        ],
      });
    const before = structuredClone(document.value);
    const processing = scope.run(() =>
      useLyricsTextProcessing({ document, sourceKey: () => 'source' }),
    );
    expect(processing.hiddenLineIds.value).toEqual(['c', 'm', 'v']);
    expect(processing.project(document.value).lines.map((l) => l.text)).toEqual(
      ['一起唱（啊啊）'],
    );
    processing.setHidden('v', false);
    expect(processing.project(document.value).lines).toMatchObject([
      document.value.lines[2],
    ]);
    processing.setHidden('m', false);
    expect(processing.project(document.value).lines).toMatchObject(
      document.value.lines.slice(1),
    );
    processing.restore();
    expect(processing.project(document.value).lines).toMatchObject(
      document.value.lines,
    );
    expect(document.value).toEqual(before);
    scope.stop();
  });
  it('defaults clear bylines hidden, allows per-line restoration and resets overrides with the source', () => {
    const scope = effectScope();
    const document = shallowRef({
      documentId: 'same',
      lines: [
        { lineId: 'c', text: 'Producer: HARIKIRI' },
        { lineId: 'v', text: '一起唱（啊啊和聲）' },
      ],
    });
    const sourceKey = shallowRef('track-a/source-a');
    const processing = scope.run(() =>
      useLyricsTextProcessing({ document, sourceKey }),
    );
    expect(processing.hiddenLineIds.value).toEqual(['c']);
    expect(processing.setHidden('v', true)).toBe(false);
    expect(processing.setHidden('c', true)).toBe(true);
    expect(
      processing.project(document.value).lines.map((l) => l.lineId),
    ).toEqual(['v']);
    processing.setHidden('c', false);
    expect(processing.project(document.value).lines).toMatchObject(
      document.value.lines,
    );
    processing.setHidden('c', true);
    sourceKey.value = 'track-a/source-b';
    expect(processing.hiddenLineIds.value).toEqual(['c']);
    processing.setHidden('c', true);
    document.value = {
      ...document.value,
      lines: [{ lineId: 'c', text: '作詞：另一句' }],
    };
    expect(processing.hiddenLineIds.value).toEqual([]);
    processing.setHidden('c', true);
    processing.restore();
    expect(processing.project(document.value).lines).toMatchObject(
      document.value.lines,
    );
    scope.stop();
  });

  it('keeps the screenshot dialogue and punctuation while filtering only the Producer output line', () => {
    const scope = effectScope();
    const document = shallowRef({
      documentId: 'screenshots',
      lines: [
        {
          lineId: 'producer',
          text: '製作人/編曲 Producer: HARIKIRI',
          startMs: 0,
          endMs: 21000,
        },
        {
          lineId: 'dc',
          text: 'DC: Yo Peter, it’s time to make a toast.',
          startMs: 21000,
          endMs: 26000,
        },
        {
          lineId: 'rap',
          text: 'Rapeter: Yo, yo check1212.',
          startMs: 26000,
          endMs: 30000,
        },
        {
          lineId: 'title',
          text: '《Rap of CN》 kinda be唯一的機會',
          startMs: 30000,
          endMs: 35000,
        },
        {
          lineId: 'sung',
          text: 'Lyrics: I wrote your name into the sky',
          startMs: 35000,
          endMs: 40000,
        },
        {
          lineId: 'chorus',
          text: '[女] Why?（啊啊和聲）',
          startMs: 40000,
          endMs: 45000,
        },
      ],
    });
    const before = structuredClone(document.value);
    const processing = scope.run(() =>
      useLyricsTextProcessing({ document, sourceKey: () => 'track/source' }),
    );
    expect(processing.hiddenLineIds.value).toEqual(['producer', 'chorus']);
    expect(processing.project(document.value).lines.at(-1)).toMatchObject({
      text: 'Why?（啊啊和聲）',
      vocalParts: [{ from: 0, to: 10, label: '女', role: 'female' }],
    });
    expect(document.value).toEqual(before);
    processing.setHidden('producer', false);
    processing.setHidden('chorus', false);
    expect(processing.project(document.value).lines).toMatchObject(
      document.value.lines,
    );
    // A clock/timing refresh cannot re-hide an explicitly restored line.
    document.value = {
      ...document.value,
      lines: document.value.lines.map((line) => ({
        ...line,
        endMs: line.endMs + 1,
      })),
    };
    expect(processing.hiddenLineIds.value).toEqual([]);
    processing.setHidden('sung', true);
    processing.restore();
    expect(processing.hiddenLineIds.value).toEqual([]);
    scope.stop();
  });
});

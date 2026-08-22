import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PerformerStage from './PerformerStage.vue';

function render(frame) {
  return renderToString(
    createSSRApp({ render: () => h(PerformerStage, { frame }) }),
  );
}

function frame(overrides = {}) {
  return {
    mode: 'live',
    playbackStatus: 'playing',
    track: { title: '夜に駆ける', artist: 'YOASOBI' },
    currentLine: { text: '沈むように溶けてゆくように' },
    currentReading: {
      text: '沈むように溶けてゆくように',
      romaji: 'shizumu you ni tokete yuku you ni',
      segments: [{ text: '沈', reading: 'しず' }, { text: 'むように' }],
    },
    nextLine: { text: '二人だけの空が広がる夜に' },
    nextReading: null,
    readingExpected: true,
    nextTrack: { title: 'Stellar Stellar', artist: '星街すいせい' },
    keyLabel: 'Key -2',
    tempoLabel: '90%',
    ...overrides,
  };
}

describe('PerformerStage', () => {
  it('renders current/next cues, reading aid, adjustments, and next track', async () => {
    const html = await render(frame());
    expect(html).toContain('<ruby');
    expect(html).toMatch(/<rt[^>]*>しず<\/rt>/);
    expect(html).toContain('shizumu you ni tokete yuku you ni');
    expect(html).toContain('二人だけの空が広がる夜に');
    expect(html).toContain('Key -2');
    expect(html).toContain('Tempo 90%');
    expect(html).toContain('Stellar Stellar');
  });

  it('renders explicit idle and missing-reading states without unsafe HTML', async () => {
    const html = await render(
      frame({
        mode: 'idle',
        track: null,
        currentLine: { text: '<script>alert(1)</script>' },
        currentReading: null,
        nextLine: null,
        nextTrack: null,
      }),
    );
    expect(html).toContain('尚未播放曲目');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('未排定');
  });
});

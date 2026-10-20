import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import PerformerSurface from './PerformerSurface.vue';
import { selectPerformerFrame } from '../../../shared/presentation/performerFrame.mjs';

const surfaceSource = readFileSync(
  new URL('./PerformerSurface.vue', import.meta.url),
  'utf8',
);
const cueSource = readFileSync(
  new URL('./PerformerLyricCue.vue', import.meta.url),
  'utf8',
);
const trackContextSource = readFileSync(
  new URL('./PerformerTrackContext.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/features/performer.css', import.meta.url),
  'utf8',
);

function frame(overrides = {}) {
  return {
    revision: 7,
    trackId: 'track-1',
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
    lyricsOffset: {
      milliseconds: -200,
      available: true,
      saving: false,
      error: '',
    },
    ...overrides,
  };
}

function render(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(PerformerSurface, {
          frame: frame(),
          mode: 'prompter',
          readingScale: 'desk',
          ...props,
        }),
    }),
  );
}

describe('PerformerSurface', () => {
  it.each(['off', 'furigana', 'romaji'])(
    'renders only the selected %s aid for both cues',
    async (variant) => {
      const value = {
        state: {
          playback: { status: 'paused', positionMs: 1500, track: { id: 'a' } },
          lyrics: {
            trackId: 'a',
            source: { language: 'ja' },
            synced: true,
            lines: [
              { text: '現在', startMs: 1000, endMs: 3000 },
              { text: '次', startMs: 3000, endMs: 5000 },
            ],
          },
        },
        readings: {
          variant,
          lines: [
            {
              text: '現在',
              romaji: 'genzai',
              segments: [{ text: '現在', reading: 'げんざい' }],
            },
            {
              text: '次',
              romaji: 'tsugi',
              segments: [{ text: '次', reading: 'つぎ' }],
            },
          ],
        },
      };
      const html = await render({ frame: selectPerformerFrame(value) });
      expect(html).toContain('現在');
      expect(html).toContain('次');
      expect(html.includes('<ruby')).toBe(variant === 'furigana');
      expect(html.includes('げんざい')).toBe(variant === 'furigana');
      expect(html.includes('つぎ')).toBe(variant === 'furigana');
      expect(html.includes('genzai')).toBe(variant === 'romaji');
      expect(html.includes('tsugi')).toBe(variant === 'romaji');
      expect(html).not.toContain('無讀音資料');
    },
  );

  it('keeps product mode and reading distance explicit', async () => {
    const html = await render({ mode: 'combined', readingScale: 'stage' });
    expect(html).toContain('data-mode="combined"');
    expect(html).toContain('data-reading-scale="stage"');
    expect(html).toContain('aria-label="歌詞同步微調"');
    expect(html).toContain('aria-label="提詞器操作列"');
    expect(html).toContain('顯示設定');
    expect(html).toContain('延後 0.1 秒');
    expect(html).toContain('提前 0.1 秒');
  });

  it('renders current/next cues, reading aid, adjustments, and next track', async () => {
    const html = await render();
    expect(html).toContain('data-cue-priority="primary"');
    expect(html).toContain('data-cue-priority="secondary"');
    expect(html).toContain('<ruby');
    expect(html).toMatch(/<rt[^>]*>しず<\/rt>/u);
    expect(html).toContain('shizumu you ni tokete yuku you ni');
    expect(html).toContain('二人だけの空が広がる夜に');
    expect(html).toContain('Key -2');
    expect(html).toContain('Tempo 90%');
    expect(html).toContain('Stellar Stellar');
  });

  it('omits absent optional context instead of rendering an empty footer', async () => {
    const html = await render({ frame: frame({ nextTrack: null }) });
    expect(html).not.toContain('performer-next-track');
    expect(html).not.toContain('未排定');
  });

  it('keeps metadata and controls in quiet layers below the lyric focus', () => {
    expect(surfaceSource).toContain('aria-label="提詞工具"');
    expect(surfaceSource).toContain('performer-surface__utility-rail');
    expect(trackContextSource).toContain(
      'performer-track-context__playback-indicator',
    );
    expect(trackContextSource).not.toContain(
      'min-height: var(--ui-control-height)',
    );
    expect(trackContextSource).not.toContain(
      'border-color: var(--ui-color-accent)',
    );
    expect(cueSource).toMatch(
      /\.performer-lyric-cue__reading\s*\{[^}]*color:\s*var\(--ui-performer-secondary-foreground\)/su,
    );
    expect(cueSource).toMatch(
      /\.performer-lyric-cue--current \.performer-lyric-cue__reading\s*\{[^}]*color:\s*var\(--ui-color-text-muted\)/su,
    );
    expect(cueSource).toMatch(
      /\.performer-lyric-cue--current rt\s*\{[^}]*color:\s*var\(--ui-color-accent\)/su,
    );
  });

  it('uses named container adaptation, safe areas, and coarse-pointer targets', () => {
    const surfaceRule = surfaceSource.match(
      /\.performer-surface\s*\{(?<body>[^}]+)\}/u,
    )?.groups?.body;

    expect(surfaceSource).toContain('container-name: performer-surface');
    expect(surfaceSource).toContain('container-type: size');
    expect(surfaceSource).toContain('@container performer-surface');
    expect(surfaceSource).toContain('env(safe-area-inset-bottom)');
    expect(surfaceSource).toContain('@media (pointer: coarse)');
    expect(surfaceSource).not.toContain('@media (max-width:');
    expect(surfaceRule).toContain('-webkit-user-select: none');
    expect(surfaceRule).toContain('user-select: none');
    expect(tokenSource).toContain('--ui-performer-cue-current-size-near');
    expect(tokenSource).toContain('--ui-performer-cue-current-size-desk');
    expect(tokenSource).toContain('--ui-performer-cue-current-size-stage');
    expect(tokenSource).toContain('--ui-performer-action-min-block-size');
    expect(cueSource).toContain('--ui-performer-cue-current-font-size');
    expect(cueSource).not.toContain('@media (max-height:');
  });

  it('escapes lyric text and renders a bounded save failure', async () => {
    const html = await render({
      frame: frame({
        currentLine: { text: '<script>alert(1)</script>' },
        currentReading: null,
        lyricsOffset: {
          milliseconds: 100,
          available: true,
          saving: false,
          error: '同步調整未儲存，請再試一次。',
        },
      }),
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('同步調整未儲存，請再試一次。');
    expect(html).toContain('重試');
    expect(html).toContain('ui-notice--danger');
    expect(html).toContain('role="alert"');
  });
});

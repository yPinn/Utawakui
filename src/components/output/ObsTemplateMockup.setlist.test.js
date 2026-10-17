import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readObsTemplatePreviewSource } from './obsTemplateMockupSource.mjs';

const source = readObsTemplatePreviewSource('QueueBoard');
const normalized = source
  .replace(/\s+/gu, ' ')
  .replace(/\(\s+/gu, '(')
  .replace(/\s+\)/gu, ')');
const runtimeCss = readFileSync(
  fileURLToPath(
    new URL('../../../overlay/setlist/setlist.css', import.meta.url),
  ),
  'utf8',
);
const canvasRem = (value) => `calc(${value} * var(--obs-canvas-rem))`;

describe('Setlist template mockup', () => {
  it('orders current song before completed history as distinct regions', () => {
    expect(source).toContain('class="obs-template-mockup__setlist-history"');
    expect(source).toContain('class="obs-template-mockup__setlist-current"');
    expect(source).toContain('const completedTracks = computed');
    expect(source).toContain('const currentTrack = computed');
    expect(
      source.indexOf('class="obs-template-mockup__setlist-current"'),
    ).toBeLessThan(
      source.indexOf('class="obs-template-mockup__setlist-history"'),
    );
    expect(source).not.toContain(
      ".filter((item) => item.state === 'played').reverse()",
    );
  });

  it('mirrors the runtime current／history rows inside the 480×810 capture', () => {
    expect(runtimeCss).toContain(
      'grid-template-rows: minmax(9rem, auto) minmax(0, 1fr);',
    );
    expect(normalized).toContain(
      `grid-template-rows: minmax(${canvasRem(9)}, auto) minmax(0, 1fr);`,
    );
    // Panel gap doubles the default space-3; max-width 42rem pads with space-3.
    expect(normalized).toContain(`row-gap: ${canvasRem(1.5)};`);
    expect(normalized).toContain(`padding: ${canvasRem(0.75)};`);
    expect(normalized).toContain(`inset: ${canvasRem(1)};`);
  });

  it('resolves every runtime type clamp at a 16px root', () => {
    for (const [runtime, preview] of [
      [
        'clamp(1.75rem, 1.85em, 2.125rem)',
        `--ui-setlist-preview-current-title-size: ${canvasRem(1.85)};`,
      ],
      [
        'clamp(1rem, 1.05em, 1.125rem)',
        `--ui-setlist-preview-history-title-size: ${canvasRem(1.05)};`,
      ],
      [
        'clamp(0.8125rem, 0.88em, 1rem)',
        `--ui-setlist-preview-current-artist-size: ${canvasRem(0.88)};`,
      ],
      [
        'clamp(0.75rem, 0.72em, 0.8125rem)',
        `--ui-setlist-preview-label-size: ${canvasRem(0.75)};`,
      ],
      [
        'clamp(0.6875rem, 0.7em, 0.75rem)',
        `--ui-setlist-preview-counter-size: ${canvasRem(0.7)};`,
      ],
    ]) {
      expect(runtimeCss).toContain(runtime);
      expect(normalized).toContain(preview);
    }
    expect(runtimeCss.replace(/\s+/gu, ' ')).toContain(
      'clamp( 0.75rem, 0.76em, 0.875rem )',
    );
    expect(normalized).toContain(
      `--ui-setlist-preview-history-artist-size: ${canvasRem(0.76)};`,
    );
  });

  it('mirrors title-over-artist rows with one shared content edge', () => {
    expect(source).toContain(
      'class="obs-template-mockup__setlist-history-list"',
    );
    expect(normalized).toContain(
      `grid-template-columns: ${canvasRem(1.6)} minmax(0, 1fr);`,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-row\s+\.obs-template-mockup__queue-number\s*{[^}]*grid-row:\s*1\s*\/\s*span 2;[^}]*align-self:\s*center;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__content--setlist\s+\.obs-template-mockup__queue-title\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-artist\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current-title,\s*\.obs-template-mockup__content--setlist\s+\.obs-template-mockup__queue-title\s*{[^}]*display:\s*-webkit-box;[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(source).not.toContain("[data-size='thumbnail']");
  });

  it('measures Workbench overflow before enabling vertical history motion', () => {
    expect(source).toContain('ref="setlistHistoryViewport"');
    expect(source).toContain('ref="setlistHistoryList"');
    expect(source).toContain('setlistHistoryViewport.value.scrollHeight');
    expect(source).toContain('setlistHistoryViewport.value.clientHeight');
    expect(source).toContain(':data-history-overflow=');
    expect(source).toContain('ResizeObserver');
    expect(source).toMatch(
      /\[data-history-overflow='true'\]\[data-history-motion='running'\][\s\S]*animation:\s*obs-template-setlist-scroll/s,
    );
  });
});

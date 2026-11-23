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
const normalizedRuntime = runtimeCss
  .replace(/\s+/gu, ' ')
  .replace(/\(\s+/gu, '(')
  .replace(/\s+\)/gu, ')');

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

  it('mirrors runtime type limits in canvas rem as the preset changes', () => {
    for (const role of [
      'current-title',
      'history-title',
      'current-artist',
      'history-artist',
      'label',
      'counter',
    ]) {
      const [, size] = normalizedRuntime.match(
        new RegExp(`--ovl-template-setlist-type-${role}: ([^;]+);`, 'u'),
      );
      const canvasSize = size
        .replace(/([\d.]+)rem/gu, (_, value) =>
          value === '1' ? 'var(--obs-canvas-rem)' : canvasRem(value),
        )
        .replace(
          'calc(calc(1.75 * var(--obs-canvas-rem)) * min(',
          'calc(1.75 * var(--obs-canvas-rem) * min(',
        );
      expect(normalized).toContain(
        `--ui-setlist-preview-${role}-size: ${canvasSize};`,
      );
    }
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

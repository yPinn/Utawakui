import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

const source = readObsTemplateMockupSource();

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

  it('mirrors the current 2／history 8 composition without a dead spacer row', () => {
    expect(source).toMatch(
      /\.obs-template-mockup__content--setlist\s*{[^}]*grid-template-rows:\s*minmax\(0, 2fr\) minmax\(0, 8fr\);[^}]*gap:\s*var\(--ui-space-3\);/s,
    );
    expect(source).not.toContain(
      'grid-template-rows: repeat(10, minmax(0, 1fr));',
    );
  });

  it('uses explicit header／content rows with both contents aligned top-left', () => {
    expect(source).toContain(
      'class="obs-template-mockup__setlist-current-track"',
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current-track\s*{[^}]*align-self:\s*start;[^}]*text-align:\s*start;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-viewport\s*{[^}]*align-items:\s*flex-start;[^}]*padding-block-start:/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-row\s*{[^}]*text-align:\s*start;/s,
    );
  });

  it('mirrors the readable role hierarchy while keeping thumbnail typography independent', () => {
    const normalizedSource = source
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')');

    for (const declaration of [
      '--ui-setlist-preview-current-title-size: var(--ui-font-size-xl);',
      '--ui-setlist-preview-history-title-size: var(--ui-font-size-md);',
      '--ui-setlist-preview-current-artist-size: var(--ui-font-size-sm);',
      '--ui-setlist-preview-history-artist-size: var(--ui-font-size-sm);',
      '--ui-setlist-preview-label-size: var(--ui-font-size-sm);',
      '--ui-setlist-preview-counter-size: var(--ui-font-size-sm);',
    ]) {
      expect(normalizedSource).toContain(declaration);
    }

    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current-title\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-current-title-size\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__content--setlist\s+\.obs-template-mockup__queue-title\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-history-title-size\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current-artist\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-current-artist-size\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-artist\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-history-artist-size\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-row\s+\.obs-template-mockup__queue-number\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-counter-size\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-label,\s*\.obs-template-mockup__setlist-caption,\s*\.obs-template-mockup__setlist-source\s*{[^}]*font-size:\s*var\(--ui-setlist-preview-label-size\);/s,
    );
    expect(normalizedSource).toMatch(
      /\.obs-template-mockup\[data-size='thumbnail'\]\s+\.obs-template-mockup__content--setlist\s*{[^}]*--ui-setlist-preview-current-title-size:\s*var\(--ui-output-template-thumb-title-font-size\);[^}]*--ui-setlist-preview-label-size:\s*var\(--ui-output-template-thumb-caption-font-size\);/s,
    );
  });

  it('mirrors title-over-artist rows with one shared content edge', () => {
    expect(source).toContain(
      'class="obs-template-mockup__setlist-history-list"',
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-list\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*align-content:\s*start;[^}]*row-gap:\s*var\(--ui-space-2\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-row\s*{[^}]*grid-template-columns:\s*1rem minmax\(0, 1fr\);[^}]*grid-template-rows:\s*auto auto;[^}]*align-items:\s*start;/s,
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
    expect(source).not.toContain(
      'class="obs-template-mockup__setlist-history-marquee"',
    );
    expect(source).not.toContain(
      'class="obs-template-mockup__setlist-history-sequence"',
    );
    expect(source).not.toContain('@keyframes obs-template-setlist-marquee');
  });

  it('mirrors two-line capture titles while keeping thumbnails single-line', () => {
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current-title,\s*\.obs-template-mockup__content--setlist\s+\.obs-template-mockup__queue-title\s*{[^}]*display:\s*-webkit-box;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup\[data-size='thumbnail'\][\s\S]*\.obs-template-mockup__setlist-current-title,[\s\S]*\.obs-template-mockup__queue-title\s*{[^}]*display:\s*block;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
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

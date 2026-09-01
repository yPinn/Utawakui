import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ObsTemplateMockup.vue', import.meta.url),
  'utf8',
);

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

  it('mirrors the upper current 3／gap 1／lower completed 6 composition', () => {
    expect(source).toContain('grid-template-rows: repeat(10, minmax(0, 1fr));');
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-current\s*{[^}]*grid-row:\s*1\s*\/\s*span 3;/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history\s*{[^}]*grid-row:\s*5\s*\/\s*span 6;/s,
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

  it('mirrors one downward column of separated completed-song rows', () => {
    expect(source).toContain(
      'class="obs-template-mockup__setlist-history-list"',
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-list\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*align-content:\s*start;[^}]*row-gap:\s*var\(--ui-space-2\);/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__setlist-history-row\s*{[^}]*grid-template-columns:\s*1rem minmax\(0, 1fr\) minmax\(0, 34%\);[^}]*align-items:\s*center;/s,
    );
    expect(source).not.toContain(
      'class="obs-template-mockup__setlist-history-marquee"',
    );
    expect(source).not.toContain(
      'class="obs-template-mockup__setlist-history-sequence"',
    );
    expect(source).not.toContain('@keyframes obs-template-setlist-marquee');
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

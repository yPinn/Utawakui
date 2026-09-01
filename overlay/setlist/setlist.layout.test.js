import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('./setlist.mjs', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./setlist.css', import.meta.url), 'utf8');

describe('Setlist performance-state layout', () => {
  it('orders the current song before completed history semantically', () => {
    expect(html).toContain('class="setlist-overlay__history"');
    expect(html).toContain('id="setlist-history"');
    expect(html).toContain('class="setlist-overlay__current"');
    expect(html).toContain('id="setlist-current"');
    expect(html).not.toContain('id="setlist-rows"');
    expect(html.indexOf('class="setlist-overlay__current"')).toBeLessThan(
      html.indexOf('class="setlist-overlay__history"'),
    );
  });

  it('uses upper current 3／gap 1／lower completed 6 after root padding', () => {
    expect(styles).toContain('grid-template-rows: repeat(10, minmax(0, 1fr));');
    expect(styles).toMatch(
      /\.setlist-overlay__current\s*{[^}]*grid-row:\s*1\s*\/\s*span 3;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history\s*{[^}]*grid-row:\s*5\s*\/\s*span 6;/s,
    );
  });

  it('splits both regions into header and top-left content rows', () => {
    expect(styles).toMatch(
      /\.setlist-overlay__current\s*{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__current-track\s*{[^}]*align-self:\s*start;[^}]*text-align:\s*start;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-viewport\s*{[^}]*align-items:\s*flex-start;[^}]*padding-block-start:/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row\s*{[^}]*text-align:\s*start;/s,
    );
  });

  it('stacks completed songs as separated single-line rows in one downward column', () => {
    expect(html).toContain('id="setlist-history-viewport"');
    expect(html).toContain('id="setlist-history"');
    expect(html).not.toContain('id="setlist-history-marquee"');
    expect(html).not.toContain('id="setlist-history-copy"');
    expect(styles).toMatch(
      /\.setlist-overlay__history-list\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*align-content:\s*start;[^}]*row-gap:\s*var\(--ovl-primitive-space-2\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row\s*{[^}]*grid-template-columns:\s*1\.6rem minmax\(0, 1fr\) minmax\(0, 34%\);[^}]*align-items:\s*center;/s,
    );
    expect(styles).not.toContain('@keyframes setlist-history-marquee');
    expect(runtime).not.toContain('historyCopy');
    expect(runtime).not.toContain('dataset.historyMotion');
  });

  it('animates the one list vertically only after measured overflow', () => {
    expect(styles).toMatch(
      /\.setlist-overlay\[data-history-overflow='true'\]\s+\.setlist-overlay__history-list\s*{[^}]*animation:\s*setlist-history-scroll/s,
    );
    expect(styles).toContain('@keyframes setlist-history-scroll');
    expect(styles).toMatch(
      /transform:\s*translateY\(\s*calc\(-1 \* var\(--ovl-template-setlist-scroll-distance\)\)\s*\);/s,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;/,
    );
  });

  it('renders current and completed projections without queued rows', () => {
    expect(runtime).toContain('frame.current');
    expect(runtime).toContain('frame.history');
    expect(runtime).not.toContain('is-queued');
  });
});

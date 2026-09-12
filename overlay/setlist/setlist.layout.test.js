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

  it('uses a bounded current region, flexible history, and semantic spacing', () => {
    expect(styles).toContain(
      'grid-template-rows: minmax(9rem, auto) minmax(0, 1fr);',
    );
    expect(styles).toContain(
      'row-gap: calc(var(--ovl-user-panel-gap) + var(--ovl-user-panel-gap));',
    );
    expect(styles).not.toContain(
      'grid-template-rows: repeat(10, minmax(0, 1fr));',
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

  it('bounds every capture typography role instead of scaling all copy uniformly', () => {
    const normalizedStyles = styles
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')');

    for (const declaration of [
      '--ovl-template-setlist-type-current-title: clamp(1.75rem, 1.85em, 2.125rem);',
      '--ovl-template-setlist-type-history-title: clamp(1rem, 1.05em, 1.125rem);',
      '--ovl-template-setlist-type-current-artist: clamp(0.8125rem, 0.88em, 1rem);',
      '--ovl-template-setlist-type-history-artist: clamp(0.75rem, 0.76em, 0.875rem);',
      '--ovl-template-setlist-type-label: clamp(0.75rem, 0.72em, 0.8125rem);',
      '--ovl-template-setlist-type-counter: clamp(0.6875rem, 0.7em, 0.75rem);',
    ]) {
      expect(normalizedStyles).toContain(declaration);
    }

    expect(styles).toMatch(
      /\.setlist-overlay__current-title\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-current-title\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__track\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-history-title\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__current-artist\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-current-artist\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__artist\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-history-artist\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row::before\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-counter\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__section-label,\s*\.setlist-overlay__history-caption\s*{[^}]*font-size:\s*var\(--ovl-template-setlist-type-label\);/s,
    );
    expect(styles).not.toContain('font-size: 1.65em;');
    expect(styles).not.toContain('font-size: 1.45em;');
  });

  it('stacks each completed title and artist in one shared content column', () => {
    expect(html).toContain('id="setlist-history-viewport"');
    expect(html).toContain('id="setlist-history"');
    expect(html).not.toContain('id="setlist-history-marquee"');
    expect(html).not.toContain('id="setlist-history-copy"');
    expect(styles).toMatch(
      /\.setlist-overlay__history-list\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*align-content:\s*start;[^}]*row-gap:\s*var\(--ovl-primitive-space-2\);/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row\s*{[^}]*grid-template-columns:\s*1\.6rem minmax\(0, 1fr\);[^}]*grid-template-rows:\s*auto auto;[^}]*align-items:\s*start;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row::before\s*{[^}]*grid-row:\s*1\s*\/\s*span 2;[^}]*align-self:\s*center;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__track\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__artist\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__history-row\s*{[^}]*min-block-size:\s*calc\(\s*var\(--ovl-primitive-space-6\) \+ var\(--ovl-primitive-space-4\)\s*\);/s,
    );
    expect(styles).not.toContain('--ovl-primitive-space-7');
    expect(styles).not.toContain('@keyframes setlist-history-marquee');
    expect(runtime).not.toContain('historyCopy');
    expect(runtime).not.toContain('dataset.historyMotion');
  });

  it('gives current and completed titles two readable lines before truncating', () => {
    expect(styles).toMatch(
      /\.setlist-overlay__current-title,\s*\.setlist-overlay__track\s*{[^}]*display:\s*-webkit-box;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*2;/s,
    );
    expect(styles).toMatch(
      /\.setlist-overlay__current-artist,\s*\.setlist-overlay__artist\s*{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
  });

  it('loads GSAP before the runtime and leaves dynamic transforms to JavaScript', () => {
    expect(html).toContain('/overlay/vendor/gsap.min.js');
    expect(html.indexOf('/overlay/vendor/gsap.min.js')).toBeLessThan(
      html.indexOf('/overlay/setlist/setlist.mjs'),
    );
    expect(runtime).toContain('createSetlistCurrentMotionController');
    expect(runtime).toContain('createSetlistHistoryMotionController');
    expect(styles).not.toContain('@keyframes setlist-history-scroll');
    expect(styles).not.toMatch(
      /\.setlist-overlay__history-list\s*{[^}]*animation:/s,
    );
  });

  it('renders current and completed projections without queued rows', () => {
    expect(runtime).toContain('frame.current');
    expect(runtime).toContain('frame.history');
    expect(runtime).not.toContain('is-queued');
  });
});

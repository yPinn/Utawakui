import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const styles = readFileSync(
  new URL('./now-playing.css', import.meta.url),
  'utf8',
);
const artworkStyles = readFileSync(
  new URL('./artwork.css', import.meta.url),
  'utf8',
);

describe('Now Playing CD player layout', () => {
  it('reserves a 3／1／6 ten-column composition', () => {
    expect(styles).toContain(
      'grid-template-columns: repeat(10, minmax(0, 1fr));',
    );
    expect(styles).toMatch(
      /\.now-playing-overlay__player\s*{[^}]*grid-column:\s*1\s*\/\s*span 3;/s,
    );
    expect(styles).toMatch(
      /\.now-playing-overlay__information\s*{[^}]*grid-column:\s*5\s*\/\s*span 6;/s,
    );
  });

  it('builds the player from local structure without reference artwork', () => {
    const compact = html.slice(
      html.indexOf('id="now-playing-overlay"'),
      html.indexOf('</main>'),
    );
    for (const className of [
      'now-playing-overlay__player',
      'now-playing-overlay__player-shell',
      'now-playing-overlay__disc',
      'now-playing-overlay__disc-label',
      'now-playing-overlay__spindle',
      'now-playing-overlay__pickup',
      'now-playing-overlay__controls',
    ]) {
      expect(compact).toContain(`class="${className}"`);
    }
    expect(html).not.toMatch(/aespa|armageddon|sm entertainment/i);
    expect(compact).not.toContain('<img');
  });

  it('hosts artwork layouts on the same Browser Source document', () => {
    expect(html).toContain('id="artwork-overlay"');
    expect(html).toContain('id="artwork-image"');
    expect(html).toContain('class="artwork-overlay__timeline"');
    expect(html).toContain('class="artwork-overlay__transport"');
    expect(html).not.toContain('artwork-overlay__volume');
    expect(html).toContain('/overlay/now-playing/artwork.css');
  });

  it('builds 黑膠主題 as equal album and turntable regions', () => {
    const artwork = html.slice(
      html.indexOf('id="artwork-overlay"'),
      html.lastIndexOf('</main>'),
    );
    const albumIndex = artwork.indexOf('artwork-overlay__album-panel');
    const turntableIndex = artwork.indexOf('artwork-overlay__turntable');

    expect(albumIndex).toBeGreaterThan(-1);
    expect(albumIndex).toBeLessThan(turntableIndex);
    for (const className of [
      'artwork-overlay__sleeve',
      'artwork-overlay__incoming-sleeve',
      'artwork-overlay__platter',
      'artwork-overlay__platter-bloom',
      'artwork-overlay__record',
      'artwork-overlay__record-rotor',
      'artwork-overlay__record-dye',
      'artwork-overlay__record-shadow',
      'artwork-overlay__record-highlight',
      'artwork-overlay__record-grooves',
      'artwork-overlay__exchange-record',
      'artwork-overlay__exchange-record-rotor',
      'artwork-overlay__record-label',
      'artwork-overlay__spindle',
      'artwork-overlay__tonearm',
      'artwork-overlay__tonearm-assembly',
      'artwork-overlay__tonearm-pivot',
      'artwork-overlay__tonearm-rail',
      'artwork-overlay__tonearm-head',
      'artwork-overlay__tonearm-counterweight',
      'artwork-overlay__stylus',
    ]) {
      expect(artwork).toContain(className);
    }
    expect(artwork).toContain('<svg');
    expect(artwork).toContain('viewBox="0 0 100 240"');
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__vinyl-stage\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
    expect(artworkStyles).toMatch(
      /:root:not\(\[data-ovl-template='cover-player'\]\)\s+\.artwork-overlay__sleeve\s*{[^}]*inline-size:\s*min\(100%, 13\.25rem\);[^}]*aspect-ratio:\s*1;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__turntable\s*{[^}]*inline-size:\s*min\(100%, 13\.25rem\);[^}]*aspect-ratio:\s*1;/s,
    );
    expect(artwork.match(/artwork-overlay__record-shadow/g)).toHaveLength(2);
    expect(artwork.match(/artwork-overlay__record-highlight/g)).toHaveLength(2);
    expect(artwork).not.toMatch(/record-(?:silhouette|ripples)/);
  });

  it('gives the sleeve, type and deck explicit material roles', () => {
    expect(artworkStyles).toContain('--ovl-template-artwork-title-size:');
    expect(artworkStyles).toContain('--ovl-template-artwork-artist-size:');
    expect(artworkStyles).toContain('--ovl-template-artwork-paper-grain:');
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__sleeve::before,[\s\S]*\.artwork-overlay__sleeve::after/,
    );
    expect(artworkStyles).toContain('container-type: inline-size;');
    expect(artworkStyles).toContain('var(--ovl-color-deck-metal)');
    expect(artworkStyles).toContain('var(--ovl-color-platter-rim)');
    expect(artworkStyles).toContain('var(--ovl-color-artwork-accent)');
    expect(artworkStyles).toContain('--ovl-color-artwork-secondary:');
    expect(artworkStyles).toContain('--ovl-color-artwork-tertiary:');
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-record-shadow-mask:',
    );
    expect(artworkStyles).toContain('--ovl-template-artwork-record-ink:');
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-dye-saturation: 1.12;',
    );
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-record-highlight-mask:',
    );
    expect(artworkStyles).toContain('--ovl-template-artwork-shadow-ink:');
    expect(artworkStyles).toContain('--ovl-template-artwork-highlight-ink:');
    expect(artworkStyles).toMatch(
      /--ovl-template-artwork-shadow-ink:[^;]*var\(--ovl-color-vinyl-lowlight\)/s,
    );
    expect(artworkStyles).toMatch(
      /--ovl-template-artwork-highlight-ink:[^;]*var\(--ovl-color-paper\)/s,
    );
    expect(artworkStyles).toMatch(
      /--ovl-template-artwork-record-body:[^;]*var\(--ovl-color-artwork-accent\) 50%/s,
    );
    expect(artworkStyles).toMatch(
      /--ovl-template-artwork-shadow-ink:[^;]*var\(--ovl-color-vinyl-lowlight\) 54%/s,
    );
    expect(artworkStyles).toMatch(
      /--ovl-template-artwork-highlight-ink:[^;]*var\(--ovl-color-paper\) 44%/s,
    );
    expect(artworkStyles).not.toMatch(
      /record-(?:web|spoke|ripples?|silhouette)|data-web/i,
    );
    expect(artworkStyles).toContain('--ovl-template-artwork-bloom-core:');
    expect(artworkStyles).toContain('--ovl-template-artwork-bloom-halo:');
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-bloom-blur: var(--ovl-primitive-space-2);',
    );
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-bloom-playing-opacity: 0.92;',
    );
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-bloom-paused-opacity: 0.4;',
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__platter-bloom\s*{[^}]*background:\s*radial-gradient\([^}]*will-change:\s*opacity;/s,
    );
    const bloomRule = artworkStyles.match(
      /\.artwork-overlay__platter-bloom\s*{[^}]*}/s,
    )?.[0];
    expect(bloomRule).toContain('inset: -8%;');
    expect(bloomRule).toContain('transparent 78%');
    expect(bloomRule).toContain(
      'filter: blur(var(--ovl-template-artwork-bloom-blur));',
    );
    expect(artworkStyles).toContain('var(--ovl-color-text-secondary)');
    expect(bloomRule).not.toMatch(/mix-blend-mode:|animation:/);

    const deckLightRule = artworkStyles.match(
      /\.artwork-overlay__deck-light\s*{[^}]*}/s,
    )?.[0];
    const deckLightHaloRule = artworkStyles.match(
      /\.artwork-overlay__deck-light::before\s*{[^}]*}/s,
    )?.[0];
    const deckLightCoreRule = [
      ...artworkStyles.matchAll(
        /\.artwork-overlay__deck-light::after\s*{[^}]*}/gs,
      ),
    ].find(([rule]) =>
      rule.includes('background: var(--ovl-color-artwork-label);'),
    )?.[0];
    expect(artworkStyles).toContain(
      '--ovl-template-artwork-deck-light-blur: var(--ovl-primitive-space-1);',
    );
    expect(deckLightRule).toContain(
      'inline-size: var(--ovl-primitive-space-4);',
    );
    expect(deckLightRule).toContain(
      'block-size: var(--ovl-primitive-space-4);',
    );
    expect(deckLightRule).toContain('box-sizing: border-box;');
    expect(deckLightHaloRule).toContain('block-size: 125%;');
    expect(deckLightHaloRule).toContain(
      'filter: blur(var(--ovl-template-artwork-deck-light-blur));',
    );
    expect(deckLightCoreRule).toContain('block-size: 38%;');
    expect(deckLightCoreRule).toContain(
      'background: var(--ovl-color-artwork-label);',
    );
    expect(`${deckLightHaloRule}${deckLightCoreRule}`).not.toContain(
      'animation:',
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__title\s*{[^}]*font-size:\s*var\(--ovl-template-artwork-title-size\);/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__artist\s*{[^}]*font-size:\s*var\(--ovl-template-artwork-artist-size\);/s,
    );
  });

  it('uses neutral vinyl and dark ink for predominantly white albums', () => {
    expect(artworkStyles).toContain("data-artwork-copy-tone='dark'");
    expect(artworkStyles).toContain('var(--ovl-color-artwork-label)');
    expect(artworkStyles).toMatch(
      /\[data-artwork-copy-tone='dark'\][^{]*\.artwork-overlay__copy\s*{[^}]*var\(--ovl-color-paper\)/s,
    );
    expect(artworkStyles).toMatch(
      /\[data-artwork-copy-tone='dark'\][^{]*\.artwork-overlay__title\s*{[^}]*color:\s*var\(--ovl-color-ink\);/s,
    );
  });

  it('loads GSAP before the runtime and leaves the vinyl playhead to JavaScript', () => {
    expect(html).toContain('/overlay/vendor/gsap.min.js');
    expect(html.indexOf('/overlay/vendor/gsap.min.js')).toBeLessThan(
      html.indexOf('/overlay/now-playing/now-playing.mjs'),
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-rotor\s*{[^}]*will-change:\s*transform;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-shadow\s*{[^}]*background:\s*var\(--ovl-template-artwork-shadow-ink\);[^}]*mask-image:\s*var\(--ovl-template-artwork-record-shadow-mask\);/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-shadow\s*{[^}]*mix-blend-mode:\s*soft-light;[^}]*opacity:\s*0\.58;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-highlight\s*{[^}]*background:\s*var\(--ovl-template-artwork-highlight-ink\);[^}]*mask-image:\s*var\(--ovl-template-artwork-record-highlight-mask\);/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-highlight\s*{[^}]*mix-blend-mode:\s*soft-light;[^}]*opacity:\s*0\.5;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-dye\s*{[^}]*filter:\s*saturate\(var\(--ovl-template-artwork-dye-saturation\)\);/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-grooves\s*{[^}]*background:\s*radial-gradient\(/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__platter-bloom\s*{[^}]*z-index:\s*0;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__record-label\s*{[^}]*z-index:\s*2;/s,
    );
    expect(artworkStyles).not.toContain('animation: ovl-vinyl-spin');
    expect(artworkStyles).not.toContain('@keyframes ovl-vinyl-spin');
    expect(artworkStyles).not.toMatch(
      /\.artwork-overlay__tonearm-assembly\s*{[^}]*transition:/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__exchange-record\s*{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__exchange-record\[hidden\]\s*{[^}]*display:\s*none;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__incoming-sleeve\s*{[^}]*position:\s*absolute;[^}]*z-index:\s*2;/s,
    );
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__incoming-sleeve\[hidden\]\s*{[^}]*display:\s*none;/s,
    );
  });

  it('updates player progress on the compositor instead of layout width', () => {
    expect(artworkStyles).toMatch(
      /\.artwork-overlay__scrubber-fill\s*{[^}]*transform:\s*scaleX\(var\(--ovl-artwork-progress-scale\)\);/s,
    );
    expect(artworkStyles).toContain('transition: transform');
    expect(artworkStyles).not.toContain('transition: width');
  });

  it('keeps current and next song text in the information region', () => {
    const informationStart = html.indexOf(
      'class="now-playing-overlay__information"',
    );
    const information = html.slice(informationStart);

    expect(informationStart).toBeGreaterThan(-1);
    expect(information).toContain('id="now-playing-title"');
    expect(information).toContain('id="now-playing-artist"');
    expect(information).toContain('id="now-playing-next"');
  });
});

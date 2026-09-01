import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicMarkup = readFileSync(
  fileURLToPath(new URL('./index.html', import.meta.url)),
  'utf8',
);
const publicStyles = readFileSync(
  fileURLToPath(new URL('./artwork.css', import.meta.url)),
  'utf8',
);
const workbenchSource = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/components/output/ObsTemplateMockup.vue',
      import.meta.url,
    ),
  ),
  'utf8',
);

const publicParts = [
  'tonearm-pivot-edge',
  'tonearm-pivot',
  'tonearm-pivot-highlight',
  'tonearm-pivot-core',
  'tonearm-pivot-pin',
  'tonearm-counterweight-edge',
  'tonearm-counterweight',
  'tonearm-counterweight-highlight',
  'tonearm-counterweight-cap',
  'tonearm-rail-edge',
  'tonearm-rail',
  'tonearm-rail-highlight',
  'tonearm-head-edge',
  'tonearm-head-body',
  'tonearm-head-highlight',
  'tonearm-head-screw',
  'stylus-cantilever',
  'stylus-tip',
  'tonearm-rest-post',
  'tonearm-rest-base',
  'tonearm-rest-cradle',
];

describe('vinyl hardware material', () => {
  it('layers the public SVG into readable mechanical parts', () => {
    for (const part of publicParts) {
      expect(publicMarkup).toContain(`artwork-overlay__${part}`);
      expect(publicStyles).toContain(`.artwork-overlay__${part}`);
    }

    expect(publicMarkup).toContain('d="M66 28 C69 78 42 134 11.5 179"');
    expect(publicMarkup).toMatch(
      /class="[^"]*artwork-overlay__stylus-cantilever[^"]*"\s+d="M5 9v10"/,
    );
    expect(publicMarkup).toMatch(
      /class="artwork-overlay__stylus-tip"\s+d="M5 19v4"/,
    );
    expect(publicMarkup).not.toContain('<defs>');
  });

  it('mirrors every public hardware layer in the Workbench SVG', () => {
    for (const part of publicParts) {
      expect(workbenchSource).toContain(`obs-template-mockup__vinyl-${part}`);
    }

    expect(workbenchSource).toContain('d="M66 28 C69 78 42 134 11.5 179"');
    expect(workbenchSource).toMatch(
      /class="[^"]*obs-template-mockup__vinyl-stylus-cantilever[^"]*"/,
    );
    expect(workbenchSource).toContain('d="M5 9v10"');
    expect(workbenchSource).toContain(
      'class="obs-template-mockup__vinyl-stylus-tip"',
    );
    expect(workbenchSource).toContain('d="M5 19v4"');
    expect(workbenchSource).not.toContain('<defs>');
  });

  it('gives the vinyl deck light a bezel, recess, halo and fixed circular core', () => {
    expect(publicStyles).toMatch(
      /\.artwork-overlay__deck-light\s*{[^}]*background:\s*radial-gradient\([^}]*box-shadow:\s*inset/s,
    );
    expect(publicStyles).toMatch(
      /\.artwork-overlay__deck-light::before\s*{[^}]*inline-size:\s*125%;[^}]*block-size:\s*125%;[^}]*filter:\s*blur/s,
    );
    expect(publicStyles).toMatch(
      /\.artwork-overlay__deck-light::after\s*{[^}]*inline-size:\s*38%;[^}]*block-size:\s*38%;/s,
    );

    expect(workbenchSource).toMatch(
      /\.obs-template-mockup__vinyl-deck-light\s*{[^}]*background:\s*radial-gradient\([^}]*box-shadow:\s*inset/s,
    );
    expect(workbenchSource).toMatch(
      /\.obs-template-mockup__vinyl-deck-light::before\s*{[^}]*width:\s*125%;[^}]*height:\s*125%;[^}]*filter:\s*blur/s,
    );
    expect(workbenchSource).toMatch(
      /\.obs-template-mockup__vinyl-deck-light::after\s*{[^}]*width:\s*38%;[^}]*height:\s*38%;/s,
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const progressSource = read('./UiProgress.vue');
const checkboxSource = read('./UiCheckbox.vue');
const demoModalSource = read('../demo/DemoModalAppearance.vue');
const overlayLyricsSource = read('../../../overlay/lyrics/lyrics.css');

describe('shared feedback Token v2 adoption', () => {
  it('uses the approved progress geometry, activity role, and motion contract', () => {
    expect(progressSource).toContain('border-radius: var(--ui-radius-xs);');
    expect(progressSource).not.toContain('var(--ui-radius-pill)');
    expect(progressSource).toContain('background: var(--ui-color-info);');
    expect(progressSource).not.toContain('accent-color:');
    expect(progressSource).toContain('v-if="valueText && !indeterminate"');
    expect(progressSource).toContain('@keyframes ui-progress-indeterminate');
    expect(progressSource).toContain(
      ":global(:root[data-ui-motion='reduced'])",
    );
    expect(progressSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(progressSource).not.toContain('aria-busy');
  });

  it('keeps one native checkbox behind the approved project-owned indicator', () => {
    expect(checkboxSource).toContain(
      "import { Check, Minus } from '../../icons/index.js';",
    );
    expect(checkboxSource).toContain('class="ui-checkbox__indicator"');
    expect(checkboxSource).toContain('class="ui-checkbox ui-checkbox__native"');
    expect(checkboxSource).toContain('inset: 0;');
    expect(checkboxSource).toContain('opacity: 0;');
    expect(checkboxSource).toContain('pointer-events: none;');
    expect(checkboxSource).toContain('border-radius: var(--ui-radius-sm);');
    expect(checkboxSource).toContain('var(--ui-control-height)');
    expect(checkboxSource).toMatch(
      /\.ui-checkbox__native:checked\s*\+\s*\.ui-checkbox__indicator/u,
    );
    expect(checkboxSource).toMatch(
      /\.ui-checkbox__native:focus-visible\s*\+\s*\.ui-checkbox__indicator/u,
    );
    expect(checkboxSource).not.toContain('accent-color:');
  });

  it('removes the stale demo alias and maps Overlay artwork to its own radius system', () => {
    expect(demoModalSource).not.toMatch(/^\s*--ui-radius:/mu);
    expect(overlayLyricsSource).toMatch(
      /\.lyrics-overlay__live-stage-card\s*\{[\s\S]*?border-radius:\s*var\(--ovl-primitive-radius-md\);/u,
    );
    expect(overlayLyricsSource).not.toContain('border-radius: 0.45rem;');
  });
});

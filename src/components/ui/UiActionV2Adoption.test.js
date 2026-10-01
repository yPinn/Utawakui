import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_ADOPTED_SECTION_KEYS } from '../../constants/uiDemoSections.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const buttonSource = read('./UiButton.vue');
const iconButtonSource = read('./UiIconButton.vue');
const textButtonSource = read('./UiTextButton.vue');
const activeTokensSource = read('../../styles/tokens.css');
const v2TokensSource = read('../../styles/tokens-v2.css');

function compileScopedStyle(source, filename) {
  const descriptor = parse(source, { filename }).descriptor;
  return compileStyle({
    id: `data-v-${filename}`,
    filename,
    source: descriptor.styles[0].content,
    scoped: true,
  }).code;
}

function vueSources(directoryUrl) {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directoryUrl,
    );
    if (entry.isDirectory()) return vueSources(entryUrl);
    if (!entry.name.endsWith('.vue')) return [];
    return [[entryUrl, readFileSync(entryUrl, 'utf8')]];
  });
}

describe('Token v2 shared primitive adoption', () => {
  it('records review and production adoption as separate truths', () => {
    expect(UI_DEMO_ADOPTED_SECTION_KEYS).toEqual([
      'scrollbar',
      'separator',
      'stack',
      'surface',
      'buttons',
      'icon-buttons',
      'text-button',
      'segmented-control',
      'popover',
    ]);
  });

  it('adopts the reviewed Button hierarchy and complete state contract', () => {
    expect(buttonSource).toContain(
      "['ghost', 'secondary', 'accent'].includes(value)",
    );
    expect(buttonSource).toContain('class="ui-btn__label"');
    expect(buttonSource).toContain('text-overflow: ellipsis;');
    expect(buttonSource).toContain('user-select: none;');
    expect(buttonSource).toContain('.ui-btn--secondary');
    expect(buttonSource).toContain('.ui-btn--secondary:not(:disabled):active');
    expect(buttonSource).toContain('.ui-btn--accent:not(:disabled):active');
    expect(buttonSource).toMatch(
      /\.ui-btn--ghost:not\(:disabled\)(?::not\(\[aria-disabled='true'\]\))?:active/u,
    );
  });

  it('adopts complete Accent and Overlay Icon Button feedback', () => {
    expect(iconButtonSource).toContain(
      '.ui-icon-btn--accent:not(:disabled):active',
    );
    expect(iconButtonSource).toContain(
      '.ui-icon-btn--overlay:not(:disabled):hover',
    );
    expect(iconButtonSource).toContain(
      '.ui-icon-btn--overlay:not(:disabled):active',
    );
  });

  it('adopts Text Button disabled and selection affordances without taking caller typography', () => {
    expect(textButtonSource).toContain('-webkit-user-select: none;');
    expect(textButtonSource).toContain('user-select: none;');
    expect(textButtonSource).toContain('text-underline-offset: 0.18em;');
    expect(textButtonSource).toContain('.ui-text-btn:disabled');
    expect(textButtonSource).not.toContain('font-weight: inherit;');
  });

  it('keeps v2 state rules on the action component instead of the root element', () => {
    const compiledStyles = [
      ['UiButton', buttonSource, '.ui-btn'],
      ['UiIconButton', iconButtonSource, '.ui-icon-btn'],
      ['UiTextButton', textButtonSource, '.ui-text-btn'],
    ];

    for (const [filename, source, componentSelector] of compiledStyles) {
      const css = compileScopedStyle(source, filename);
      expect(css).toContain(`:root[data-ui-system='v2'] ${componentSelector}`);
      expect(css).not.toMatch(
        /:root\[data-ui-system=['"]v2['"]\]\s*\{[^}]*(?:background|opacity|box-sizing|user-select)\s*:/su,
      );
    }
  });

  it('defines every new interaction token in active and v2 scopes', () => {
    for (const token of [
      '--ui-color-accent-active',
      '--ui-color-overlay-scrim-hover',
      '--ui-color-overlay-scrim-active',
    ]) {
      expect(activeTokensSource, `${token} active`).toContain(`${token}:`);
      expect(v2TokensSource, `${token} v2`).toContain(`${token}:`);
    }
  });

  it('uses formal action primitives throughout F8 specimens', () => {
    const demoDirectory = new URL('../demo/', import.meta.url);
    for (const filename of [
      'DemoCandidateButton.vue',
      'DemoCandidateIconButton.vue',
      'DemoCandidateTextButton.vue',
    ]) {
      expect(existsSync(new URL(`../demo/${filename}`, import.meta.url))).toBe(
        false,
      );
    }

    for (const [file, source] of vueSources(demoDirectory)) {
      expect(source, file.pathname).not.toMatch(
        /(?:import|<)\s*DemoCandidate(?:Icon|Text)?Button/u,
      );
    }
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(
  new URL('../prototypes/ui-component-lab/src/main.js', import.meta.url),
  'utf8',
);
const app = readFileSync(
  new URL('../prototypes/ui-component-lab/src/App.vue', import.meta.url),
  'utf8',
);
const config = readFileSync(
  new URL('../prototypes/ui-component-lab/vite.config.js', import.meta.url),
  'utf8',
);
const productionMain = readFileSync(
  new URL('../src/main.js', import.meta.url),
  'utf8',
);

describe('isolated shared UI component lab', () => {
  it('loads candidate tokens and real shared components outside production entries', () => {
    expect(main).toContain('styles/tokens-v2.css');
    expect(main).not.toContain('styles/tokens.css');
    expect(productionMain).not.toContain('tokens-v2.css');
    expect(config).toContain('root: __dirname');

    for (const component of [
      'UiButton',
      'UiCheckbox',
      'UiField',
      'UiProgress',
      'UiRange',
      'UiSearchBox',
      'UiSelect',
      'UiTabs',
      'UiTextarea',
      'UiTextField',
    ]) {
      expect(app).toContain(`components/ui/${component}.vue`);
    }
  });

  it('exercises theme, density, motion, validation, loading, and disabled states', () => {
    for (const value of [
      'dark',
      'light',
      'standard',
      'compact',
      'full',
      'reduced',
      'invalid',
      'loading',
      'disabled',
    ]) {
      expect(app).toContain(value);
    }
  });
});

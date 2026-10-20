import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const itemSource = readFileSync(
  new URL('./SettingsDocumentItem.vue', import.meta.url),
  'utf8',
);
const gateSource = readFileSync(
  new URL('./SettingsFeatureGateRow.vue', import.meta.url),
  'utf8',
);
const settingsComponentSources = readdirSync(new URL('.', import.meta.url))
  .filter((name) => name.endsWith('.vue'))
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, import.meta.url), 'utf8'),
  }));

describe('settings document presentation', () => {
  it('uses shared tokens for spacing and color throughout settings blocks and their dialogs', () => {
    const violations = [];
    for (const { name, source } of settingsComponentSources) {
      const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gu)]
        .map((match) => match[1])
        .join('\n');
      for (const [, property, value] of styles.matchAll(
        /([\w-]+)\s*:\s*([^;{}]+);/gu,
      )) {
        if (
          /^(?:(?:padding|margin|scroll-margin)(?:-[\w-]+)?|(?:row-|column-)?gap)$/u.test(
            property,
          ) &&
          /(?<![\w.])(?:[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)(?:px|rem|em|ch|vh|vw)\b/u.test(
            value,
          )
        )
          violations.push(`${name}: ${property}: ${value.trim()}`);
        if (/#(?:[a-f\d]{3,8})\b|\b(?:rgb|hsl)a?\(/iu.test(value))
          violations.push(`${name}: ${property}: ${value.trim()}`);
        if (
          /^(?:font-size|font-weight|line-height)$/u.test(property) &&
          !value.includes('var(') &&
          value.trim() !== 'inherit'
        )
          violations.push(`${name}: ${property}: ${value.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });
  it('keeps ordinary settings flat on the Folder paper', () => {
    expect(itemSource).toMatch(
      /\.settings-document-item\s*\{[^}]*grid-template-columns:/su,
    );
    expect(itemSource).not.toMatch(
      /\.settings-document-item\s*\{[^}]*background:/su,
    );
    expect(itemSource).not.toMatch(
      /\.settings-document-item\s*\{[^}]*border-radius:/su,
    );
  });

  it('lets functional sections own surfaces instead of drawing panels for individual rows', () => {
    const section = readFileSync(
      new URL('./SettingsSection.vue', import.meta.url),
      'utf8',
    );
    expect(section).toContain('background: var(--ui-color-canvas)');
    expect(section).toContain('background: var(--ui-color-surface-raised)');
    expect(itemSource).not.toContain('settings-document-item--capability');
    expect(itemSource).toContain("['default', 'nested']");
  });

  it('uses real feature headers and one level of child settings', () => {
    expect(gateSource).toContain('<article');
    expect(gateSource).toContain('<h3');
    expect(gateSource).not.toContain('<SettingsDocumentItem');
    expect(itemSource).toContain("props.variant === 'nested' ? 'h4' : 'h3'");
  });

  it('keeps feature and tool grouping transparent within the chapter content', () => {
    const tools = readFileSync(
      new URL('./SettingsDependencyList.vue', import.meta.url),
      'utf8',
    );
    expect(gateSource).not.toMatch(/background:/u);
    expect(tools).not.toMatch(/background:/u);
    expect(gateSource).toContain('gap: var(--ui-space-3)');
    expect(itemSource).toMatch(
      /padding-inline-start:\s*var\(\s*--settings-copy-inset/u,
    );
  });

  it('does not leave the retired tooltip prop on document-item consumers', () => {
    for (const { name, source } of settingsComponentSources) {
      expect(source, name).not.toMatch(
        /<SettingsDocumentItem\b(?:(?!>).)*\s:?tooltip=/su,
      );
    }
  });
});

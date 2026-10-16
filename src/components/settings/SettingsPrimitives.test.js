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
  it('keeps ordinary settings flat on the Folder paper', () => {
    expect(itemSource).toMatch(
      /\.settings-document-item\s*\{[^}]*grid-template-columns:[^}]*border-block-end:/su,
    );
    expect(itemSource).not.toMatch(
      /\.settings-document-item\s*\{[^}]*background:/su,
    );
    expect(itemSource).not.toMatch(
      /\.settings-document-item\s*\{[^}]*border-radius:/su,
    );
  });

  it('reserves a raised surface only for capability workflows', () => {
    expect(itemSource).toMatch(
      /\.settings-document-item--capability\s*\{[^}]*border-radius:\s*var\(--ui-radius-md\);[^}]*background:\s*var\(--ui-color-surface-raised\);/su,
    );
    expect(itemSource).toContain("['default', 'capability', 'nested']");
  });

  it('keeps capability and nested workflow headings below their Folder section', () => {
    expect(gateSource).toMatch(
      /<SettingsDocumentItem(?=[^>]*variant="capability")(?=[^>]*title-tag="h4")[^>]*>/su,
    );
    expect(itemSource).toContain("props.variant === 'nested' ? 'h5' : 'h3'");
  });

  it('does not leave the retired tooltip prop on document-item consumers', () => {
    for (const { name, source } of settingsComponentSources) {
      expect(source, name).not.toMatch(
        /<SettingsDocumentItem\b(?:(?!>).)*\s:?tooltip=/su,
      );
    }
  });
});

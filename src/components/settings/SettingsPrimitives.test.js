import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const blockSource = readFileSync(
  new URL('./SettingsBlock.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./SettingsActionRow.vue', import.meta.url),
  'utf8',
);

describe('settings presentation primitives', () => {
  it('keeps section grouping flat instead of wrapping rows in another card', () => {
    expect(blockSource).toContain('border-block-start:');
    expect(blockSource).not.toContain(
      'border: var(--ui-border-width) solid var(--ui-color-border);',
    );
    expect(blockSource).not.toContain('background: var(--ui-color-surface);');
  });

  it('uses dividers for ordinary rows and tonal emphasis only for feature rows', () => {
    expect(rowSource).toContain('border-block-end:');
    expect(rowSource).toContain(
      '--settings-action-row-background: transparent;',
    );
    expect(rowSource).toContain(
      '--settings-action-row-feature-background: var(--ui-color-surface-raised);',
    );
    expect(rowSource).not.toContain(
      'border: var(--ui-border-width) solid var(--settings-action-row-border-color);',
    );
  });
});

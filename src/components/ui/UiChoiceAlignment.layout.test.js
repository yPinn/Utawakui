import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const radio = read('./UiRadioGroup.vue');
const toggle = read('./UiSwitch.vue');

describe('first-line choice geometry contract', () => {
  it('derives shared padding from existing control and Label tiers', () => {
    for (const source of [radio, toggle]) {
      expect(source).toContain(
        'max(0rem, calc((var(--ui-control-height) - 1lh) / 2))',
      );
      expect(source).not.toMatch(/translateY\(|optical-offset/u);
    }
  });

  it('limits the first-line recipe to Radio list and leaves tiles independent', () => {
    expect(radio).toMatch(
      /\.ui-radio-group--list \.ui-radio-group__option\s*\{[^}]*align-items:\s*start;[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*line-height:\s*var\(--ui-type-label-line-height\);/u,
    );
    expect(radio).toContain('(1lh - var(--ui-radio-size)) / 2');
    expect(radio).toMatch(
      /\.ui-radio-group--tiles \.ui-radio-group__copy\s*\{[^}]*grid-column: 1 \/ -1;/u,
    );
  });

  it('anchors the Switch native input to the full main row, outside hint and error copy', () => {
    expect(toggle).toMatch(
      /\.ui-switch-field :deep\(\.ui-field__main\)\s*\{[^}]*position: relative;[^}]*min-height: var\(--ui-control-height\);[^}]*align-items: start;/u,
    );
    const control = toggle.match(/\.ui-switch\s*\{([^}]+)\}/u)?.[1];
    expect(control).not.toContain('position: relative;');
    expect(toggle).toContain(
      '(var(--ui-control-height) - var(--ui-switch-track-height)) / 2',
    );
  });
});

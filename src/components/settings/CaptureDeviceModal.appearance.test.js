import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./CaptureDeviceModal.vue', import.meta.url),
  'utf8',
);

describe('CaptureDeviceModal appearance contract', () => {
  it('uses shared modal bounds and one workspace scroll owner with focus-safe padding', () => {
    expect(source).toContain('body-mode="workspace"');
    expect(source).toContain('max-block-size="small"');
    expect(source).toContain('<UiScrollLayout');
    expect(source).not.toContain('420px');
    expect(source).toContain('<UiRadioGroup');
    expect(source).toMatch(
      /\.capture-device-modal\s*\{[\s\S]*?--capture-device-modal-focus-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\);/u,
    );
    expect(source).toContain('--ui-scroll-layout-padding-inline-start: var(');
    expect(source).toContain('--ui-scroll-layout-padding-inline-end: var(');
    expect(source).not.toContain('.capture-device-modal__row:focus-visible');
  });
});

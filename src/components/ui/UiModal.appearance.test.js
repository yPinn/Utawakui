import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./UiModal.vue', import.meta.url),
  'utf8',
);

describe('UiModal appearance contract', () => {
  it('maps every public size to the reviewed inline and block-size tokens', () => {
    expect(modalSource).toMatch(
      /\.ui-modal\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-small\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-small\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--notice\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-medium\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-medium\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--wide\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-large\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-large\);/u,
    );
    expect(modalSource).toContain(
      'calc(100dvw - (var(--ui-modal-viewport-inset) * 2))',
    );
    expect(modalSource).toContain(
      'calc(100dvh - (var(--ui-modal-viewport-inset) * 2))',
    );
  });

  it('uses the reviewed raised shell, nested field aliases, and semantic zone spacing', () => {
    expect(modalSource).toContain(
      '--ui-field-bg: var(--ui-field-bg-on-raised);',
    );
    expect(modalSource).toContain(
      '--ui-field-bg-hover: var(--ui-field-bg-hover-on-raised);',
    );
    expect(modalSource).toContain(
      '--ui-field-bg-readonly: var(--ui-field-bg-readonly-on-raised);',
    );
    expect(modalSource).toContain(
      'background: var(--ui-color-surface-raised);',
    );
    expect(modalSource).toContain('box-shadow: var(--ui-shadow-dialog);');
    expect(modalSource).toContain('gap: var(--ui-modal-section-gap);');
    expect(modalSource).toContain(
      'padding: var(--ui-modal-footer-inset-block) var(--ui-modal-content-inset);',
    );
    expect(modalSource).not.toContain('box-shadow: var(--ui-shadow-overlay);');
  });

  it('reserves a complete focus ring inside the body scrollport without changing section rhythm', () => {
    expect(modalSource).toMatch(
      /\.ui-modal\s*\{[\s\S]*?--ui-modal-focus-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__body :deep\(\.ui-modal__body-viewport\)\s*\{[\s\S]*?padding:\s*var\(--ui-modal-focus-safe-inset\)\s+var\(--ui-modal-content-inset\)\s+var\(--ui-modal-content-inset\);[\s\S]*?scroll-padding-block:\s*var\(--ui-modal-focus-safe-inset\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__header\s*\{[\s\S]*?padding:[\s\S]*?max\(\s*0rem,\s*calc\(\s*var\(--ui-modal-section-gap\)\s*-\s*var\(--ui-modal-focus-safe-inset\)\s*\)\s*\);/u,
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./DemoCandidateModal.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

describe('DemoCandidateModal appearance contract', () => {
  it('keeps a purely geometric size scale independent from content purpose', () => {
    const publicProps =
      source.match(/const props = defineProps\(\{([\s\S]*?)\n\}\);/)?.[1] ?? '';

    expect(source).not.toContain('PURPOSE_DEFAULT_SIZE');
    expect(source).not.toContain('data-modal-purpose');
    expect(publicProps).not.toMatch(
      /purpose|case|contentType|scroll|background|surface/,
    );
    expect(source).toContain("['small', 'medium', 'large']");
    expect(source).toContain("default: 'medium'");
    expect(tokenSource).toContain('--ui-modal-inline-size-small: 24rem');
    expect(tokenSource).toContain('--ui-modal-inline-size-medium: 32rem');
    expect(tokenSource).toContain('--ui-modal-inline-size-large: 48rem');
    expect(tokenSource).toContain('--ui-modal-max-block-size-small: 35rem');
    expect(tokenSource).toContain('--ui-modal-max-block-size-medium: 45rem');
    expect(tokenSource).toContain('--ui-modal-max-block-size-large: 50rem');
    expect(tokenSource).toContain(
      '--ui-modal-width-default: var(--ui-modal-inline-size-small)',
    );
    expect(tokenSource).toContain(
      '--ui-modal-width-notice: var(--ui-modal-inline-size-medium)',
    );
    expect(tokenSource).toContain(
      '--ui-modal-width-wide: var(--ui-modal-inline-size-large)',
    );
    expect(source).toContain(
      '--demo-candidate-modal-inline-size: var(--ui-modal-inline-size-small)',
    );
    expect(source).toContain(
      '--demo-candidate-modal-inline-size: var(--ui-modal-inline-size-medium)',
    );
    expect(source).toContain(
      '--demo-candidate-modal-inline-size: var(--ui-modal-inline-size-large)',
    );
    expect(source).not.toMatch(
      /--demo-candidate-modal-(?:inline-size|max-block-size):\s*(?:24|32|35|45|48|50)rem/,
    );
    expect(source).not.toContain('--ui-modal-width-default');
    expect(source).not.toContain('--ui-modal-width-notice');
    expect(source).not.toContain('--ui-modal-width-wide');
    expect(source).toContain(
      'calc(100dvw - (var(--ui-modal-viewport-inset) * 2))',
    );
    expect(source).toContain(
      'calc(100dvh - (var(--ui-modal-viewport-inset) * 2))',
    );
    expect(source).toContain('min-inline-size: 0');
    const modalRule =
      source.match(/\.demo-candidate-modal\s*\{[^}]*\}/s)?.[0] ?? '';
    expect(modalRule).not.toContain('min-block-size');
  });

  it('uses token-aligned Standard and Compact spacing without corrective margins', () => {
    expect(tokenSource).toContain(
      '--ui-modal-viewport-inset: var(--ui-space-5)',
    );
    expect(tokenSource).toContain(
      '--ui-modal-content-inset: var(--ui-space-5)',
    );
    expect(tokenSource).toContain('--ui-modal-section-gap: var(--ui-space-4)');
    expect(tokenSource).toContain(
      '--ui-modal-footer-inset-block: var(--ui-space-3)',
    );
    const compactTokens =
      tokenSource.match(
        /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{[\s\S]*?\n\}/,
      )?.[0] ?? '';
    expect(compactTokens).toContain(
      '--ui-modal-viewport-inset: var(--ui-space-4)',
    );
    expect(compactTokens).toContain(
      '--ui-modal-content-inset: var(--ui-space-4)',
    );
    expect(compactTokens).toContain(
      '--ui-modal-section-gap: var(--ui-space-3)',
    );
    expect(compactTokens).toContain(
      '--ui-modal-footer-inset-block: var(--ui-space-2)',
    );
    expect(source).not.toContain("data-ui-density='compact'");
    expect(source).toMatch(
      /\.demo-candidate-modal__header\s*\{[^}]*gap:\s*var\(--ui-modal-section-gap\);[^}]*padding:\s*var\(--ui-modal-content-inset\)\s+var\(--ui-modal-content-inset\)\s+var\(--ui-modal-section-gap\);/s,
    );
    expect(source).toMatch(
      /\.demo-candidate-modal__footer\s*\{[^}]*gap:\s*var\(--ui-space-2\);[^}]*padding:\s*var\(--ui-modal-footer-inset-block\)\s+var\(--ui-modal-content-inset\);/s,
    );
    expect(source).not.toContain('margin-block-start: calc(');
  });

  it('uses the design-system modal headline instead of a section-title treatment', () => {
    expect(source).toMatch(
      /\.demo-candidate-modal__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-xl\);[^}]*font-weight:\s*var\(--ui-font-weight-bold\);[^}]*line-height:\s*var\(--ui-line-height-heading\);/s,
    );
  });

  it('keeps header and footer persistent while only the body scrolls', () => {
    expect(source).toContain('grid-template-rows: auto minmax(0, 1fr) auto');
    expect(source).toMatch(
      /\.demo-candidate-modal__body\s*\{[^}]*min-block-size:\s*0;/s,
    );
    expect(source).toContain('<UiScrollRegion');
    expect(source).toContain(
      'viewport-class="demo-candidate-modal__body-viewport"',
    );
    expect(source).toContain('<header class="demo-candidate-modal__header">');
    expect(source).toContain('<footer');
    expect(source).toContain('v-if="slots.footer"');
    expect(source).toMatch(
      /\.demo-candidate-modal__title\s*\{[^}]*user-select:\s*none;/s,
    );
    expect(source).not.toMatch(
      /\.demo-candidate-modal__body\s*\{[^}]*user-select:\s*none;/s,
    );
    expect(source).toMatch(
      /\.demo-candidate-modal__title:focus\s*\{[^}]*outline:\s*none;/s,
    );
    expect(source).toContain('container-type: inline-size');
    expect(source).toContain('@container (max-width: 22.5rem)');
    expect(source).toContain('ref="body"');
  });

  it('uses the native modal layer and the adopted formal close control', () => {
    expect(source).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(source).toContain('<dialog');
    expect(source).toContain('dialog.showModal()');
    expect(source).toContain('@cancel="onCancel"');
    expect(source).toContain('@keydown="onKeydown"');
    expect(source).toContain('::backdrop');
    expect(source).toContain('border-radius: var(--ui-radius-lg)');
    expect(source).toContain('box-shadow: var(--ui-shadow-dialog)');
    expect(source).not.toContain("addEventListener('keydown'");
    expect(source).not.toContain('@click.self');
  });

  it('keeps one raised shell while nested fields use the reviewed on-raised surface aliases', () => {
    const modalRule =
      source.match(/\.demo-candidate-modal\s*\{[^}]*\}/s)?.[0] ?? '';
    const headerRule =
      source.match(/\.demo-candidate-modal__header\s*\{[^}]*\}/s)?.[0] ?? '';
    const bodyRule =
      source.match(/\.demo-candidate-modal__body\s*\{[^}]*\}/s)?.[0] ?? '';
    const footerRule =
      source.match(/\.demo-candidate-modal__footer\s*\{[^}]*\}/s)?.[0] ?? '';
    const backdropRule =
      source.match(/\.demo-candidate-modal::backdrop\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(modalRule).toContain('background: var(--ui-color-surface-raised)');
    expect(modalRule).toContain('--ui-field-bg: var(--ui-field-bg-on-raised)');
    expect(modalRule).toContain(
      '--ui-field-bg-hover: var(--ui-field-bg-hover-on-raised)',
    );
    expect(modalRule).toContain(
      '--ui-field-bg-readonly: var(--ui-field-bg-readonly-on-raised)',
    );
    expect(headerRule).not.toContain('background');
    expect(bodyRule).not.toContain('background');
    expect(footerRule).not.toContain('background');
    expect(backdropRule).toContain('background: var(--ui-color-overlay-scrim)');
  });
});

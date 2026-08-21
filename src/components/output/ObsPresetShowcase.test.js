import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsPresetShowcase.vue', import.meta.url)),
  'utf8',
);
const tokenSource = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf8',
);

function compactWhitespace(source) {
  return source.replace(/\s+/g, ' ');
}

describe('ObsPresetShowcase layout contract', () => {
  it('keeps gallery sizing token-driven and responsive to its own column width', () => {
    const compactComponentSource = compactWhitespace(componentSource);

    expect(tokenSource).toContain('--ui-output-gallery-detail-width: clamp(');
    expect(tokenSource).toContain('--ui-output-gallery-detail-width-max');
    expect(tokenSource).toContain('--ui-output-gallery-preview-max-width');
    expect(tokenSource).toContain(
      '--ui-output-gallery-preview-max-width: 22.5rem',
    );
    expect(tokenSource).toContain('--ui-output-template-thumb-title-font-size');
    expect(tokenSource).toContain('--ui-output-setting-label-width-max');
    expect(componentSource).not.toContain('--ui-font-size-xs');
    expect(componentSource).toContain('container-type: inline-size');
    expect(compactComponentSource).toMatch(
      /minmax\(\s*var\(--ui-output-gallery-column-min\),\s*1fr\s*\)/,
    );
    expect(compactComponentSource).toContain(
      'var(--ui-output-gallery-detail-width)',
    );
    expect(compactComponentSource).not.toMatch(
      /minmax\(\s*var\(--ui-output-gallery-detail-width-min\),\s*var\(--ui-output-gallery-detail-width-max\)\s*\)/,
    );
    expect(componentSource).toContain(
      'inline-size: min(100%, var(--ui-output-gallery-preview-max-width))',
    );
    expect(componentSource).toContain(
      'var(--ui-output-setting-label-width-max)',
    );
    expect(componentSource).toContain('aspect-ratio: 16 / 9');
    expect(componentSource).toContain('@container (width < 48rem)');
  });
});

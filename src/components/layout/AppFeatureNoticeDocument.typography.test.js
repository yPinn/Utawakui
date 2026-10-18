import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const documentSource = readFileSync(
  new URL('./AppFeatureNoticeDocument.vue', import.meta.url),
  'utf8',
);
const tokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

function rule(selector) {
  const start = documentSource.indexOf(`${selector} {`);
  return documentSource.slice(start, documentSource.indexOf('}', start));
}

describe('Chinese feature notice document typography', () => {
  it('reuses the shared UI family for Chinese document text', () => {
    expect(tokens).not.toContain('--ui-font-family-document');
    expect(rule('.feature-notice')).not.toContain('font-family');
    for (const selector of [
      '.feature-notice__summary',
      '.feature-notice__copy',
    ]) {
      expect(rule(selector)).toContain(
        'font-family: var(--ui-font-family-base)',
      );
    }
    expect(rule('.feature-notice__section-title')).toContain(
      'font-family: var(--ui-font-family-base)',
    );
  });

  it('maps reading size, leading and paragraph rhythm to existing foundation roles', () => {
    const list = rule('.feature-notice__list');
    expect(list).toContain('font-size: var(--ui-type-body-size)');
    expect(list).toContain('font-weight: var(--ui-type-body-weight)');
    expect(list).toContain('line-height: var(--ui-type-body-line-height)');
    expect(list).toContain('gap: var(--ui-space-5)');
    expect(list).toContain('list-style-type: trad-chinese-informal');
    expect(list).toContain('padding-inline-start: var(--ui-space-6)');
    const heading = rule('.feature-notice__section-title');
    expect(heading).toContain('font-size: var(--ui-type-body-size)');
    expect(heading).toContain('font-weight: var(--ui-type-label-weight)');
    expect(heading).toContain('line-height: var(--ui-type-body-line-height)');
    expect(heading).toContain('margin: 0 0 var(--ui-space-2)');
    expect(documentSource).not.toMatch(/font-(?:size|weight):\s*\d/u);
  });
});

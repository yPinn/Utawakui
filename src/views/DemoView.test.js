import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./DemoView.vue', import.meta.url),
  'utf8',
);

describe('DemoView scroll layout', () => {
  it('grows naturally so AppInnerPage remains the only scroll boundary', () => {
    const rootStyle = source.match(/\.demo-view\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(source).toMatch(
      /\.demo-view\s*\{[^}]*min-height:\s*100%;[^}]*display:\s*flex;/s,
    );
    expect(rootStyle).not.toMatch(/\n\s*height:\s*100%;/);
  });
});

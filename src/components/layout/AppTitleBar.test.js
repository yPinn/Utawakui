import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./AppTitleBar.vue', import.meta.url),
  'utf8',
);

describe('AppTitleBar', () => {
  it('separates performer and theme actions with the shared control gap', () => {
    expect(source).toContain('gap: var(--ui-space-2)');
    expect(source).toContain('padding-right: var(--ui-space-2)');
  });
});

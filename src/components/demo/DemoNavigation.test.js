import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const navigationSource = readFileSync(
  new URL('./DemoNavigation.vue', import.meta.url),
  'utf8',
);

describe('DemoNavigation', () => {
  it('delegates the tabs section to the staged appearance review', () => {
    expect(navigationSource).toContain(
      "import DemoTabsAppearance from './DemoTabsAppearance.vue';",
    );
    expect(navigationSource).toContain(
      '<DemoTabsAppearance v-if="section.key === \'tabs\'" />',
    );
  });
});

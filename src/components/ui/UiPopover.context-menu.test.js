import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./UiPopover.vue', import.meta.url),
  'utf8',
);

describe('UiPopover related floating surfaces', () => {
  it('keeps a teleported context menu interactive without dismissing its parent popover', () => {
    expect(source).toContain('isRelatedFloatingSurface');
    expect(source).toContain("target?.closest?.('.ui-context-menu')");
    expect(source).toContain('isRelatedFloatingSurface(event.target)');
    expect(source).toContain(
      "event.key !== 'Escape' ||\n    isRelatedFloatingSurface(event.target)",
    );
    expect(source).toContain(
      "event.key !== 'Escape' ||\n    isRelatedFloatingSurface(event.target)",
    );
  });
});

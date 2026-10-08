import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

describe('Performer window geometry composition', () => {
  it('keeps persisted bounds main-owned and resolves their target display', () => {
    expect(mainSource).toContain(
      'getPersistedBounds: () => configState.getConfig().performerWindowBounds',
    );
    expect(mainSource).toMatch(
      /persistBounds:\s*\(bounds\)\s*=>\s*configState\.updateConfig\(\{\s*performerWindowBounds:\s*bounds\s*\}\)/u,
    );
    expect(mainSource).toContain('getDisplayWorkArea: (bounds) =>');
    expect(mainSource).toContain('screen.getDisplayMatching(bounds).workArea');
  });
});

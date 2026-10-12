import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./usePerformerSelfView.js', import.meta.url),
  'utf8',
);

describe('usePerformerSelfView toggle contract', () => {
  it('closes through a fixed no-payload bridge intent and updates the shared status', () => {
    expect(source).toContain("bridgeMethod('closePerformerView')()");
    expect(source).toContain(
      "reportPerformerError(\n      error,\n      'close'",
    );
    expect(source).toContain('async function toggle()');
    expect(source).toContain('return state.open ? close() : open()');
    expect(source).toMatch(
      /return \{[\s\S]*?open,[\s\S]*?close,[\s\S]*?toggle,/u,
    );
  });
});

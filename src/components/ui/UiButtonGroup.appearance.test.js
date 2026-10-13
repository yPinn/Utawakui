import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const groupSource = fs.readFileSync(
  new URL('./UiButtonGroup.vue', import.meta.url),
  'utf8',
);
const preparationSource = fs.readFileSync(
  new URL('../lyrics/LyricsPreparationBar.vue', import.meta.url),
  'utf8',
);
const liveSource = fs.readFileSync(
  new URL('../lyrics/LyricsLiveControls.vue', import.meta.url),
  'utf8',
);

describe('UiButtonGroup appearance ownership', () => {
  it('owns the outer boundary and adjacent button seams', () => {
    expect(groupSource).toMatch(
      /\.ui-button-group\s*\{[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-button-group-border\);[^}]*overflow:\s*hidden;/s,
    );
    expect(groupSource).toMatch(
      /\.ui-button-group :deep\(\.ui-btn\)\s*\{[^}]*border-radius:\s*0;/s,
    );
    expect(groupSource).toMatch(
      /\.ui-button-group :deep\(\.ui-btn \+ \.ui-btn\)\s*\{[^}]*border-inline-start:\s*var\(--ui-border-width\) solid\s+var\(--ui-button-group-border\);/s,
    );
  });

  it('keeps feature consumers on the public group contract', () => {
    for (const source of [preparationSource, liveSource]) {
      expect(source).toContain('<UiButtonGroup');
      expect(source).not.toContain(':deep(.ui-btn)');
    }
    expect(liveSource).toContain('radius="lg"');
    expect(liveSource).toContain('raised');
  });
});

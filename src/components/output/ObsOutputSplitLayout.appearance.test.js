import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const splitLayoutSource = readFileSync(
  new URL('./ObsOutputSplitLayout.vue', import.meta.url),
  'utf8',
);
const selectSource = readFileSync(
  new URL('../ui/UiSelect.vue', import.meta.url),
  'utf8',
);

describe('ObsOutputSplitLayout focus-safe inspector boundary', () => {
  it('reserves the outward focus ring and overlay scrollbar inside the side viewport', () => {
    expect(splitLayoutSource).toMatch(
      /--ui-output-side-focus-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\);/u,
    );
    expect(splitLayoutSource).toMatch(
      /--ui-output-side-scrollbar-visual-reserve:\s*calc\(\s*var\(--ui-scrollbar-lane-size\)\s*-\s*var\(--ui-scrollbar-thumb-inset\)\s*\);/u,
    );
    expect(splitLayoutSource).toMatch(
      /--ui-output-side-content-inset-end:\s*calc\(\s*max\(\s*var\(--ui-output-side-visual-inset-end\),\s*var\(--ui-output-side-scrollbar-visual-reserve\)\s*\)\s*\+\s*var\(--ui-output-side-focus-safe-inset\)\s*\);/u,
    );
    expect(splitLayoutSource).toMatch(
      /\.obs-output-split-layout__side-scroll\s*:deep\(\.obs-output-split-layout__side-viewport\)\s*\{[\s\S]*?padding-inline:\s*var\(--ui-output-side-content-inset-start\)\s+var\(--ui-output-side-content-inset-end\);[\s\S]*?padding-block-end:\s*var\(--ui-output-side-focus-safe-inset\);[\s\S]*?scroll-padding:\s*var\(--ui-output-side-focus-safe-inset\)\s+var\(--ui-output-side-content-inset-end\)\s+var\(--ui-output-side-focus-safe-inset\)\s+var\(--ui-output-side-content-inset-start\);/u,
    );
  });

  it('moves the visible side inset into the clipping boundary without changing shared focus presentation', () => {
    expect(splitLayoutSource).toMatch(
      /\.obs-output-split-layout__side\s*\{[\s\S]*?padding-inline:\s*0;/u,
    );
    expect(splitLayoutSource).toMatch(
      /\.obs-output-split-layout__side-header,\s*\.obs-output-split-layout__side-footer\s*\{[\s\S]*?padding-inline:\s*var\(--ui-output-side-content-inset-start\)\s+var\(--ui-output-side-content-inset-end\);/u,
    );
    expect(selectSource).toMatch(
      /\.ui-select:focus-visible\s*\{[\s\S]*?outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);[\s\S]*?outline-offset:\s*var\(--ui-focus-offset\);/u,
    );
    expect(splitLayoutSource).not.toContain(':deep(.ui-select:focus-visible)');
  });
});

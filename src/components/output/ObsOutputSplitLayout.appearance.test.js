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
  it('reflows against the bounded workspace content rather than the Folder exterior', () => {
    const workspace = readFileSync(
      new URL('./ObsOutputWorkspace.vue', import.meta.url),
      'utf8',
    );
    expect(workspace).toMatch(
      /\.obs-output-workspace\s*\{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*output-workspace;/su,
    );
    expect(splitLayoutSource).toContain('new ResizeObserver(measure)');
    expect(splitLayoutSource.replace(/\s+/gu, ' ')).toContain(
      'geometry.value.min + geometry.value.gap + geometry.value.main',
    );
    expect(splitLayoutSource).not.toContain('width < 44rem');
    expect(splitLayoutSource).not.toContain('@container app-folder-layout');
    expect(splitLayoutSource).not.toContain(
      'minmax(var(--ui-output-gallery-column-min), 1fr)',
    );
  });

  it('reserves the outward focus ring and overlay scrollbar inside the side viewport', () => {
    expect(splitLayoutSource).toMatch(
      /--ui-output-side-focus-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\);/u,
    );
    expect(splitLayoutSource).toMatch(
      /--ui-output-side-content-inset-end:[\s\S]*?var\(--ui-scrollbar-visual-reserve\)/u,
    );
    expect(splitLayoutSource).toMatch(
      /--ui-scroll-layout-padding-inline-end:\s*calc\(\s*var\(--ui-output-side-content-inset-end\)\s*-\s*var\(--ui-scroll-layout-reserve-inline-end\)\s*\);/u,
    );
    expect(splitLayoutSource).toMatch(
      /--ui-scroll-layout-padding-block-end:\s*var\(--ui-output-side-focus-safe-inset\);/u,
    );
    expect(splitLayoutSource).toContain('<UiScrollLayout');
    expect(splitLayoutSource).toContain(
      'content-class="obs-output-split-layout__side-content"',
    );
    expect(splitLayoutSource).not.toContain('--ui-scrollbar-lane-size');
    expect(splitLayoutSource).not.toContain('--ui-scrollbar-thumb-inset');
    const viewport = splitLayoutSource.match(
      /:deep\(\.obs-output-split-layout__side-viewport\)\s*\{([^}]+)\}/u,
    )?.[1];
    expect(viewport).toContain('scroll-padding:');
    expect(viewport).not.toMatch(/(?<!scroll-)padding(?:-inline|-block)?\s*:/u);
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

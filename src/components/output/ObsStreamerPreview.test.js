import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./ObsStreamerPreview.vue', import.meta.url)),
  'utf8',
);
const workbenchPreviewSource = readFileSync(
  fileURLToPath(new URL('./ObsOverlayPreview.vue', import.meta.url)),
  'utf8',
);
const placementImageSource = readFileSync(
  new URL(
    '../../composables/output/useOutputPerformerGuideImage.js',
    import.meta.url,
  ),
  'utf8',
);

describe('Workbench streamer preview', () => {
  it('imports the shared guide source as the local preview fallback', () => {
    expect(placementImageSource).toContain(
      "from '../../../overlay/assets/streamer-guide.png?inline'",
    );
    expect(workbenchPreviewSource).toContain('<ObsStreamerPreview');
    expect(workbenchPreviewSource).toContain(
      '@click="emit(\'update:lyricsPreviewMode\', nextPreviewMode)"',
    );
    expect(workbenchPreviewSource).toContain(':src="performerGuideImage"');
    expect(workbenchPreviewSource).toContain(
      "url.pathname = '/overlay/lyrics';",
    );
    expect(workbenchPreviewSource).not.toContain('/workbench/lyrics');
    expect(workbenchPreviewSource).toContain(
      "url.searchParams.set('workbench', '1');",
    );
    expect(workbenchPreviewSource).toContain('<ObsWidgetCapturePreview');
  });

  it('applies the preview geometry and clips the proportionate image to its frame', () => {
    expect(componentSource).toContain('performerGuideStyle(props.guide)');
    expect(componentSource).toMatch(
      /\.obs-streamer-preview__region\s*\{[^}]*overflow: hidden;/u,
    );
    expect(componentSource).toContain('object-fit: cover;');
    expect(componentSource).toContain('transform: translate(-50%, -50%);');
    expect(componentSource).toContain('pointer-events: none;');
    expect(componentSource).toContain('aria-hidden="true"');
    expect(componentSource).toContain(':src="src"');
    expect(componentSource).toContain('alt=""');
    expect(componentSource).toContain(':draggable="false"');
  });

  it('keeps the fallback guide on its explicit occupancy layer', () => {
    expect(componentSource).toContain(
      'z-index: var(--ui-output-preview-layer-guide);',
    );
    expect(workbenchPreviewSource).toContain(
      'z-index: var(--ui-output-preview-layer-output);',
    );
  });

  it('contains the built-in image and fits it inside curved mask edges', () => {
    expect(componentSource).toMatch(
      /\[data-built-in-shape\] \.obs-streamer-preview__image\s*\{[^}]*object-fit: contain;/u,
    );
    expect(componentSource).toMatch(
      /\[data-built-in-shape='ellipse'\] \.obs-streamer-preview__image\s*\{[^}]*scale: 0\.77;/u,
    );
  });
});

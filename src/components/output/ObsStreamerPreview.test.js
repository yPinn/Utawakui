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

describe('Workbench streamer preview', () => {
  it('keeps the renderer guide only as the no-runtime fallback', () => {
    expect(workbenchPreviewSource).toContain(
      "import streamerPreviewImage from '../../assets/workbench-streamer-guide.png'",
    );
    expect(workbenchPreviewSource).toContain('<ObsStreamerPreview');
    expect(workbenchPreviewSource).toContain('v-if="!hasRuntimeTemplate"');
    expect(workbenchPreviewSource).toContain(':src="streamerPreviewImage"');
    expect(workbenchPreviewSource).toContain(
      "url.pathname = '/overlay/lyrics';",
    );
    expect(workbenchPreviewSource).not.toContain('/workbench/lyrics');
    expect(workbenchPreviewSource).toContain(
      "url.searchParams.set('workbench', '1');",
    );
    expect(workbenchPreviewSource).toContain('<ObsWidgetCapturePreview');
  });

  it('occupies the middle and bottom center cells without cropping the image', () => {
    expect(componentSource).toContain(
      'inset: calc(100% / 3) calc(100% / 3) 0;',
    );
    expect(componentSource).toContain('object-fit: contain;');
    expect(componentSource).toContain('object-position: center bottom;');
    expect(componentSource).toContain('transform: scale(1.35);');
    expect(componentSource).toContain('transform-origin: center bottom;');
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
});

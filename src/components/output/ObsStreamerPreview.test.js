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
const outputServerSource = readFileSync(
  fileURLToPath(
    new URL('../../../electron/lib/outputServer.js', import.meta.url),
  ),
  'utf8',
);

describe('Workbench streamer preview', () => {
  it('stays in the renderer composition instead of the OBS delivery path', () => {
    expect(workbenchPreviewSource).toContain(
      "import streamerPreviewImage from '../../assets/output-preview/Reze.png'",
    );
    expect(workbenchPreviewSource).toContain(
      '<ObsStreamerPreview :src="streamerPreviewImage" />',
    );
    expect(workbenchPreviewSource).toContain('v-if="isLyrics"');
    expect(workbenchPreviewSource).toContain('<ObsWidgetCapturePreview');
    expect(outputServerSource).not.toContain('output-preview');
    expect(outputServerSource).not.toContain('Reze.png');
    expect(outputServerSource).not.toContain('ObsStreamerPreview');
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

  it('keeps the real output on an explicit layer above the occupancy guide', () => {
    expect(
      workbenchPreviewSource.indexOf('<ObsStreamerPreview'),
    ).toBeGreaterThan(workbenchPreviewSource.indexOf('<iframe'));
    expect(workbenchPreviewSource).toContain(
      '--ui-output-preview-layer-guide: 1;',
    );
    expect(workbenchPreviewSource).toContain(
      '--ui-output-preview-layer-output: 2;',
    );
    expect(workbenchPreviewSource).toContain(
      'z-index: var(--ui-output-preview-layer-output);',
    );
    expect(componentSource).toContain(
      'z-index: var(--ui-output-preview-layer-guide);',
    );
  });
});

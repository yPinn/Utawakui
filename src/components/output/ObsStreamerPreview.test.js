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
const outputHttpSource = readFileSync(
  fileURLToPath(
    new URL('../../../electron/lib/outputServer/http.js', import.meta.url),
  ),
  'utf8',
);
const workbenchDocumentSource = readFileSync(
  fileURLToPath(
    new URL('../../../overlay/workbench/lyrics.html', import.meta.url),
  ),
  'utf8',
);
const workbenchStylesSource = readFileSync(
  fileURLToPath(
    new URL('../../../overlay/workbench/workbench.css', import.meta.url),
  ),
  'utf8',
);

describe('Workbench streamer preview', () => {
  it('uses a dedicated Workbench route while preserving the renderer fallback', () => {
    expect(workbenchPreviewSource).toContain(
      "import streamerPreviewImage from '../../assets/workbench-streamer-guide.png'",
    );
    expect(workbenchPreviewSource).toContain('v-if="!hasRuntimeTemplate"');
    expect(workbenchPreviewSource).toContain(':src="streamerPreviewImage"');
    expect(workbenchPreviewSource).toContain(
      "url.pathname = '/workbench/lyrics';",
    );
    expect(workbenchPreviewSource).toContain('v-if="isLyrics"');
    expect(workbenchPreviewSource).toContain('<ObsWidgetCapturePreview');
    expect(outputHttpSource).toContain(
      "'/workbench/streamer-guide.png': ['workbench', 'streamer-guide.png']",
    );
    expect(outputHttpSource).not.toContain('ObsStreamerPreview');
    expect(workbenchDocumentSource).toContain('src="/overlay/lyrics"');
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
    expect(workbenchStylesSource).toContain('transform: scale(1.35);');
    expect(workbenchStylesSource).toContain('object-fit: contain;');
  });

  it('keeps the real output on an explicit layer above the occupancy guide', () => {
    expect(
      workbenchDocumentSource.indexOf('workbench-preview__output'),
    ).toBeGreaterThan(
      workbenchDocumentSource.indexOf('workbench-preview__guide'),
    );
    expect(workbenchStylesSource).toContain(
      '.workbench-preview__guide {\n    z-index: 1;',
    );
    expect(workbenchStylesSource).toContain(
      '.workbench-preview__output {\n    z-index: 2;',
    );
  });
});

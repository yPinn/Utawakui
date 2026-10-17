import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readObsTemplatePreviewSource } from './obsTemplateMockupSource.mjs';

const readRepo = (path) =>
  readFileSync(
    fileURLToPath(new URL(`../../../${path}`, import.meta.url)),
    'utf8',
  );

describe('Focus Line gallery mockup', () => {
  it('shows only the runtime caption lines', () => {
    const source = readObsTemplatePreviewSource('Caption');

    expect(source).toContain('{{ lyrics.current }}');
    expect(source).toContain('{{ lyrics.next }}');
    expect(source).not.toContain('track.title');
    expect(source).not.toContain('obs-template-mockup__eyebrow');
    expect(source).not.toContain('obs-template-mockup__title');
  });

  it('sizes the panel from the default runtime caption on a 1920×1080 canvas', () => {
    const source = readObsTemplatePreviewSource('Caption');
    const runtimeCss = readRepo('overlay/lyrics/lyrics.css');
    const appearanceCss = readRepo('overlay/shared/appearance.css');

    for (const [runtime, preview] of [
      ['--ovl-template-lyrics-current-size: 3.5em;', 'font-size: 3.5em;'],
      ['--ovl-template-lyrics-next-size: 1.75em;', 'font-size: 1.75em;'],
      ['--ovl-template-lyrics-bottom: 9%;', 'inset-block-end: 9%;'],
    ]) {
      expect(runtimeCss).toContain(runtime);
      expect(source).toContain(preview);
    }
    for (const [runtime, preview] of [
      ['--ovl-user-panel-width: 64rem;', 'calc(64 * var(--obs-canvas-rem))'],
      ['--ovl-user-line-width: 28ch;', 'max-inline-size: min(100%, 28ch);'],
      ['--ovl-user-current-stroke-width: 0.035em;', '0.035em'],
    ]) {
      expect(appearanceCss).toContain(runtime);
      expect(source).toContain(preview);
    }
    // Font, weight and surface come from the template's default appearance.
    for (const role of ['font-family', 'font-weight']) {
      expect(source).toContain(`${role}: var(--obs-user-${role})`);
    }
    expect(source).toContain('background: var(--obs-user-surface);');
    expect(source).toContain('line-height: 1.22;');
    expect(source).toContain('line-height: 1.3;');
  });
});

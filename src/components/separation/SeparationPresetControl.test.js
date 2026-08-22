import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import SeparationPresetControl from './SeparationPresetControl.vue';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
  separationPresetOptionsFor,
} from '../../constants/separationPresets.js';

const componentSource = fs.readFileSync(
  new URL('./SeparationPresetControl.vue', import.meta.url),
  'utf8',
);

function renderControl(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(SeparationPresetControl, {
          hasTrack: true,
          presetOptions: SEPARATION_PRESET_OPTIONS,
          selectedPresetId: DEFAULT_SEPARATION_PRESET_ID,
          presetTitle: SEPARATION_PRESET_SELECT_TITLE,
          ...props,
        }),
    }),
  );
}

describe('SeparationPresetControl', () => {
  it('shows a legacy high-quality option only for a track that already owns that result', () => {
    expect(separationPresetOptionsFor({ separation: { results: {} } })).toEqual(
      SEPARATION_PRESET_OPTIONS,
    );
    expect(
      separationPresetOptionsFor({
        separation: { results: { 'high-quality': { legacy: true } } },
      }),
    ).toContainEqual(
      expect.objectContaining({ id: 'high-quality', legacy: true }),
    );
  });

  it('keeps an unknown well-formed legacy result available for recovery', () => {
    expect(
      separationPresetOptionsFor({
        separation: { results: { 'old-experiment': { legacy: true } } },
      }),
    ).toContainEqual({
      id: 'old-experiment',
      label: '舊版結果：old-experiment',
      legacy: true,
    });
  });

  it('names the field and runnable choices by the user-facing decision', async () => {
    const html = await renderControl();

    expect(html).toContain('處理模式');
    expect(html).toContain('速度優先');
    expect(html).toContain('品質優先');
    expect(html).not.toContain('伴奏模型');
    expect(html).not.toContain('推薦分離');
    expect(html).not.toContain('和聲保留+');
    expect(html).toMatch(/<button[^>]*aria-label="產生伴奏"[^>]*>/);
    expect(html).toMatch(/>\s*<!--\[-->\s*產生\s*<!--\]-->\s*<\/span>/);
  });

  it('shows only a compact percentage while processing', async () => {
    const html = await renderControl({ inFlight: true, progressPercent: 42 });

    expect(html).toMatch(/>42%\s*<\/span>/);
    expect(html).not.toContain('分離中');
    expect(html).toContain('aria-label="伴奏處理進度 42%"');
  });

  it('uses an icon-only checked state after generation', async () => {
    const html = await renderControl({ hasResult: true });

    expect(html).toContain('aria-label="此模式已產生"');
    expect(html).not.toMatch(/>已產生<\/span>/);
    expect(html).not.toContain('aria-label="產生伴奏"');
  });

  it('shows failures through the shared notice component', async () => {
    const empty = await renderControl();
    const failed = await renderControl({ error: '伴奏產生失敗' });

    expect(empty).not.toContain('role="alert"');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('伴奏產生失敗');
    expect(componentSource).toContain('<UiNotice');
    expect(componentSource).not.toContain('data-message');
  });

  it('lets the select and action size to their content while keeping status states deliberate', () => {
    expect(componentSource).not.toContain('--ui-separation-preset-width');
    expect(componentSource).not.toContain('--ui-separation-action-width');
    expect(componentSource).toContain('font-variant-numeric: tabular-nums');
    expect(componentSource).toMatch(
      /\.separation-preset-control__row\s*\{[^}]*grid-template-columns:[^;]*minmax\(\s*var\(--ui-separation-mode-min-width\),\s*1fr\s*\)/s,
    );
    expect(componentSource).toMatch(
      /\.separation-preset-control__select\s*\{[^}]*padding-inline:\s*var\(--ui-space-2\)\s+var\(--ui-space-5\)/s,
    );
    expect(componentSource).toMatch(
      /\.separation-preset-control__action\s*\{[^}]*width:\s*max-content/s,
    );
    expect(componentSource).toMatch(
      /\.separation-preset-control__state--progress\s*\{[^}]*padding-inline:\s*var\(--ui-space-2\)/s,
    );
    expect(componentSource).toMatch(
      /\.separation-preset-control__state--complete\s*\{[^}]*width:\s*var\(--ui-control-height\)/s,
    );
  });
});

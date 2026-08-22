import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import SeparationPresetControl from './SeparationPresetControl.vue';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
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
  it('keeps a visible model label, every full option, and a clear generate action', async () => {
    const html = await renderControl();

    expect(html).toContain('伴奏模型');
    expect(html).toContain('和聲保留（快速）');
    expect(html).toContain('和聲保留+（較慢）');
    expect(html).toContain('純伴奏（較慢）');
    expect(html).toMatch(/<button[^>]*aria-label="產生伴奏"[^>]*>/);
    expect(html).toMatch(/>\s*<!--\[-->\s*產生\s*<!--\]-->\s*<\/span>/);
  });

  it('shows only a fixed-width percentage while processing', async () => {
    const html = await renderControl({ inFlight: true, progressPercent: 42 });

    expect(html).toMatch(/>42%\s*<\/span>/);
    expect(html).not.toContain('分離中');
    expect(html).toContain('aria-label="伴奏處理進度 42%"');
  });

  it('uses an icon-only checked state after generation', async () => {
    const html = await renderControl({ hasResult: true });

    expect(html).toContain('aria-label="此模型已產生"');
    expect(html).not.toMatch(/>已產生<\/span>/);
    expect(html).not.toContain('aria-label="產生伴奏"');
  });

  it('keeps one error-status slot whether or not an error is present', async () => {
    const empty = await renderControl();
    const failed = await renderControl({ error: '伴奏產生失敗' });

    expect(empty.match(/separation-preset-control__error-slot/g)).toHaveLength(
      1,
    );
    expect(failed.match(/separation-preset-control__error-slot/g)).toHaveLength(
      1,
    );
    expect(failed).toContain('aria-label="伴奏產生失敗"');
    expect(
      componentSource.indexOf('separation-preset-control__error-slot'),
    ).toBeLessThan(componentSource.indexOf('separation-preset-control__label'));
  });

  it('reserves fixed select and action widths so state changes cannot shift layout', () => {
    expect(componentSource).toContain('--ui-separation-preset-width');
    expect(componentSource).toContain('--ui-separation-action-width');
    expect(componentSource).toContain('font-variant-numeric: tabular-nums');
    expect(componentSource).toContain('flex: 0 0');
    expect(componentSource).toMatch(
      /\.separation-preset-control__action\s*\{[^}]*justify-content:\s*center/s,
    );
  });
});

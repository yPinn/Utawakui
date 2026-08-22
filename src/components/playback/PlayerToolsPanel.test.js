import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
} from '../../constants/separationPresets.js';

const componentSource = fs.readFileSync(
  new URL('./PlayerToolsPanel.vue', import.meta.url),
  'utf8',
);

function renderPanel(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(PlayerToolsPanel, {
          open: true,
          activeTab: 'process',
          selectedSeparationPresetId: DEFAULT_SEPARATION_PRESET_ID,
          separationPresetOptions: SEPARATION_PRESET_OPTIONS,
          separationPresetTitle: SEPARATION_PRESET_SELECT_TITLE,
          ...props,
        }),
    }),
  );
}

describe('PlayerToolsPanel process tab', () => {
  it('forwards the shared control preset id without treating it as a DOM event', () => {
    expect(componentSource).toMatch(
      /function handleSeparationPresetChange\(presetId\)\s*\{[^}]*emit\('selectSeparationPreset', presetId\)/s,
    );
  });

  it('keeps the compact shared control free of panel-specific sizing hacks', () => {
    expect(componentSource).not.toContain(
      ':deep(.separation-preset-control__label)',
    );
    expect(componentSource).not.toContain(':deep(.separation-preset-control)');
    expect(componentSource).not.toMatch(/flex:\s*1\s+1\s+calc\(/s);
  });

  it('uses the same framed process-item foundation for active and future operations', () => {
    expect(componentSource.match(/player-tools__process-item/g)).toHaveLength(
      3,
    );
    expect(componentSource).toMatch(
      /\.player-tools__process-item\s*\{[^}]*padding:\s*var\(--ui-space-3\)[^}]*border:\s*var\(--ui-border-width\)\s+solid\s+var\(--ui-color-border\)/s,
    );
    expect(componentSource).toMatch(
      /\.player-tools__process-copy\s*\{[^}]*display:\s*grid[^}]*gap:\s*var\(--ui-space-1\)/s,
    );
  });

  it('renders vocal separation controls for the current track', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
    });

    expect(html).toContain('伴奏分離');
    expect(html).toContain('Song A');
    expect(html).toContain('處理模式');
    expect(html).toContain('速度優先');
    expect(html).toContain('品質優先');
    expect(html).not.toContain('和聲保留+');
    expect(html).toContain('產生');
  });

  it('shows the in-flight status as the disabled action label, and disables the preset select too', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
      separationInFlight: true,
      separationProgressPercent: 42,
    });

    expect(html).toMatch(/>42%\s*<\/span>/);
    expect(html).not.toContain('分離中');
    expect(html).toContain('disabled');
  });

  it('shows an already-generated state for a preset with a result, and disables only the action button', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
      separationHasResult: true,
    });

    expect(html).toContain('aria-label="此模式已產生"');
    expect(html).not.toMatch(/>已產生<\/span>/);
    expect(html).not.toContain('重新產生');
    // The <select> stays enabled so the user can switch to a preset that
    // has no result yet; only the action button is disabled.
    const selectTag = html.match(/<select[^>]*>/)[0];
    expect(selectTag).not.toContain('disabled');
    expect(html).not.toContain('aria-label="產生伴奏"');
  });

  it('keeps render cache clearly marked as not implemented', async () => {
    const html = await renderPanel();

    expect(html).toContain('請先載入歌曲');
    expect(html).toContain('Render Cache');
    expect(html).toContain('待實作');
  });
});

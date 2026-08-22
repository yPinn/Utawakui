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

  it('wraps the leading error slot and label above the uncompressed control row inside the narrow panel', () => {
    expect(componentSource).toContain(
      ':deep(.separation-preset-control__label)',
    );
    expect(componentSource).toMatch(/flex:\s*1\s+1\s+calc\(/s);
    expect(componentSource).toContain('--ui-icon-button-size-sm');
  });

  it('renders vocal separation controls for the current track', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
    });

    expect(html).toContain('伴奏分離');
    expect(html).toContain('Song A');
    expect(html).toContain('快速分離');
    expect(html).toContain('推薦分離');
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

    expect(html).toContain('aria-label="此模型已產生"');
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

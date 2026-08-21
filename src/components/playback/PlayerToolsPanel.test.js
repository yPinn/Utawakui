import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
} from '../../constants/separationPresets.js';

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
  it('renders vocal separation controls for the current track', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
    });

    expect(html).toContain('Vocal Separation');
    expect(html).toContain('Song A');
    expect(html).toContain('和聲保留（快速）');
    expect(html).toContain('和聲保留+（較慢）');
    expect(html).toContain('純伴奏（較慢）');
    expect(html).toContain('產生');
  });

  it('shows the in-flight status as the disabled action label, and disables the preset select too', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
      separationInFlight: true,
      separationStatus: '分離中 42%',
    });

    expect(html).toContain('分離中 42%');
    expect(html).toContain('disabled');
  });

  it('shows an already-generated state for a preset with a result, and disables only the action button', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
      separationHasResult: true,
    });

    expect(html).toContain('已產生');
    expect(html).not.toContain('重新產生');
    // The <select> stays enabled so the user can switch to a preset that
    // has no result yet; only the action button is disabled.
    const selectTag = html.match(/<select[^>]*>/)[0];
    expect(selectTag).not.toContain('disabled');
    const actionButtonTag = html.match(
      /<button[^>]*aria-label="已產生"[^>]*>/,
    )[0];
    expect(actionButtonTag).toContain('disabled');
  });

  it('keeps render cache clearly marked as not implemented', async () => {
    const html = await renderPanel();

    expect(html).toContain('請先載入歌曲');
    expect(html).toContain('Render Cache');
    expect(html).toContain('待實作');
  });
});

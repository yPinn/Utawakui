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
      separationHasResult: true,
    });

    expect(html).toContain('Vocal Separation');
    expect(html).toContain('Song A');
    expect(html).toContain('和聲保留（快速）');
    expect(html).toContain('和聲保留+（較慢）');
    expect(html).toContain('純伴奏（較慢）');
    expect(html).toContain('重新產生');
  });

  it('shows the in-flight status as the disabled action label', async () => {
    const html = await renderPanel({
      currentTrack: { id: 't1', title: 'Song A' },
      separationInFlight: true,
      separationStatus: '分離中 42%',
    });

    expect(html).toContain('分離中 42%');
    expect(html).toContain('disabled');
  });

  it('keeps render cache clearly marked as not implemented', async () => {
    const html = await renderPanel();

    expect(html).toContain('請先載入歌曲');
    expect(html).toContain('Render Cache');
    expect(html).toContain('待實作');
  });
});

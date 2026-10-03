import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';

import BgmTrackPicker from './BgmTrackPicker.vue';

const source = readFileSync(
  new URL('./BgmTrackPicker.vue', import.meta.url),
  'utf8',
);

describe('BgmTrackPicker', () => {
  it('offers one replacement path from the local library', async () => {
    const html = await renderToString(
      createSSRApp(BgmTrackPicker, {
        searchResults: [
          { id: 'track-1', title: 'Quiet Room', artist: 'Local Artist' },
        ],
        searchQuery: 'quiet',
      }),
    );

    expect(html).not.toContain('更換歌曲');
    expect(html).toContain('搜尋本機曲庫');
    expect(html).toContain('改用此 BGM：Quiet Room');
    expect(html).not.toContain('選取後會取代目前 BGM，並從開頭待命。');
    expect(html).not.toContain('首已準備');
    expect(html).not.toContain('準備清單');
    expect(html).not.toContain('移除 BGM');
    expect(source).not.toContain('UiChip');
    expect(source).not.toContain('Trash2');
    expect(source).not.toContain('RefreshCw');
    expect(source).not.toContain('UiIconButton');
    expect(source).not.toContain('updateTrackMetadata');
    expect(source).toContain(':interactive="!isSaving"');
    expect(source).toContain('@row-click="emit(\'select\', track.id)"');
  });

  it('keeps errors and empty search results explicit without inventing a queue', async () => {
    const html = await renderToString(
      createSSRApp(BgmTrackPicker, {
        searchQuery: 'missing',
        searchResults: [],
        error: '目前無法更換 BGM。',
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('目前無法更換 BGM。');
    expect(html).toContain('找不到符合搜尋的其他曲目。');
  });

  it('distinguishes library loading from an empty search result', async () => {
    const html = await renderToString(
      createSSRApp(BgmTrackPicker, {
        searchQuery: 'quiet',
        searchResults: [],
        isLoading: true,
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('正在載入本機曲庫…');
    expect(html).not.toContain('找不到符合搜尋的其他曲目。');
  });

  it('keeps the search chrome fixed and gives only the result body scroll ownership', () => {
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(source).toMatch(
      /<UiSearchBox[\s\S]*<UiScrollLayout[\s\S]*class="bgm-track-picker__results-scroll"/u,
    );
    expect(source).toMatch(
      /\.bgm-track-picker\s*\{[^}]*min-block-size:\s*0;[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.bgm-track-picker__results-scroll\s*\{[^}]*min-block-size:\s*0;[^}]*flex:\s*1 1 auto;/su,
    );
  });
});

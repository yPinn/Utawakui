import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ProviderImportPanel.vue', import.meta.url),
  'utf8',
);

describe('ProviderImportPanel discovery affordance', () => {
  it('keeps native resolution primary and exposes a distinct YT Music exploration action', () => {
    expect(source).toContain('@click="resolveSource"');
    expect(source).toContain('@click="openYoutubeMusicSearch"');
    expect(source).toContain('到 YT Music 尋找更多結果');
  });

  it('explains the explicit browser-to-paste-back flow', () => {
    expect(source).toContain('在瀏覽器複製歌曲、專輯或播放清單連結');
    expect(source).toContain('貼回上方欄位');
  });

  it('states the native YT Music-first and YouTube-fallback source order', () => {
    expect(source).toContain('優先搜尋 YT Music 歌曲');
    expect(source).toContain('YouTube 補足其他版本');
  });

  it('keeps idle quiet and renders an empty outcome without an error notice', () => {
    expect(source).not.toContain('provider-empty-panel');
    expect(source).toContain("state.statusType === 'empty'");
    expect(source).toContain('role="status"');
  });

  it('does not invite an empty search or repeat provider provenance per result', () => {
    expect(source).toContain('!state.input.trim()');
    expect(source).toContain('playbackKindLabel');
    expect(source).not.toContain('candidateSourceLabel');
  });
});

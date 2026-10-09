import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SetlistArtistSummaryArtifact from './SetlistArtistSummaryArtifact.vue';

const source = readFileSync(
  new URL('./SetlistArtistSummaryArtifact.vue', import.meta.url),
  'utf8',
);

function renderSummary(summary) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(SetlistArtistSummaryArtifact, {
          artist: '王以太',
          summary,
        }),
    }),
  );
}

describe('SetlistArtistSummaryArtifact', () => {
  it('renders the artist library summary on a draggable Folder note', async () => {
    const html = await renderSummary({
      trackCount: 38,
      albumCount: 4,
      yearStart: 2018,
      yearEnd: 2024,
    });

    expect(source).toContain(
      "import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue'",
    );
    expect(source).toContain(
      "import UiFolderArtifact from '../ui/UiFolderArtifact.vue'",
    );
    expect(html).toContain('aria-label="Folder 延伸摘要"');
    expect(html).toContain('王以太');
    expect(html).toContain('藝人曲庫摘要');
    expect(html).toContain('38 首曲目 · 4 張專輯 · 2018–2024');
    expect(source).toContain('material="folder"');
    expect(source).toContain('initialY: 0.78');
  });

  it('keeps the facts concise when the year range is partial or absent', async () => {
    expect(
      await renderSummary({
        trackCount: 1,
        albumCount: 1,
        yearStart: 2024,
        yearEnd: 2024,
      }),
    ).toContain('1 首曲目 · 1 張專輯 · 2024');
    expect(await renderSummary({ trackCount: 2, albumCount: 0 })).toContain(
      '2 首曲目 · 0 張專輯',
    );
  });
});

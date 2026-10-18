import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SeparationPreparationList from './SeparationPreparationList.vue';

const source = readFileSync(
  new URL('./SeparationPreparationList.vue', import.meta.url),
  'utf8',
);

describe('SeparationPreparationList', () => {
  it('renders both columns including an empty prepared column', async () => {
    const tracks = Array.from({ length: 8 }, (_, id) => ({
      id: `track-${id}`,
      title: `Preview song ${id}`,
      artist: 'Artist',
    }));
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(SeparationPreparationList, { unpreparedTracks: tracks }),
      }),
    );
    expect(html).toContain('尚未生成 · 8 首');
    expect(html).toContain('已有伴奏 · 0 首');
    expect(html).toContain('沒有已有伴奏的曲目');
    expect(html.match(/class="ui-track /gu)).toHaveLength(8);
    expect(html).toContain('Preview song 7');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('projects source tracks into concise unprepared and prepared sections', () => {
    expect(source).toContain(
      ':heading="`尚未生成 · ${unpreparedTracks.length} 首`"',
    );
    expect(source).toContain(
      ':heading="`已有伴奏 · ${preparedTracks.length} 首`"',
    );
    expect(source).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    );
    expect(source).toContain('沒有尚未生成的曲目');
    expect(source).toContain('沒有已有伴奏的曲目');
    expect(source.match(/<TrackIdentityRow\b/gu)).toHaveLength(2);
    expect(source.match(/navigation="artist"/gu)).toHaveLength(2);
    expect(source).toContain(':icon="BadgeCheck"');
    expect(source).toContain('label="已有伴奏"');
    expect(source).not.toContain('index + 1');
  });

  it('owns one explicit section-level restart action', () => {
    expect(source).toContain(':icon="RotateCcw"');
    expect(source).toContain('label="重新準備已有伴奏"');
    expect(source).toContain("emit('restartPrepared')");
    expect(source).toContain(':disabled="busy || preparedTracks.length === 0"');
  });

  it('forwards artist navigation and reuses Right Dock row density', () => {
    expect(source.match(/class="right-dock-track"/gu)).toHaveLength(2);
    expect(
      source.match(/@navigate="emit\('navigate', \$event\)"/gu),
    ).toHaveLength(2);
    expect(source).not.toContain('<UiTrackRow');
  });
});

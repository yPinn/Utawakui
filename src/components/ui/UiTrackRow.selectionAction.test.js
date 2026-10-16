import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiTrackRow from './UiTrackRow.vue';

const source = readFileSync(
  new URL('./UiTrackRow.vue', import.meta.url),
  'utf8',
);

describe('UiTrackRow selection action semantics', () => {
  it('owns single-line overflow for title and artist content rendered by child components', () => {
    expect(source).toContain(':deep(.ui-track__title)');
    expect(source).toContain(':deep(.ui-track__title-text)');
    expect(source).toMatch(
      /:deep\(\.ui-track__title-text\)[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/u,
    );
    expect(source).toMatch(
      /\.ui-track__artist[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/u,
    );
  });

  it('only exposes pressed state and instructions when a caller opts in', async () => {
    const selected = await renderToString(
      createSSRApp({
        render: () =>
          h(UiTrackRow, {
            track: { id: 'selected', title: '選取曲目' },
            active: true,
            interactive: true,
            selectionAction: true,
            actionDescription: '單擊選取；雙擊播放',
            actionKeyboardShortcuts: 'Alt+ArrowUp Alt+ArrowDown',
          }),
      }),
    );
    const command = await renderToString(
      createSSRApp({
        render: () =>
          h(UiTrackRow, {
            track: { id: 'command', title: '一般命令' },
            active: true,
            interactive: true,
          }),
      }),
    );

    expect(selected).toContain('aria-pressed="true"');
    expect(selected).toContain('aria-description="單擊選取；雙擊播放"');
    expect(selected).toContain('aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"');
    expect(command).not.toContain('aria-pressed');
    expect(command).not.toContain('aria-description');
  });
});

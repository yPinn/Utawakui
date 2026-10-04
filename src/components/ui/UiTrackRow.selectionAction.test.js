import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiTrackRow from './UiTrackRow.vue';

describe('UiTrackRow selection action semantics', () => {
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
    expect(command).not.toContain('aria-pressed');
    expect(command).not.toContain('aria-description');
  });
});

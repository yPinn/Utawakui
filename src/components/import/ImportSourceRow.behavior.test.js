import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Download } from '../../icons/index.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import ImportSourceRow from './ImportSourceRow.vue';

for (const [component, filename] of [
  [ImportSourceRow, './ImportSourceRow.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const track = {
  id: 'candidate-1',
  title: 'Sample Song',
  artist: 'Sample Singer',
  thumbnailUrl: 'https://example.test/cover.jpg',
};

describe('ImportSourceRow shared object adapter', () => {
  it('preserves a long source title while opting into the shared one-line overflow presentation', async () => {
    const longTitle =
      '林俊傑 - Always Online「變色的生活 人性的挑撥 瘋狂的冒出」完整歌詞版 Official Lyrics Video';
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ImportSourceRow, {
            track: { ...track, title: longTitle },
            status: 'done',
          }),
      }),
    );

    expect(html).toContain(longTitle);
    expect(html).toContain('ui-track__title-text');
  });

  it('renders the shared Queue-density track row with an Import-owned action', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ImportSourceRow, {
            track,
            status: 'pending',
            actionIcon: Download,
            actionLabel: '下載 Sample Song',
          }),
      }),
    );

    expect(html).toContain('ui-track');
    expect(html).toContain('ui-track--state-surface');
    expect(html).toContain('Sample Song');
    expect(html).toContain('Sample Singer');
    expect(html).toContain('下載 Sample Song');
    expect(html).not.toContain('待下載');
    expect(html).not.toContain('ui-track__action');
    expect(html).not.toMatch(/<li[^>]*\sdraggable=/u);
  });

  it('emits its Import action without making the whole row interactive', () => {
    const action = vi.fn();
    const mounted = mount(ImportSourceRow, {
      track,
      status: 'error',
      actionIcon: Download,
      actionLabel: '重試 Sample Song',
      onAction: action,
    });
    const buttons = findAll(mounted.root, (node) => node.type === 'button');
    const actionButton = buttons.find(
      (button) => textContent(button) === '重試 Sample Song',
    );

    expect(actionButton).toBeTruthy();
    trigger(actionButton, 'onClick');
    expect(action).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('projects running and terminal states through shared status icons', async () => {
    const running = await renderToString(
      createSSRApp({
        render: () => h(ImportSourceRow, { track, status: 'downloading' }),
      }),
    );
    const done = await renderToString(
      createSSRApp({
        render: () => h(ImportSourceRow, { track, status: 'done' }),
      }),
    );

    expect(running).toContain('下載中');
    expect(running).toContain('ui-status-icon__glyph--spin');
    expect(done).toContain('完成');
    expect(done).toContain('ui-status-icon--success');
  });
});

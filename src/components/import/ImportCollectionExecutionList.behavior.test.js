import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
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
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import ImportCollectionExecutionList from './ImportCollectionExecutionList.vue';

for (const [component, filename] of [
  [ImportCollectionExecutionList, './ImportCollectionExecutionList.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
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

const tracks = [
  { id: 'active-1', title: 'Active 1', status: 'downloading', selected: true },
  { id: 'active-2', title: 'Active 2', status: 'downloading', selected: true },
  { id: 'pending-1', title: 'Pending', status: 'pending', selected: true },
  { id: 'failed-1', title: 'Failed', status: 'error', selected: true },
  { id: 'done-1', title: 'Done', status: 'done', selected: true },
  {
    id: 'local-1',
    title: 'Already local',
    status: 'pending',
    selected: true,
    alreadyDownloaded: true,
  },
];

describe('Import collection execution list', () => {
  it('groups work by queue state without repeating pending or completed labels per row', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(ImportCollectionExecutionList, { tracks }),
      }),
    );

    expect(html).toContain('處理中');
    expect(html).toContain('接下來');
    expect(html).toContain('未完成');
    expect(html).toContain('已完成');
    expect(html).toContain('Active 1');
    expect(html).toContain('Active 2');
    expect(html).toContain('Pending');
    expect(html).toContain('Failed');
    expect(html).toContain('Done');
    expect(html).toContain('Already local');
    expect(html).not.toContain('aria-label="待下載"');
    expect(html).not.toContain('aria-label="完成"');
  });

  it('offers a per-track stop only for active rows', () => {
    const onCancel = vi.fn();
    const mounted = mount(ImportCollectionExecutionList, {
      tracks,
      onCancel,
    });
    const stopButtons = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).startsWith('停止下載'),
    );

    expect(stopButtons).toHaveLength(2);
    trigger(stopButtons[0], 'onClick');
    expect(onCancel).toHaveBeenCalledWith('active-1');
    mounted.app.unmount();
  });

  it('keeps retry as one section action instead of repeating it per failed row', () => {
    const onRetryFailed = vi.fn();
    const mounted = mount(ImportCollectionExecutionList, {
      tracks,
      onRetryFailed,
    });
    const retryButtons = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node) === '重試未完成曲目',
    );

    expect(retryButtons).toHaveLength(1);
    trigger(retryButtons[0], 'onClick');
    expect(onRetryFailed).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });
});

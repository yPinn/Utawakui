import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import QueueTrackButton from './QueueTrackButton.vue';

for (const [component, filename] of [
  [QueueTrackButton, './QueueTrackButton.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function render(props) {
  return renderToString(
    createSSRApp({ render: () => h(QueueTrackButton, props) }),
  );
}

const track = {
  id: 'queue-standard-row',
  title: 'Walpurgis -prologue-',
  artist: 'Aimer',
  duration: 143,
  thumbnailUrl: 'utawakui-media://track/queue-standard-row/artwork',
};

describe('QueueTrackButton standard Track Row adapter', () => {
  it('renders the shared 52/40 row with plain metadata and no duration', async () => {
    const html = await render({ track, active: true, current: true });

    expect(html).toContain('<li');
    expect(html).toContain('ui-track--interactive');
    expect(html).toContain('ui-track--active');
    expect(html).toContain('ui-track--current');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('width:var(--ui-track-row-thumb-size)');
    expect(html).toContain('height:var(--ui-track-row-thumb-size)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('ui-track__title-text');
    expect(html).toContain('ui-track__artist');
    expect(html).not.toContain('ui-text-btn');
    expect(html).not.toContain('ui-marquee');
    expect(html).not.toContain('ui-track__duration');
    expect(html).not.toContain('2:23');
  });

  it('selects on one click and activates on double-click, artwork, or Enter', () => {
    const select = vi.fn();
    const activate = vi.fn();
    const mounted = mount(QueueTrackButton, {
      track,
      active: true,
      draggable: true,
      onSelect: select,
      onActivate: activate,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('queue-track'),
    )[0];
    const buttons = findAll(row, (node) => node.type === 'button');
    const artworkButton = buttons.find((node) =>
      String(node.props?.class ?? '').includes('ui-track__artwork-action'),
    );
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    expect(row.type).toBe('li');
    expect(row.props.role).toBe('button');
    expect(row.props.draggable).toBe(true);
    expect(String(row.props.class)).toContain('ui-track--active');
    expect(buttons).toHaveLength(1);
    expect(artworkButton.props['aria-label']).toBe(`播放：${track.title}`);

    trigger(row, 'onClick', { type: 'click' });
    expect(select).toHaveBeenCalledWith(track);
    expect(activate).not.toHaveBeenCalled();

    trigger(row, 'onDblclick', { type: 'dblclick' });
    trigger(artworkButton, 'onClick', { stopPropagation });
    trigger(row, 'onKeydown', {
      target: row,
      currentTarget: row,
      key: 'Enter',
      preventDefault,
    });

    expect(activate).toHaveBeenCalledTimes(3);
    expect(activate).toHaveBeenNthCalledWith(1, track);
    expect(activate).toHaveBeenNthCalledWith(2, track);
    expect(activate).toHaveBeenNthCalledWith(3, track);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });
});

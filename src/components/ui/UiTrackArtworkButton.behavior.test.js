import { h, reactive, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiTrackArtworkButton from './UiTrackArtworkButton.vue';
import {
  attachClientRender,
  mount,
  findAll,
  trigger,
  textContent,
} from './uiTestHost.js';

vi.mock('./UiTrackThumb.vue', () => ({
  default: {
    props: ['track', 'size', 'loading', 'decoding'],
    setup(_, { slots }) {
      return () => h('span', { class: 'thumb' }, slots.overlay?.());
    },
  },
}));
attachClientRender(
  UiTrackArtworkButton,
  './UiTrackArtworkButton.vue',
  import.meta.url,
);

describe('canonical track artwork button', () => {
  it('separates artwork activation from row click and double-click, and keeps its native node on pause or disable', async () => {
    const props = reactive({
      track: { id: 'one' },
      label: '播放 BGM',
      disabled: false,
      onActivate: vi.fn(),
    });
    const page = mount(UiTrackArtworkButton, props, {
      overlay: () => h('i', 'cue'),
    });
    const button = findAll(page.root, (n) => n.type === 'button')[0];
    expect(textContent(button)).toContain('播放 BGM');
    const click = { stopPropagation: vi.fn() };
    trigger(button, 'onClick', click);
    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(props.onActivate).toHaveBeenCalledExactlyOnceWith(click);
    const doubleClick = { stopPropagation: vi.fn() };
    trigger(button, 'onDblclick', doubleClick);
    expect(doubleClick.stopPropagation).toHaveBeenCalledOnce();
    expect(props.onActivate).toHaveBeenCalledTimes(1);
    props.label = '暫停 BGM';
    props.disabled = true;
    await nextTick();
    expect(findAll(page.root, (n) => n.type === 'button')[0]).toBe(button);
    expect(button.props.disabled).toBe(true);
    expect(textContent(button)).toContain('暫停 BGM');
    trigger(button, 'onClick', { stopPropagation: vi.fn() });
    expect(props.onActivate).toHaveBeenCalledTimes(1);
    page.app.unmount();
  });
});

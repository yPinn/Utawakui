import { h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import ObsTemplateFilmstrip from './ObsTemplateFilmstrip.vue';
import ObsTemplateTile from './ObsTemplateTile.vue';

vi.mock('./ObsTemplateThumbnail.vue', () => ({
  default: {
    props: ['preset'],
    setup: (props) => () => h('span', { 'data-thumbnail': props.preset.id }),
  },
}));

for (const [component, filename] of [
  [ObsTemplateFilmstrip, './ObsTemplateFilmstrip.vue'],
  [ObsTemplateTile, './ObsTemplateTile.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('Output workbench template filmstrip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens with favorites first in catalogue order without scrolling to the applied tile', async () => {
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const props = {
      activeId: 'first',
      favoriteIds: new Set(['third', 'second']),
      presets: ['first', 'second', 'third'].map((id) => ({ id, name: id })),
    };
    const { app, root } = mount(ObsTemplateFilmstrip, props);
    const order = () =>
      findAll(root, (node) => node.props['data-thumbnail']).map(
        (node) => node.props['data-thumbnail'],
      );
    try {
      await nextTick();
      expect(order()).toEqual(['second', 'third', 'first']);
      const [strip] = findAll(
        root,
        (node) => node.props.class === 'obs-template-filmstrip',
      );
      strip.querySelector = vi.fn();
      requestFrame.mock.lastCall[0]();
      expect(strip.querySelector).not.toHaveBeenCalled();
    } finally {
      app.unmount();
    }
  });

  it('requests a switch immediately and marks the template only after it is applied', async () => {
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onSelect = vi.fn();
    const props = reactive({
      activeId: 'first',
      busy: false,
      presets: [
        { id: 'first', name: 'First template' },
        { id: 'second', name: 'Second template' },
      ],
      onSelect,
    });
    const { app, root } = mount(ObsTemplateFilmstrip, props);
    const [first, second] = findAll(root, (node) => node.type === 'button');
    const [strip] = findAll(
      root,
      (node) => node.props.class === 'obs-template-filmstrip',
    );
    const scrollIntoView = vi.fn();
    strip.querySelector = vi.fn(() => ({ scrollIntoView }));

    expect(first.props['aria-pressed']).toBe(true);
    expect(second.props['aria-pressed']).toBe(false);
    expect(first.props.class).toContain('obs-template-thumb--applied');
    expect(second.props.class).not.toContain('obs-template-thumb--applied');
    trigger(first, 'onClick');
    expect(onSelect).not.toHaveBeenCalled();
    trigger(second, 'onClick');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('second');
    expect(second.props['aria-pressed']).toBe(false);

    props.busy = true;
    await nextTick();
    expect(second.props['aria-disabled']).toBe(true);
    trigger(second, 'onClick');
    expect(onSelect).toHaveBeenCalledOnce();

    props.activeId = 'second';
    props.busy = false;
    await nextTick();
    expect(first.props['aria-pressed']).toBe(false);
    expect(second.props['aria-pressed']).toBe(true);
    expect(first.props.class).not.toContain('obs-template-thumb--applied');
    expect(second.props.class).toContain('obs-template-thumb--applied');
    expect(findAll(second, (node) => node.props.role === 'img')).toHaveLength(
      1,
    );
    requestFrame.mock.lastCall[0]();
    expect(strip.querySelector).toHaveBeenCalledWith('[aria-pressed="true"]');
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      container: 'nearest',
    });
    app.unmount();
  });
});

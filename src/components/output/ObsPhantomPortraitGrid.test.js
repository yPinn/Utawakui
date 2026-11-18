import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import UiHint from '../ui/UiHint.vue';
import UiStack from '../ui/UiStack.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import ObsPhantomPortraitGrid from './ObsPhantomPortraitGrid.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';

const { player } = vi.hoisted(() => ({ player: { track: null } }));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: player }),
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    inheritAttrs: false,
    setup:
      (_, { attrs, slots }) =>
      () =>
        h('button', attrs, slots.default?.()),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    inheritAttrs: false,
    props: ['label'],
    setup:
      (props, { attrs }) =>
      () =>
        h('button', { ...attrs, 'aria-label': props.label }),
  },
}));

for (const [component, path] of [
  [ObsPhantomPortraitGrid, './ObsPhantomPortraitGrid.vue'],
  [ObsPhantomPortraitThumb, './ObsPhantomPortraitThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, path, import.meta.url);
}

function setup(count, activeId = '') {
  const defaultSet = { phantomArtistName: '', phantomPortraitColor: '#f3d648' };
  const model = reactive({
    activeId,
    items: Array.from({ length: count }, (_, index) => ({
      id: `preset-${index + 1}`,
      phantomArtistName: `Singer ${index + 1}`,
      phantomPortraitColor: '#4466aa',
      phantomPortraitPhoto: `photo-${index + 1}`,
    })),
  });
  const startAdd = vi.fn();
  const startEdit = vi.fn();
  const { app, root } = mount({
    setup: () => () =>
      h(ObsPhantomPortraitGrid, {
        ...model,
        active: true,
        onSelect: (id) => (model.activeId = id),
        onAdd: startAdd,
        onEdit: startEdit,
        onRemove: () => {
          model.items = model.items.filter(({ id }) => id !== model.activeId);
          model.activeId = '';
        },
      }),
  });
  const byClass = (className) =>
    findAll(root, (node) => node.props.class?.split(' ').includes(className));
  const byLabel = (label) =>
    findAll(root, (node) => node.props['aria-label'] === label)[0];
  const cards = () =>
    findAll(root, (node) => node.props['aria-pressed'] !== undefined);
  const current = () => cards().find((node) => node.props['aria-pressed']);
  const page = () => textContent(byClass('obs-portrait-grid__page')[0]);
  const click = async (label) => {
    const button = byLabel(label);
    trigger(button, 'onClick', { currentTarget: button });
    await nextTick();
  };
  const saveNewSet = async () => {
    model.activeId = 'new';
    model.items = [...model.items, { ...defaultSet, id: 'new' }];
    await nextTick();
  };
  byClass('obs-portrait-grid__cells')[0].querySelector = current;
  return {
    app,
    root,
    byLabel,
    cards,
    current,
    page,
    click,
    startAdd,
    startEdit,
    saveNewSet,
  };
}

describe('phantom portrait grid', () => {
  it('pages six cells and opens the editor before the new preset is added', async () => {
    const {
      app,
      byLabel,
      cards,
      current,
      page,
      click,
      startAdd,
      startEdit,
      saveNewSet,
    } = setup(5);
    expect(cards()).toHaveLength(6);
    expect(page()).toContain('1／1');
    await click('新增人物組合');
    expect(startAdd).toHaveBeenCalledOnce();
    expect(current().props['aria-label']).toBe('跟隨歌手');
    expect(
      findAll(
        current(),
        (node) =>
          node.props.style?.['--ui-track-thumb-background'] ===
          'var(--ui-output-portrait-indigo)',
      ),
    ).toHaveLength(1);
    expect(byLabel('編輯人物組合').props['aria-disabled']).toBe(true);
    expect(byLabel('移除人物組合').props['aria-disabled']).toBe(true);
    expect(cards()).toHaveLength(6);
    await saveNewSet();
    expect(cards()).toHaveLength(1);
    expect(page()).toContain('2／2');
    expect(current().props['aria-label']).toBe('組合 6');
    await click('上一頁');
    expect(current()).toBeUndefined();
    expect(byLabel('移除人物組合').props['aria-disabled']).toBe(true);
    await click('下一頁');
    expect(current().props['aria-label']).toBe('組合 6');
    await click('上一頁');
    await click('5 · Singer 5');
    expect(current().props['aria-label']).toBe('5 · Singer 5');
    await click('編輯人物組合');
    expect(startEdit).toHaveBeenCalledOnce();
    await click('移除人物組合');
    expect(current().props['aria-label']).toBe('跟隨歌手');
    expect(page()).toContain('1／1');
    app.unmount();
  });

  it('opens on the saved page and falls back from custom photo to artist photo', async () => {
    player.track = { id: 'track-a', artist: 'Original artist' };
    const { app, root, byLabel, current, page } = setup(12, 'preset-10');
    expect(page()).toContain('2／3');
    expect(byLabel('新增人物組合').props['aria-disabled']).toBe(true);
    expect(textContent(current())).toBe('');
    expect(textContent(current().parent.parent)).toBe('Singer 10');
    const image = (source) =>
      findAll(root, (node) => node.props.src?.endsWith(source))[0];
    const failImage = (source) => {
      const node = image(source);
      trigger(node, 'onError', { currentTarget: { src: node.props.src } });
    };
    expect(image('/custom/photo-10').props.class).not.toContain(
      'image--artist',
    );
    failImage('/custom/photo-10');
    await nextTick();
    expect(image('/artist/track-a').props.class).toContain('image--artist');
    failImage('/artist/track-a');
    await nextTick();
    expect(image('/artist/track-a')).toBeUndefined();
    expect(image('/custom/photo-10')).toBeUndefined();
    app.unmount();
    player.track = null;
  });
});

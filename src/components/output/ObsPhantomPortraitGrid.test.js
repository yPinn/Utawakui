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
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import ObsPhantomPortraitGrid from './ObsPhantomPortraitGrid.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';

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
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, path, import.meta.url);
}

function makeItems(names) {
  return names.map((name, index) => ({
    id: `preset-${index + 1}`,
    phantomArtistName: name,
    phantomPortraitColor: '#4466aa',
    phantomPortraitPhoto: `photo-${index + 1}`,
  }));
}

function setup(items, activeId = '', options = {}) {
  const model = reactive({
    activeId,
    items,
  });
  const startAdd = vi.fn();
  const startEdit = vi.fn();
  let portraitGrid;
  const { app, root } = mount({
    setup: () => () =>
      h(ObsPhantomPortraitGrid, {
        ...model,
        ref: (instance) => (portraitGrid = instance),
        active: true,
        ...options,
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
  const cardLabels = () => cards().map((node) => node.props['aria-label']);
  const current = () => cards().find((node) => node.props['aria-pressed']);
  const input = findAll(root, (node) => node.props.type === 'search')[0];
  const search = async (value) => {
    trigger(input, 'onInput', { target: { value } });
    await nextTick();
  };
  const click = async (label) => {
    const button = byLabel(label);
    trigger(button, 'onClick', { currentTarget: button });
    await nextTick();
  };
  const saveNewSet = async (name) => {
    model.activeId = 'new';
    model.items = [...model.items, { id: 'new', phantomArtistName: name }];
    await nextTick();
    await portraitGrid.focusAfterEdit(true);
  };
  const cells = byClass('obs-portrait-grid__cells')[0];
  cells.querySelector = current;
  return {
    app,
    root,
    byLabel,
    cards,
    cardLabels,
    cells,
    current,
    click,
    input,
    search,
    startAdd,
    startEdit,
    saveNewSet,
  };
}

describe('phantom portrait grid', () => {
  it('sorts presets by name, keeps one trailing add tile and opens the editor before adding', async () => {
    const {
      app,
      byLabel,
      cards,
      cardLabels,
      cells,
      current,
      click,
      startAdd,
      startEdit,
      saveNewSet,
    } = setup(makeItems(['Winter', 'V', 'Karina', 'Juice WRLD', 'JungKook']));
    expect(cardLabels()).toEqual([
      '跟隨歌手',
      'Juice WRLD',
      'JungKook',
      'Karina',
      'V',
      'Winter',
    ]);
    expect(cells.children.at(-1)).toBe(byLabel('新增人物組合').parent);
    expect(byLabel('上一頁')).toBeUndefined();
    expect(byLabel('下一頁')).toBeUndefined();
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
    await saveNewSet('Adele');
    expect(cards()).toHaveLength(7);
    expect(cardLabels().slice(0, 3)).toEqual([
      '跟隨歌手',
      'Adele',
      'Juice WRLD',
    ]);
    expect(current().props['aria-label']).toBe('Adele');
    expect(current().focus).toHaveBeenCalledOnce();
    expect(cells.children.at(-1)).toBe(byLabel('新增人物組合').parent);
    await click('JungKook');
    expect(current().props['aria-label']).toBe('JungKook');
    await click('編輯人物組合');
    expect(startEdit).toHaveBeenCalledOnce();
    await click('移除人物組合');
    expect(current().props['aria-label']).toBe('跟隨歌手');
    expect(cards()).toHaveLength(6);
    app.unmount();
  });

  it('filters by displayed names and reveals a saved result outside the current search', async () => {
    const { app, root, byLabel, cardLabels, click, input, search, saveNewSet } =
      setup(
        makeItems(['winter', 'Winter 10', 'WINTER 2', 'Karina', '']),
        'preset-4',
      );
    expect(cardLabels()).toEqual([
      '跟隨歌手',
      'Karina',
      'winter',
      'WINTER 2',
      'Winter 10',
      '未命名人物組合',
    ]);
    await search('  ＷＩＮＴＥＲ ');
    expect(cardLabels()).toEqual(['winter', 'WINTER 2', 'Winter 10']);
    expect(byLabel('編輯人物組合').props['aria-disabled']).toBe(true);
    await click('WINTER 2');
    expect(byLabel('編輯人物組合').props['aria-disabled']).toBe(false);
    await click('移除人物組合');
    expect(input.focus).toHaveBeenCalledOnce();
    expect(cardLabels()).toEqual(['winter', 'Winter 10']);
    await search('missing');
    expect(cardLabels()).toEqual([]);
    const status = findAll(root, (node) => node.props.role === 'status')[0];
    expect(textContent(status)).toBe('找不到符合的人物組合');
    await click('新增人物組合');
    await saveNewSet('Guest');
    expect(input.props.value).toBe('');
    expect(cardLabels()).toContain('Guest');
    app.unmount();
  });

  it('shows all saved presets up to the limit and falls back from custom photo to artist photo', async () => {
    const { app, byLabel, cardLabels, current, search } = setup(
      makeItems(
        Array.from({ length: 12 }, (_, index) => `Singer ${index + 1}`),
      ),
      'preset-10',
      { track: { id: 'track-a', artist: 'Original artist' } },
    );
    expect(cardLabels()).toHaveLength(13);
    expect(byLabel('新增人物組合').props['aria-disabled']).toBe(true);
    expect(textContent(current())).toBe('');
    expect(textContent(current().parent.parent)).toBe('Singer 10');
    const image = (source) =>
      findAll(current(), (node) => node.props.src?.endsWith(source))[0];
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
    await search('original artist');
    expect(cardLabels()).toEqual(['跟隨歌手 · Original artist']);
    app.unmount();
  });

  it('uses the same selectable grid with remote thumbnails and search on the phone', async () => {
    const { app, root, byLabel, cardLabels, click, current, search } = setup(
      makeItems(['Winter', 'Karina']),
      '',
      {
        selectionOnly: true,
        stretch: true,
        thumbnailFor: (id) => (id ? { custom: `blob:${id}` } : {}),
      },
    );
    expect(
      findAll(root, (node) =>
        String(node.props.class).includes('obs-portrait-grid--stretch'),
      ),
    ).toHaveLength(1);
    expect(cardLabels()).toEqual(['跟隨歌手', 'Karina', 'Winter']);
    expect(byLabel('新增人物組合')).toBeUndefined();
    expect(byLabel('編輯人物組合')).toBeUndefined();
    expect(
      findAll(root, (node) => node.props.src?.startsWith('utawakui-media:')),
    ).toHaveLength(0);
    await search('winter');
    await click('Winter');
    expect(
      findAll(current(), (node) => node.props.src === 'blob:preset-1'),
    ).toHaveLength(1);
    app.unmount();
  });
});

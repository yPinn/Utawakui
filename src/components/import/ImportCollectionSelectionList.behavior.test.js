import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import List from './ImportCollectionSelectionList.vue';
import UiHint from '../ui/UiHint.vue';

vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    props: ['track'],
    setup:
      (props, { slots }) =>
      () =>
        h('li', { 'data-track': props.track.id }, [
          slots.lead?.(),
          props.track.title,
          slots.trail?.(),
        ]),
  },
}));
vi.mock('../layout/AppRightDockSection.vue', () => ({
  default: {
    props: ['heading'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', [
          h('h3', props.heading),
          slots.trailing?.(),
          slots.default?.(),
        ]),
  },
}));
vi.mock('../ui/UiCheckbox.vue', () => ({
  default: {
    props: ['id', 'modelValue', 'disabled', 'label'],
    setup:
      (props, { emit }) =>
      () =>
        h('input', {
          id: props.id,
          type: 'checkbox',
          checked: props.modelValue,
          disabled: props.disabled,
          'aria-label': props.label,
          onChange: (event) => emit('update:modelValue', event.target.checked),
        }),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: () => emit('click'),
        }),
  },
}));
vi.mock('./ImportCollectionTrackStatus.vue', () => ({
  default: { props: ['track'], setup: () => () => h('span', 'status') },
}));
attachClientRender(
  List,
  './ImportCollectionSelectionList.vue',
  import.meta.url,
);
attachClientRender(UiHint, '../ui/UiHint.vue', import.meta.url);

const tracks = () => [
  { id: 'new', title: '待下載歌曲', status: 'pending', selected: true },
  { id: 'other', title: '尚未選取', status: 'pending', selected: false },
  { id: 'failed', title: '失敗歌曲', status: 'error', selected: true },
  {
    id: 'local',
    title: '原有歌曲',
    status: 'pending',
    alreadyDownloaded: true,
    selected: true,
  },
  { id: 'done', title: '本次已下載', status: 'done', selected: true },
];
const row = (root, id) =>
  findAll(root, (node) => node.props['data-track'] === id)[0];

describe('Import collection selection', () => {
  it('keeps both empty sections visible with no selection action available', () => {
    const mounted = mount(List, { tracks: [] });
    expect(textContent(mounted.root)).toContain('沒有待下載的曲目');
    expect(textContent(mounted.root)).toContain('沒有已在曲庫的曲目');
    expect(findAll(mounted.root, (node) => node.type === 'input')).toHaveLength(
      0,
    );
    expect(
      findAll(mounted.root, (node) => node.type === 'button')[0].props.disabled,
    ).toBe(true);
    mounted.app.unmount();
  });
  it('separates downloadable work from read-only local tracks without hiding unselected songs', () => {
    const source = tracks();
    const mounted = mount(List, { tracks: source });
    const sections = findAll(mounted.root, (node) => node.type === 'section');
    expect(textContent(sections[0])).toContain('待下載 · 3 首');
    expect(textContent(sections[1])).toContain('已在曲庫 · 2 首');
    expect(textContent(sections[0])).toContain('尚未選取');
    expect(findAll(mounted.root, (node) => node.type === 'input')).toHaveLength(
      3,
    );
    expect(
      findAll(row(mounted.root, 'local'), (node) => node.type === 'input'),
    ).toHaveLength(0);
    expect(
      findAll(row(mounted.root, 'done'), (node) => node.type === 'input'),
    ).toHaveLength(0);
    expect(source[3].selected).toBe(true);
    mounted.app.unmount();
  });

  it('emits bounded selection intents and locks controls while importing', async () => {
    const onSelectTrack = vi.fn();
    const onToggleSelectAll = vi.fn();
    const props = reactive({
      tracks: tracks(),
      busy: false,
      allSelected: false,
      onSelectTrack,
      onToggleSelectAll,
    });
    const mounted = mount(List, props);
    const checkbox = findAll(
      row(mounted.root, 'other'),
      (node) => node.type === 'input',
    )[0];
    trigger(checkbox, 'onChange', { target: { checked: true } });
    expect(onSelectTrack).toHaveBeenCalledExactlyOnceWith('other', true);
    const button = findAll(mounted.root, (node) => node.type === 'button')[0];
    trigger(button, 'onClick');
    expect(onToggleSelectAll).toHaveBeenCalledOnce();
    props.busy = true;
    await nextTick();
    expect(
      findAll(
        mounted.root,
        (node) => node.type === 'input' || node.type === 'button',
      ).every((node) => node.props.disabled),
    ).toBe(true);
    mounted.app.unmount();
  });

  it('keeps both headings and an empty state when everything is already local', () => {
    const mounted = mount(List, { tracks: tracks().slice(3) });
    expect(textContent(mounted.root)).toContain('待下載 · 0 首');
    expect(textContent(mounted.root)).toContain('沒有待下載的曲目');
    expect(textContent(mounted.root)).toContain('已在曲庫 · 2 首');
    expect(
      findAll(mounted.root, (node) => node.type === 'button')[0].props.disabled,
    ).toBe(true);
    mounted.app.unmount();
  });
});

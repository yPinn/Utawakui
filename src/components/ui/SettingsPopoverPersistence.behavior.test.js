import { nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackTableColumnChooser from '../track/TrackTableColumnChooser.vue';
import TrackListDensityMenu from '../track/TrackListDensityMenu.vue';
import PerformerActionBar from '../performer/PerformerActionBar.vue';
import PerformerDisplayControls from '../performer/PerformerDisplayControls.vue';
import PerformerSyncControls from '../performer/PerformerSyncControls.vue';
import DemoTrackCollectionColumnChooser from '../demo/DemoTrackCollectionColumnChooser.vue';
import UiPopover from './UiPopover.vue';
import UiIconButton from './UiIconButton.vue';
import UiButtonGroup from './UiButtonGroup.vue';
import UiButton from './UiButton.vue';
import UiField from './UiField.vue';
import UiCheckbox from './UiCheckbox.vue';
import UiRadioGroup from './UiRadioGroup.vue';
import UiSegmentedControl from './UiSegmentedControl.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiScrollLayout from './UiScrollLayout.vue';
import UiSeparator from './UiSeparator.vue';
import UiHint from './UiHint.vue';
import UiNotice from './UiNotice.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, path] of [
  [TrackTableColumnChooser, '../track/TrackTableColumnChooser.vue'],
  [TrackListDensityMenu, '../track/TrackListDensityMenu.vue'],
  [PerformerActionBar, '../performer/PerformerActionBar.vue'],
  [PerformerDisplayControls, '../performer/PerformerDisplayControls.vue'],
  [PerformerSyncControls, '../performer/PerformerSyncControls.vue'],
  [
    DemoTrackCollectionColumnChooser,
    '../demo/DemoTrackCollectionColumnChooser.vue',
  ],
  ...Object.entries({
    UiPopover,
    UiIconButton,
    UiButtonGroup,
    UiButton,
    UiField,
    UiCheckbox,
    UiRadioGroup,
    UiSegmentedControl,
    UiScrollRegion,
    UiScrollLayout,
    UiSeparator,
    UiHint,
    UiNotice,
  }).map(([name, component]) => [component, `./${name}.vue`]),
])
  attachClientRender(component, path, import.meta.url);

let app;
let documentEvents;
let windowEvents;
const listeners = () => {
  const handlers = new Map();
  return {
    addEventListener: (name, fn) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    removeEventListener: (name, fn) => handlers.get(name)?.delete(fn),
    dispatch: (name, event) =>
      [...(handlers.get(name) ?? [])].forEach((fn) => fn(event)),
  };
};
beforeEach(() => {
  documentEvents = listeners();
  windowEvents = listeners();
  const body = hostNode('body');
  vi.stubGlobal('document', {
    body,
    activeElement: null,
    documentElement: hostNode('html'),
    querySelector: () => null,
    ...documentEvents,
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 850,
    ...windowEvents,
    requestAnimationFrame: (fn) => {
      fn();
      return 1;
    },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({
      direction: 'ltr',
      fontSize: '16px',
      getPropertyValue: () => '',
    }),
  });
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

function setup(component, props, label) {
  const view = mount(component, props);
  app = view.app;
  const button = () =>
    findAll(
      view.root,
      (node) => node.type === 'button' && textContent(node).trim() === label,
    )[0];
  const panel = () =>
    findAll(view.overlayHost, (node) => node.props.role === 'dialog')[0];
  return { ...view, button, panel };
}
async function backgroundScroll(view) {
  windowEvents.dispatch('scroll', { target: hostNode('background-results') });
  await nextTick();
  expect(view.panel()).toBeTruthy();
}
async function explicitDismissal(view) {
  documentEvents.dispatch('pointerdown', { target: hostNode('outside') });
  await nextTick();
  expect(view.panel()).toBeUndefined();
  trigger(view.button(), 'onClick');
  await nextTick();
  expect(view.panel()).toBeTruthy();
  windowEvents.dispatch('keydown', {
    key: 'Escape',
    target: hostNode('body'),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
  await nextTick();
  expect(view.panel()).toBeUndefined();
  trigger(view.button(), 'onClick');
  await nextTick();
  trigger(view.button(), 'onClick');
  await nextTick();
  expect(view.panel()).toBeUndefined();
}

describe('settings Popover persistence across consumers', () => {
  it('keeps density settings open after selection, parent updates and background scroll', async () => {
    const update = vi.fn((value) => {
      props.density = value;
    });
    const props = reactive({ density: 'list', onUpdateDensity: update });
    const view = setup(TrackListDensityMenu, props, '調整曲目顯示密度');
    trigger(view.button(), 'onClick');
    await nextTick();
    const compact = findAll(
      view.overlayHost,
      (node) => node.type === 'input' && node.props.value === 'compact',
    )[0];
    trigger(compact, 'onChange', { target: { checked: true } });
    await nextTick();
    expect(update).toHaveBeenCalledWith('compact');
    expect(view.panel()).toBeTruthy();
    props.density = 'list';
    await nextTick();
    await backgroundScroll(view);
    await explicitDismissal(view);
  });

  it.each([
    ['production columns', TrackTableColumnChooser],
    ['catalogue columns', DemoTrackCollectionColumnChooser],
  ])(
    'keeps %s open after checkbox, saved preferences and responsive hints update',
    async (_name, component) => {
      const update = vi.fn((value) => {
        props.preferences = value;
      });
      const props = reactive({
        collectionKind: 'playlist',
        preferences: {},
        hiddenForWidth: [],
        onUpdateColumnPreferences: update,
      });
      const view = setup(component, props, '選擇顯示欄位');
      trigger(view.button(), 'onClick');
      await nextTick();
      const choice = findAll(
        view.overlayHost,
        (node) =>
          node.type === 'input' &&
          node.props.type === 'checkbox' &&
          !node.props.disabled,
      )[0];
      trigger(choice, 'onChange', {
        target: { checked: !choice.props.checked },
      });
      await nextTick();
      expect(update).toHaveBeenCalledOnce();
      expect(view.panel()).toBeTruthy();
      props.hiddenForWidth = ['release'];
      props.preferences = { ...props.preferences, widths: { identity: 320 } };
      await nextTick();
      await backgroundScroll(view);
      await explicitDismissal(view);
    },
  );

  it('keeps performer settings open through reading controls, scale changes and incoming frames', async () => {
    const props = reactive({
      frame: {
        trackId: 'a',
        playbackStatus: 'playing',
        lyricsOffset: { available: true, milliseconds: 0 },
        readingVariants: ['off', 'furigana', 'romaji'],
        readingVariant: 'off',
      },
      readingScale: 'desk',
      pending: false,
      onControl: vi.fn((value) => {
        if (value.startsWith('reading-'))
          props.frame.readingVariant = value.slice(8);
      }),
      'onUpdate:readingScale': vi.fn((value) => {
        props.readingScale = value;
      }),
    });
    const view = setup(PerformerActionBar, props, '顯示設定');
    trigger(view.button(), 'onClick');
    await nextTick();
    const radio = (label) =>
      findAll(
        view.overlayHost,
        (node) =>
          node.props.role === 'radio' && textContent(node).trim() === label,
      )[0];
    trigger(radio('假名'), 'onClick');
    trigger(radio('舞台'), 'onClick');
    await nextTick();
    expect(props.onControl).toHaveBeenCalledWith('reading-furigana');
    expect(props.readingScale).toBe('stage');
    props.frame = {
      ...props.frame,
      playbackStatus: 'seeking',
      positionMs: 1800,
      readingPreparing: true,
    };
    props.pending = true;
    await nextTick();
    expect(view.panel()).toBeTruthy();
    props.pending = false;
    props.frame.readingPreparing = false;
    await nextTick();
    await backgroundScroll(view);
    await explicitDismissal(view);
  });
});

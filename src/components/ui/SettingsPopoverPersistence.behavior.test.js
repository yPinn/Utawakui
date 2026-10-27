import { h, nextTick, reactive } from 'vue';
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
import UiTabs from './UiTabs.vue';
import UiRangeControl from './range/UiRangeControl.vue';
import PlayerToolsPanel from '../playback/PlayerToolsPanel.vue';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import { useMetronome } from '../../composables/useMetronome.js';
import { Headphones, Volume2 } from '../../icons/index.js';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';

for (const [component, path] of [
  [UiRangeControl, './range/UiRangeControl.vue'],
  [TrackTableColumnChooser, '../track/TrackTableColumnChooser.vue'],
  [TrackListDensityMenu, '../track/TrackListDensityMenu.vue'],
  [PerformerActionBar, '../performer/PerformerActionBar.vue'],
  [PerformerDisplayControls, '../performer/PerformerDisplayControls.vue'],
  [PerformerSyncControls, '../performer/PerformerSyncControls.vue'],
  [PlayerToolsPanel, '../playback/PlayerToolsPanel.vue'],
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
    UiTabs,
  }).map(([name, component]) => [component, `./${name}.vue`]),
])
  attachClientRender(component, path, import.meta.url);

let app;
let metronomeForCleanup;
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
  metronomeForCleanup?.reset();
  metronomeForCleanup?.setSoundEnabled(false);
  metronomeForCleanup = null;
  useAppRightDockWidth().setWidth(280);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(component, props, label, slots = {}) {
  const view = mount(component, props, slots);
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

function setupMetronome() {
  vi.useFakeTimers();
  const engine = {
    now: () => Date.now() / 1000,
    resume: vi.fn().mockResolvedValue(),
    scheduleClick: vi.fn(),
  };
  const metronome = useMetronome({ engine });
  metronome.reset();
  metronome.setSoundEnabled(false);
  metronomeForCleanup = metronome;
  const view = setup(PlayerToolsPanel, { open: true, activeTab: 'live' });
  const button = (label) =>
    findAll(
      view.overlayHost,
      (node) => node.type === 'button' && textContent(node).trim() === label,
    )[0];
  return { ...view, metronome, button };
}

describe('settings Popover persistence across consumers', () => {
  it('keeps guide sliders, resets and toggles independent in the dedicated second tab', async () => {
    let rows;
    rows = reactive(
      ['監聽', '擷取'].map((label, index) => ({
        key: label,
        label,
        icon: Headphones,
        deviceName: `${label}裝置`,
        on: true,
        onIcon: Volume2,
        onLabel: `關閉導唱(${label})`,
        onToggle: () => {
          rows[index].on = !rows[index].on;
        },
        sliderValue: index ? 1 : 0.5,
        value: index ? '100%' : '50%',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        sliderLabel: `導唱比例(${label})`,
        marks: [0, 0.25, 0.5, 0.75, 1],
        onSliderInput: (value) => {
          rows[index].sliderValue = Number(value);
          rows[index].value = `${Math.round(Number(value) * 100)}%`;
        },
      })),
    );
    const view = setup(PlayerToolsPanel, {
      open: true,
      activeTab: 'guide',
      hasTrack: true,
      guideVocalVisible: true,
      guideVocalRows: rows,
    });
    await nextTick();
    const range = (label) =>
      findAll(
        view.overlayHost,
        (node) =>
          node.type === 'input' &&
          node.props['aria-label'] === `導唱比例(${label})`,
      )[0];
    trigger(range('監聽'), 'onInput', { target: { value: '0.25' } });
    await nextTick();
    expect(rows.map((row) => row.sliderValue)).toEqual([0.25, 1]);
    trigger(range('監聽'), 'onContextmenu', {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(rows.map((row) => row.sliderValue)).toEqual([0.5, 1]);
    const toggle = findAll(
      view.overlayHost,
      (node) =>
        node.type === 'button' && textContent(node).trim() === '關閉導唱(監聽)',
    )[0];
    trigger(toggle, 'onClick');
    await nextTick();
    expect(rows.map((row) => row.on)).toEqual([false, true]);
    expect(
      findAll(
        view.overlayHost,
        (node) =>
          node.type === 'button' && /^\d+%$/.test(textContent(node).trim()),
      ),
    ).toHaveLength(0);
  });
  it('adjusts click volume with no track, preserves mute, and resets by right click', async () => {
    const { metronome, overlayHost } = setupMetronome();
    await nextTick();
    const range = findAll(
      overlayHost,
      (node) =>
        node.type === 'input' && node.props['aria-label'] === '節拍音量',
    )[0];
    expect(range.props.disabled).toBe(false);
    trigger(range, 'onInput', { target: { value: '0.35' } });
    await nextTick();
    expect(metronome.state.volume).toBe(0.35);
    expect(metronome.state.soundEnabled).toBe(false);
    expect(range.props['aria-valuetext']).toBe('35%');
    trigger(range, 'onContextmenu', {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(metronome.state.volume).toBe(1);
    const meter = findAll(
      overlayHost,
      (node) => node.props['aria-label'] === '每小節拍數',
    )[0];
    expect(textContent(meter)).toContain('BEATS');
    expect(textContent(meter)).not.toContain('每小節');
    expect(textContent(meter)).not.toContain('4/4');
  });
  it('keeps the metronome start control stable across beats and bounds both compact steppers', async () => {
    const { metronome, button, overlayHost } = setupMetronome();
    await nextTick();
    const start = button('啟動節拍器');
    expect(start).toBeTruthy();
    trigger(start, 'onClick');
    await nextTick();
    expect(metronome.state.isRunning).toBe(true);
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(metronome.state.currentBeat).toBe(2);
    const meter = findAll(
      overlayHost,
      (node) => node.props['aria-label'] === '每小節拍數',
    )[0];
    expect(meter).toBeTruthy();
    expect(textContent(meter)).toContain('減少拍數');
    expect(
      findAll(overlayHost, (node) => node.props.role === 'img')[0].props[
        'aria-label'
      ],
    ).toBe('拍點 2/4');
    expect(button('停止節拍器')).toBe(start);
    expect(start.props['aria-pressed']).toBe(true);
    trigger(start, 'onClick');
    expect(metronome.state.isRunning).toBe(false);
    trigger(button('提高 BPM'), 'onClick');
    expect(metronome.state.bpm).toBe(121);
    trigger(button('增加拍數'), 'onClick');
    expect(metronome.state.beatsPerBar).toBe(5);
    trigger(button('開啟節拍器音效'), 'onClick');
    await nextTick();
    expect(button('關閉節拍器音效').props['aria-pressed']).toBe(true);
    expect(
      findAll(
        overlayHost,
        (node) => node.type === 'strong' && textContent(node) === '121',
      ),
    ).toHaveLength(1);
    metronome.setBpm(240);
    metronome.setBeatsPerBar(8);
    await nextTick();
    expect(button('提高 BPM').props.disabled).toBe(true);
    expect(button('增加拍數').props.disabled).toBe(true);
    metronome.setBpm(40);
    metronome.setBeatsPerBar(2);
    await nextTick();
    expect(button('降低 BPM').props.disabled).toBe(true);
    expect(button('減少拍數').props.disabled).toBe(true);
    trigger(button('重設節拍器'), 'onClick');
    expect(metronome.state.bpm).toBe(120);
    expect(metronome.state.beatsPerBar).toBe(4);
  });

  it('retains tap estimation, separate tap clearing and the applied track estimate hint', async () => {
    const { metronome, button, overlayHost } = setupMetronome();
    await nextTick();
    expect(button('清除點擊記錄').props.disabled).toBe(true);
    metronome.setBpm(90);
    trigger(button('點擊測速'), 'onClick');
    await nextTick();
    expect(textContent(overlayHost)).toContain('再點一下');
    vi.advanceTimersByTime(500);
    trigger(button('點擊測速'), 'onClick');
    await nextTick();
    expect(metronome.state.bpm).toBe(120);
    expect(textContent(overlayHost)).not.toContain('已點擊');
    expect(textContent(overlayHost)).not.toContain('再點一下');
    trigger(button('清除點擊記錄'), 'onClick');
    await nextTick();
    expect(metronome.state.tapCount).toBe(0);
    expect(metronome.state.bpm).toBe(120);
    expect(button('清除點擊記錄').props.disabled).toBe(true);
    metronome.reset();
    metronome.applyTrackTempo(150, 0.87);
    await nextTick();
    expect(textContent(overlayHost)).toContain(
      '已套用曲目估算 BPM · 節拍信心 87%',
    );
  });

  it('keeps player adjustments open during lyric scroll and follows Dock resizing while open', async () => {
    const props = reactive({
      open: true,
      'onUpdate:open': (open) => (props.open = open),
    });
    const view = setup(PlayerToolsPanel, props, '工具', {
      trigger: ({ triggerProps }) =>
        h(
          'button',
          { ...triggerProps, onClick: () => (props.open = !props.open) },
          '工具',
        ),
    });
    await nextTick();
    const dock = useAppRightDockWidth();
    dock.setWidth(272);
    await nextTick();
    expect(view.panel().props.style.inlineSize).toBe('272px');
    dock.setWidth(280);
    await nextTick();
    expect(view.panel().props.style.inlineSize).toBe('280px');
    await backgroundScroll(view);
    await explicitDismissal(view);
  });

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

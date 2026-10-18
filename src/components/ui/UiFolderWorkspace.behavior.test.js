import { nextTick, reactive, toRaw } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiFolderArtifactCanvas from './UiFolderArtifactCanvas.vue';
import UiFolderArtifact from './UiFolderArtifact.vue';
import UiPhotoFrame from './UiPhotoFrame.vue';
import UiTextarea from './UiTextarea.vue';
import UiField from './UiField.vue';
import UiIconButton from './UiIconButton.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';
for (const [c, p] of [
  [UiFolderArtifactCanvas, './UiFolderArtifactCanvas.vue'],
  [UiFolderArtifact, './UiFolderArtifact.vue'],
  [UiPhotoFrame, './UiPhotoFrame.vue'],
  [UiTextarea, './UiTextarea.vue'],
  [UiField, './UiField.vue'],
  [UiIconButton, './UiIconButton.vue'],
  [UiTooltipSurface, './tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(c, p, import.meta.url);
// Layout and transition paint are verified in visible Electron; this host owns events.
vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal();
  return {
    ...vue,
    TransitionGroup: {
      props: ['tag'],
      setup:
        (props, { slots }) =>
        () =>
          vue.h(props.tag || 'div', null, slots.default?.()),
    },
  };
});
const find = (root, cls) =>
  findAll(root, (n) =>
    String(n.props.class || '')
      .split(' ')
      .includes(cls),
  );
const flush = async () => {
  await nextTick();
  await nextTick();
};
let observers;
beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
const descriptor = {
  id: 'note',
  kind: 'note',
  label: '便條',
  activatable: true,
  initialPlacement: { region: 'paper', anchor: { x: 0.5, y: 0.8 } },
};
async function canvas(extra = {}) {
  const props = reactive({ artifacts: [{ ...descriptor }], ...extra });
  const mounted = mount(UiFolderArtifactCanvas, props);
  const bounds = find(mounted.root, 'ui-folder-artifact-canvas__bounds')[0];
  bounds.offsetWidth = 600;
  bounds.offsetHeight = 400;
  const item = find(mounted.root, 'ui-folder-artifact-canvas__item')[0];
  item.offsetWidth = 160;
  item.offsetHeight = 100;
  item.setPointerCapture = vi.fn();
  item.releasePointerCapture = vi.fn();
  await flush();
  return { ...mounted, props, item, bounds };
}
const event = (item, extra = {}) => ({
  target: item,
  currentTarget: item,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});

describe('workspace artifact mounted lifecycle', () => {
  it('keeps IME Escape from committing a note before composition ends', async () => {
    const commit = vi.fn();
    const m = mount(UiFolderArtifact, {
      kind: 'note',
      body: '輸入中',
      editing: true,
      onCommit: commit,
    });
    await flush();
    const textarea = findAll(m.root, (n) => n.type === 'textarea')[0];
    for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
      const e = event(textarea, { key: 'Escape', ...composing });
      trigger(textarea, 'onKeydown', e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(commit).not.toHaveBeenCalled();
    trigger(textarea, 'onKeydown', event(textarea, { key: 'Escape' }));
    expect(commit).toHaveBeenCalledExactlyOnceWith('輸入中');
    m.app.unmount();
  });

  it('reprojects on item size changes and disconnects replaced/removed item observations', async () => {
    const m = await canvas();
    const observer = observers[0];
    expect(observer.observe.mock.calls.some(([n]) => toRaw(n) === m.item)).toBe(
      true,
    );
    const before = m.item.props.style['--ui-folder-artifact-y'];
    m.item.offsetHeight = 300;
    observer.cb([]);
    await flush();
    expect(m.item.props.style['--ui-folder-artifact-y']).not.toBe(before);
    m.props.artifacts = [];
    await flush();
    expect(
      observer.unobserve.mock.calls.some(([n]) => toRaw(n) === m.item),
    ).toBe(true);
    m.props.artifacts = [{ ...descriptor }];
    await flush();
    const replacement = find(m.root, 'ui-folder-artifact-canvas__item')[0];
    expect(
      observer.observe.mock.calls.some(([n]) => toRaw(n) === replacement),
    ).toBe(true);
    m.app.unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('distinguishes pointer activation, drag/cancel and pinned keyboard behavior', async () => {
    const activate = vi.fn(),
      layout = vi.fn(),
      pin = vi.fn();
    const m = await canvas({
      onActivate: activate,
      onLayoutChange: layout,
      onPinChange: pin,
    });
    const pointer = event(m.item, {
      pointerId: 1,
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    trigger(m.item, 'onPointerdown', pointer);
    trigger(m.item, 'onPointerup', pointer);
    expect(activate).toHaveBeenCalledWith('note', undefined);
    activate.mockClear();
    trigger(m.item, 'onPointerdown', pointer);
    trigger(m.item, 'onPointermove', { ...pointer, clientX: 55 });
    trigger(m.item, 'onPointerup', { ...pointer, clientX: 55 });
    expect(layout).toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    trigger(m.item, 'onPointerdown', pointer);
    trigger(m.item, 'onPointercancel', pointer);
    expect(activate).not.toHaveBeenCalled();
    const button = findAll(m.root, (n) => n.type === 'button')[0];
    trigger(button, 'onClick', event(button));
    await flush();
    expect(pin.mock.calls[0][0]).toMatchObject({ id: 'note', pinned: true });
    layout.mockClear();
    trigger(m.item, 'onKeydown', event(m.item, { key: 'ArrowRight' }));
    expect(layout).not.toHaveBeenCalled();
    trigger(m.item, 'onKeydown', event(m.item, { key: 'Enter' }));
    expect(activate).toHaveBeenCalledWith('note');
    m.app.unmount();
  });

  it('leaves edit targets and context menu anchors owned by their actual surfaces', async () => {
    const activate = vi.fn(),
      menu = vi.fn();
    const m = await canvas({ onActivate: activate, onContextmenu: menu });
    trigger(
      m.item,
      'onKeydown',
      event(m.item, { key: 'Enter', target: { closest: () => ({}) } }),
    );
    expect(activate).not.toHaveBeenCalled();
    trigger(m.item, 'onContextmenu', event(m.item, { clientX: 0, clientY: 0 }));
    expect(menu.mock.calls[0][0].anchor).toEqual({
      kind: 'element',
      element: m.item,
    });
    trigger(
      m.item,
      'onContextmenu',
      event(m.item, { clientX: 40, clientY: 50 }),
    );
    expect(menu.mock.calls[1][0].anchor).toEqual({
      kind: 'point',
      x: 40,
      y: 50,
    });
    m.app.unmount();
  });

  it('commits a note once per edit session and keeps draft initialization/focus on reopening', async () => {
    const commit = vi.fn();
    const props = reactive({
      kind: 'note',
      body: '初稿',
      editing: true,
      onCommit: commit,
    });
    const m = mount(UiFolderArtifact, props);
    await flush();
    const textarea = () => findAll(m.root, (n) => n.type === 'textarea')[0];
    expect(textarea().props.value).toBe('初稿');
    expect(textarea().focus).toHaveBeenCalled();
    trigger(textarea(), 'onInput', { target: { value: '修正稿' } });
    await flush();
    trigger(textarea(), 'onKeydown', event(textarea(), { key: 'Escape' }));
    trigger(textarea(), 'onBlur', {});
    expect(commit).toHaveBeenCalledExactlyOnceWith('修正稿');
    props.editing = false;
    await flush();
    props.body = '新內容';
    props.editing = true;
    await flush();
    expect(textarea().props.value).toBe('新內容');
    trigger(textarea(), 'onBlur', {});
    expect(commit).toHaveBeenLastCalledWith('新內容');
    m.app.unmount();
  });

  it('restores note overflow projection on content, size and edit transitions', async () => {
    const change = vi.fn();
    const props = reactive({
      kind: 'note',
      body: '長文字'.repeat(40),
      capped: true,
      onOverflowChange: change,
    });
    const m = mount(UiFolderArtifact, props);
    await flush();
    const body = find(m.root, 'ui-folder-artifact__body')[0];
    body.scrollHeight = 300;
    body.clientHeight = 80;
    observers[0].cb([]);
    await flush();
    expect(change).toHaveBeenLastCalledWith(true);
    props.body = '短';
    body.scrollHeight = 20;
    await flush();
    expect(change).toHaveBeenLastCalledWith(false);
    props.body = '長'.repeat(150);
    body.scrollHeight = 300;
    await flush();
    expect(change).toHaveBeenLastCalledWith(true);
    props.editing = true;
    await flush();
    expect(change).toHaveBeenLastCalledWith(false);
    m.app.unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('normalizes stack indices and keeps keyboard intents after reorder/empty recovery', async () => {
    const next = vi.fn(),
      previous = vi.fn();
    const props = reactive({
      kind: 'stack',
      images: [
        { src: '/a', alt: '甲' },
        { src: '/b', alt: '乙' },
      ],
      activeIndex: 9,
      onNext: next,
      onPrevious: previous,
    });
    const m = mount(UiFolderArtifact, props);
    let layers = find(m.root, 'ui-folder-artifact__stack-layer');
    expect(layers).toHaveLength(2);
    trigger(layers[0], 'onKeydown', event(layers[0], { key: 'Enter' }));
    trigger(layers[1], 'onKeydown', event(layers[1], { key: ' ' }));
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    props.images = [];
    await flush();
    expect(find(m.root, 'ui-folder-artifact__stack-layer')).toHaveLength(0);
    props.images = [{ src: '/restored', alt: '恢復' }];
    await flush();
    layers = find(m.root, 'ui-folder-artifact__stack-layer');
    expect(layers).toHaveLength(1);
    expect(layers[0].props['aria-label']).toContain('恢復');
    m.app.unmount();
  });
});

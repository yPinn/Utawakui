import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoModalProduction from './DemoModalProduction.vue';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiField from '../ui/UiField.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { openModalStack } from '../../composables/useUiModalStack.js';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [DemoModalProduction, './DemoModalProduction.vue'],
  [UiModal, '../ui/UiModal.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiSwitch, '../ui/UiSwitch.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);

let listeners;
let mounted;
const select = (root, predicate) => findAll(root, predicate)[0];
const attr = (root, key, value) =>
  select(
    root,
    (n) => key in n.props && (value === undefined || n.props[key] === value),
  );
const click = async (node) => {
  trigger(node, 'onClick', {});
  await nextTick();
};
const escape = async () => {
  for (const listener of [...listeners]) listener({ key: 'Escape' });
  await nextTick();
  await nextTick();
};
const dialogs = () =>
  findAll(mounted.overlayHost, (n) => n.props?.role === 'dialog');
beforeEach(() => {
  listeners = new Set();
  vi.stubGlobal('document', {
    activeElement: null,
    body: hostNode('body'),
    documentElement: hostNode('html'),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal('window', {
    addEventListener: (key, listener) => {
      if (key === 'keydown') listeners.add(listener);
    },
    removeEventListener: (key, listener) => {
      if (key === 'keydown') listeners.delete(listener);
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ fontSize: '16px', getPropertyValue: () => '' }),
  });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  mounted = mount(DemoModalProduction);
});
afterEach(() => {
  mounted.app.unmount();
  expect(openModalStack).toHaveLength(0);
  vi.unstubAllGlobals();
});

describe('formal modal catalogue behavior', () => {
  it('launches every requested case through real buttons and preserves the form draft on reopen', async () => {
    expect(
      findAll(mounted.root, (n) => 'data-modal-launch' in n.props),
    ).toHaveLength(5);
    await click(attr(mounted.root, 'data-modal-launch', 'dialog'));
    let input = attr(mounted.overlayHost, 'id', 'demo-modal-draft');
    // Native text input owns the actual v-model event.
    trigger(input, 'onInput', { target: { value: '日本語' } });
    await nextTick();
    await escape();
    expect(dialogs()).toHaveLength(0);
    await click(attr(mounted.root, 'data-modal-launch', 'dialog'));
    input = attr(mounted.overlayHost, 'id', 'demo-modal-draft');
    expect(input.props.value).toBe('日本語');
    await click(attr(mounted.overlayHost, 'data-modal-finish'));
    expect(dialogs()).toHaveLength(0);
  });

  it('renders the document as selectable structured reading with a fixed footer', async () => {
    await click(attr(mounted.root, 'data-modal-launch', 'document'));
    expect(dialogs()[0].props.class).toContain('ui-modal--document');
    expect(dialogs()[0].props.class).toContain('ui-modal--fixed-height');
    expect(findAll(mounted.overlayHost, (n) => n.type === 'h3')).toHaveLength(
      9,
    );
    expect(textContent(mounted.overlayHost)).toContain(
      'SummerLiveSessionFinalMixWithoutSpaces',
    );
    const backdrop = select(
      mounted.overlayHost,
      (n) => n.props.class === 'ui-modal-backdrop',
    );
    trigger(backdrop, 'onClick', { target: backdrop, currentTarget: backdrop });
    await nextTick();
    expect(dialogs()).toHaveLength(1);
    await escape();
    expect(dialogs()).toHaveLength(0);
  });

  it('renders media with an accessible title and no footer', async () => {
    await click(attr(mounted.root, 'data-modal-launch', 'media'));
    expect(dialogs()[0].props.class).toContain('ui-modal--media');
    expect(dialogs()[0].props['aria-label']).toBe('Media・圖片');
    expect(
      select(mounted.overlayHost, (n) => n.type === 'img').props.alt,
    ).toContain('靜態預覽');
    expect(attr(mounted.overlayHost, 'data-modal-finish')).toBeUndefined();
    expect(
      findAll(mounted.overlayHost, (n) => n.props.class === 'ui-modal__footer'),
    ).toHaveLength(0);
  });

  it('blocks every close path until unlocked, then restores all paths and resets on reopen', async () => {
    await click(attr(mounted.root, 'data-modal-launch', 'locked'));
    const headerClose = () =>
      select(
        mounted.overlayHost,
        (n) => n.type === 'button' && textContent(n) === '關閉',
      );
    const finish = () => attr(mounted.overlayHost, 'data-modal-finish');
    expect(headerClose().props.disabled).toBe(true);
    expect(finish().props.disabled).toBe(true);
    await click(headerClose());
    await click(finish());
    await escape();
    const backdrop = select(
      mounted.overlayHost,
      (n) => n.props.class === 'ui-modal-backdrop',
    );
    trigger(backdrop, 'onClick', { target: backdrop, currentTarget: backdrop });
    await nextTick();
    expect(dialogs()).toHaveLength(1);
    trigger(
      attr(mounted.overlayHost, 'id', 'demo-modal-close-lock'),
      'onChange',
      { target: { checked: false } },
    );
    await nextTick();
    expect(headerClose().props.disabled).toBe(false);
    expect(finish().props.disabled).toBe(false);
    expect(textContent(mounted.overlayHost)).toContain('已恢復關閉操作');
    await escape();
    expect(dialogs()).toHaveLength(0);
    await click(attr(mounted.root, 'data-modal-launch', 'locked'));
    expect(finish().props.disabled).toBe(true);
  });

  it('closes only the top modal on Escape and clears the shared stack on exit', async () => {
    await click(attr(mounted.root, 'data-modal-launch', 'stack'));
    await click(attr(mounted.overlayHost, 'data-modal-child-launch'));
    expect(dialogs()).toHaveLength(2);
    expect(openModalStack).toHaveLength(2);
    await escape();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].props['aria-label']).toBe('堆疊對話框');
    await click(attr(mounted.overlayHost, 'data-modal-child-launch'));
    await click(attr(mounted.overlayHost, 'data-modal-child-finish'));
    expect(dialogs()).toHaveLength(1);
    await escape();
    expect(dialogs()).toHaveLength(0);
  });

  it.each(['header', 'footer', 'backdrop'])(
    'restores the %s close path after unlocking',
    async (path) => {
      await click(attr(mounted.root, 'data-modal-launch', 'locked'));
      trigger(
        attr(mounted.overlayHost, 'id', 'demo-modal-close-lock'),
        'onChange',
        { target: { checked: false } },
      );
      await nextTick();
      if (path === 'header') {
        await click(
          select(
            mounted.overlayHost,
            (n) => n.type === 'button' && textContent(n) === '關閉',
          ),
        );
      } else if (path === 'footer') {
        await click(attr(mounted.overlayHost, 'data-modal-finish'));
      } else {
        const backdrop = select(
          mounted.overlayHost,
          (n) => n.props.class === 'ui-modal-backdrop',
        );
        trigger(backdrop, 'onClick', {
          target: backdrop,
          currentTarget: backdrop,
        });
        await nextTick();
      }
      expect(dialogs()).toHaveLength(0);
    },
  );

  it('restores the child opener inside its parent, then the outer catalogue launcher', async () => {
    const origin = attr(mounted.root, 'data-modal-launch', 'stack');
    origin.isConnected = true;
    origin.focus.mockImplementation(() => {
      document.activeElement = origin;
    });
    document.activeElement = origin;
    await click(origin);
    // Host nodes are plain objects; emulate DOM identity across Vue's ref proxy.
    const parentDialog = dialogs()[0];
    parentDialog.contains = (node) =>
      findAll(parentDialog, (candidate) => candidate === node).length > 0;
    const childOrigin = attr(mounted.overlayHost, 'data-modal-child-launch');
    childOrigin.isConnected = true;
    childOrigin.focus.mockImplementation(() => {
      document.activeElement = childOrigin;
    });
    document.activeElement = childOrigin;
    await click(childOrigin);
    expect(openModalStack[0].contains(childOrigin)).toBe(true);
    document.activeElement = dialogs()[1];
    await escape();
    expect(childOrigin.focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(childOrigin);
    expect(origin.focus).not.toHaveBeenCalled();
    await escape();
    expect(origin.focus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(origin);
  });
});

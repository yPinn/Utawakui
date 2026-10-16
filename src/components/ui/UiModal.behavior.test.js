import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiIconButton from './UiIconButton.vue';
import UiModal from './UiModal.vue';
import UiScrollRegion from './UiScrollRegion.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { UI_OVERLAY_HOST_KEY } from '../../composables/useUiOverlayHost.js';

const { createRenderer, h, nextTick, ref, ssrContextKey } = Vue;

function attachClientRender(component, filename) {
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: filename });
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata: script.bindings,
  });
  component.render = new Function('Vue', code)(Vue);
}

attachClientRender(UiIconButton, './UiIconButton.vue');
attachClientRender(UiModal, './UiModal.vue');
attachClientRender(UiScrollRegion, './UiScrollRegion.vue');
attachClientRender(UiTooltipSurface, './tooltip/UiTooltipSurface.vue');

function hostNode(type, text = '') {
  return {
    type,
    text,
    props: {},
    children: [],
    parent: null,
    focus: vi.fn(),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    contains(node) {
      return node === this;
    },
  };
}

let body;
const namedHosts = new Map();
const renderer = createRenderer({
  patchProp(element, key, _previousValue, nextValue) {
    element.props[key] = nextValue;
  },
  insert(child, parent, anchor = null) {
    child.parent = parent;
    if (!anchor) parent.children.push(child);
    else parent.children.splice(parent.children.indexOf(anchor), 0, child);
  },
  remove(child) {
    const index = child.parent?.children.indexOf(child) ?? -1;
    if (index >= 0) child.parent.children.splice(index, 1);
  },
  createElement(type) {
    return hostNode(type);
  },
  createText(text) {
    return hostNode('text', text);
  },
  createComment(text) {
    return hostNode('comment', text);
  },
  setText(node, text) {
    node.text = text;
  },
  setElementText(element, text) {
    const child = hostNode('text', text);
    child.parent = element;
    element.children = [child];
  },
  parentNode(node) {
    return node.parent;
  },
  nextSibling(node) {
    const siblings = node.parent?.children ?? [];
    return siblings[siblings.indexOf(node) + 1] ?? null;
  },
  querySelector(selector) {
    if (selector === 'body') return body;
    return namedHosts.get(selector) ?? null;
  },
  setScopeId() {},
  cloneNode(node) {
    return { ...node, props: { ...node.props }, children: [...node.children] };
  },
  insertStaticContent(content, parent) {
    const node = hostNode('static', content);
    this.insert(node, parent);
    return [node, node];
  },
});

function findAll(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, matches);
  return matches;
}

function textContent(node) {
  return node.type === 'text'
    ? node.text
    : (node.children ?? []).map(textContent).join('');
}

describe('UiModal behavior', () => {
  let listeners;
  let animationFrames;
  let focusOrigin;

  beforeEach(() => {
    body = hostNode('body');
    listeners = new Map();
    animationFrames = [];
    focusOrigin = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal('window', {
      addEventListener: vi.fn((name, handler) => {
        listeners.set(name, [...(listeners.get(name) ?? []), handler]);
      }),
      removeEventListener: vi.fn((name, handler) => {
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter(
            (registered) => registered !== handler,
          ),
        );
      }),
      requestAnimationFrame: vi.fn((callback) =>
        animationFrames.push(callback),
      ),
    });
    vi.stubGlobal('document', { activeElement: focusOrigin });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('captures focus when mounted open and restores it on unmount', async () => {
    const app = renderer.createApp({
      setup: () => () => h(UiModal, { open: true, title: '已開啟的確認' }),
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(hostNode('root'));
    await nextTick();
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    animationFrames.splice(0).forEach((callback) => callback());
    app.unmount();
    expect(dialog.focus).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
  });

  it('ignores an earlier open cycle when the modal reopens before its focus frame', async () => {
    const open = ref(false);
    const app = renderer.createApp({
      setup: () => () => h(UiModal, { open: open.value, title: '確認操作' }),
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(hostNode('root'));
    await nextTick();
    open.value = true;
    await nextTick();
    open.value = false;
    await nextTick();
    open.value = true;
    await nextTick();
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    animationFrames.splice(0).forEach((callback) => callback());
    app.unmount();
    expect(dialog.focus).toHaveBeenCalledOnce();
  });

  it('skips hidden and disabled fields when choosing initial focus', async () => {
    const open = ref(false);
    const app = renderer.createApp({
      setup: () => () => h(UiModal, { open: open.value, title: '編輯內容' }),
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(hostNode('root'));
    open.value = true;
    await nextTick();
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    const disabled = { disabled: true, focus: vi.fn() };
    const hidden = { getClientRects: () => [], focus: vi.fn() };
    const field = { focus: vi.fn() };
    dialog.querySelector.mockReturnValue(disabled);
    dialog.querySelectorAll.mockReturnValue([disabled, hidden, field]);
    animationFrames.splice(0).forEach((callback) => callback());
    app.unmount();
    expect(disabled.focus).not.toHaveBeenCalled();
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(field.focus).toHaveBeenCalledOnce();
  });

  it('does not restore page focus when a lower modal unmounts beneath a dialog', async () => {
    const lowerMounted = ref(true);
    const app = renderer.createApp({
      setup: () => () => [
        lowerMounted.value ? h(UiModal, { open: true, title: '底層' }) : null,
        h(UiModal, { open: true, title: '頂層' }),
      ],
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(hostNode('root'));
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    lowerMounted.value = false;
    await nextTick();
    const callsWhileTopIsOpen = focusOrigin.focus.mock.calls.length;
    app.unmount();
    expect(callsWhileTopIsOpen).toBe(0);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    'wraps Tab (shift=%s, dialog focused=%s) past unavailable controls',
    async (shiftKey, dialogFocused) => {
      const app = renderer.createApp({
        setup: () => () => h(UiModal, { open: true, title: '確認操作' }),
      });
      app.provide(ssrContextKey, { modules: new Set() });
      app.provide(UI_OVERLAY_HOST_KEY, body);
      app.mount(hostNode('root'));
      await nextTick();
      const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
      const disabled = { disabled: true, focus: vi.fn() };
      const hidden = { getClientRects: () => [], focus: vi.fn() };
      const first = { focus: vi.fn() };
      const last = { focus: vi.fn() };
      dialog.querySelectorAll.mockReturnValue([disabled, first, last, hidden]);
      if (dialogFocused) document.activeElement = dialog;
      dialog.contains = vi.fn(() => dialogFocused);
      const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() };
      listeners.get('keydown')[0](event);
      app.unmount();
      expect((shiftKey ? last : first).focus).toHaveBeenCalledOnce();
      expect(disabled.focus).not.toHaveBeenCalled();
      expect(hidden.focus).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])(
    'contains Tab while every control is busy (shift=%s)',
    async (shiftKey) => {
      const app = renderer.createApp({
        setup: () => () =>
          h(UiModal, { open: true, title: '儲存中', closeDisabled: true }),
      });
      app.provide(ssrContextKey, { modules: new Set() });
      app.provide(UI_OVERLAY_HOST_KEY, body);
      app.mount(hostNode('root'));
      await nextTick();
      const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
      const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() };
      listeners.get('keydown')[0](event);
      app.unmount();
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(dialog.focus).toHaveBeenCalledOnce();
    },
  );

  it('closes on Escape and restores focus to the opening control', async () => {
    const open = ref(false);
    const close = vi.fn(() => {
      open.value = false;
    });
    const Root = {
      setup: () => () =>
        h(UiModal, { open: open.value, title: '測試視窗', onClose: close }),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);

    open.value = true;
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    listeners.get('keydown')[0]({ key: 'Escape' });
    await nextTick();
    await nextTick();

    expect(close).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    expect(findAll(body, (node) => node.props?.role === 'dialog')).toHaveLength(
      0,
    );
    app.unmount();
  });

  it('keeps backdrop clicks inert, closes from the close button, and wraps Tab focus', async () => {
    const close = vi.fn();
    const Root = {
      setup: () => () =>
        h(UiModal, { open: true, title: '測試視窗', onClose: close }),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const backdrop = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal-backdrop'),
    )[0];
    expect(backdrop.props.onClick).toBeUndefined();
    expect(close).not.toHaveBeenCalled();

    const closeButton = findAll(
      body,
      (node) => node.type === 'button' && textContent(node) === '關閉',
    )[0];
    closeButton.props.onClick();
    expect(close).toHaveBeenCalledOnce();

    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    const first = { focus: vi.fn() };
    const last = { focus: vi.fn() };
    dialog.querySelectorAll.mockReturnValue([first, last]);
    dialog.contains = vi.fn(() => false);
    const tabEvent = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    listeners.get('keydown')[0](tabEvent);
    expect(tabEvent.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();

    app.unmount();
  });

  it('lets only an opted-in media backdrop self-click request close', async () => {
    const close = vi.fn();
    const Root = {
      setup: () => () =>
        h(UiModal, {
          open: true,
          title: '頁面照片',
          presentation: 'media',
          dismissOnBackdrop: true,
          onClose: close,
        }),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const backdrop = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal-backdrop'),
    )[0];
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];

    backdrop.props.onClick({ target: dialog, currentTarget: backdrop });
    expect(close).not.toHaveBeenCalled();

    backdrop.props.onClick({ target: backdrop, currentTarget: backdrop });
    expect(close).toHaveBeenCalledOnce();

    app.unmount();
  });

  it('keeps media close above remove in both DOM and keyboard order', async () => {
    const Root = {
      setup: () => () =>
        h(
          UiModal,
          {
            open: true,
            title: '頁面照片',
            presentation: 'media',
          },
          {
            'header-actions': () => h('button', null, '刪除照片'),
            default: () => h('img', { alt: '頁面照片' }),
          },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    const actionLabels = findAll(dialog, (node) => node.type === 'button').map(
      textContent,
    );
    app.unmount();
    expect(actionLabels.slice(0, 2)).toEqual(['關閉', '刪除照片']);
  });

  it('disables every close path while a caller-owned commit is in progress', async () => {
    const close = vi.fn();
    const Root = {
      setup: () => () =>
        h(UiModal, {
          open: true,
          title: '儲存中',
          presentation: 'media',
          dismissOnBackdrop: true,
          closeDisabled: true,
          onClose: close,
        }),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const closeButton = findAll(
      body,
      (node) => node.type === 'button' && textContent(node) === '關閉',
    )[0];
    expect(closeButton.props.disabled).toBe(true);
    closeButton.props.onClick();
    const backdrop = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal-backdrop'),
    )[0];
    backdrop.props.onClick({ target: backdrop, currentTarget: backdrop });
    listeners.get('keydown')[0]({ key: 'Escape' });

    expect(close).not.toHaveBeenCalled();
    app.unmount();
  });

  it('lets only the top-most modal handle Escape when dialogs overlap', async () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const Root = {
      setup: () => () => [
        h(UiModal, {
          open: true,
          title: '底層視窗',
          onClose: closeFirst,
        }),
        h(UiModal, {
          open: true,
          title: '頂層視窗',
          onClose: closeSecond,
        }),
      ],
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    for (const listener of listeners.get('keydown')) {
      listener({ key: 'Escape' });
    }

    expect(closeFirst).not.toHaveBeenCalled();
    expect(closeSecond).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('paints the last-opened modal above later-mounted teleport anchors', async () => {
    const confirmationOpen = ref(false);
    const previewOpen = ref(true);
    const closeConfirmation = vi.fn(() => {
      confirmationOpen.value = false;
    });
    const closePreview = vi.fn(() => {
      previewOpen.value = false;
    });
    const Root = {
      setup: () => () => [
        h(UiModal, {
          open: confirmationOpen.value,
          title: '移除照片？',
          onClose: closeConfirmation,
        }),
        h(UiModal, {
          open: previewOpen.value,
          title: '頁面照片',
          onClose: closePreview,
        }),
      ],
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    confirmationOpen.value = true;
    await nextTick();

    const dialogs = findAll(body, (node) => node.props?.role === 'dialog');
    const confirmation = dialogs.find(
      (dialog) => dialog.props['aria-label'] === '移除照片？',
    );
    const preview = dialogs.find(
      (dialog) => dialog.props['aria-label'] === '頁面照片',
    );

    expect(
      String(confirmation.parent.props.style['--ui-modal-stack-index']),
    ).toBe('1');
    expect(String(preview.parent.props.style['--ui-modal-stack-index'])).toBe(
      '0',
    );

    for (const listener of listeners.get('keydown')) {
      listener({ key: 'Escape' });
    }
    await nextTick();

    expect(closeConfirmation).toHaveBeenCalledOnce();
    expect(closePreview).not.toHaveBeenCalled();
    const remainingBackdrop = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal-backdrop'),
    )[0];
    expect(
      String(remainingBackdrop.props.style['--ui-modal-stack-index']),
    ).toBe('0');

    app.unmount();
  });

  it('applies fixed workspace height only when explicitly requested', async () => {
    const Root = {
      setup: () => () => [
        h(UiModal, {
          open: true,
          title: '內容高度視窗',
        }),
        h(UiModal, {
          open: true,
          title: '固定高度視窗',
          fixedHeight: true,
        }),
      ],
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const dialogs = findAll(body, (node) => node.props?.role === 'dialog');
    expect(String(dialogs[0].props.class)).not.toContain(
      'ui-modal--fixed-height',
    );
    expect(String(dialogs[1].props.class)).toContain('ui-modal--fixed-height');

    app.unmount();
  });

  it('lets a caller cap block size independently from inline size', async () => {
    const Root = {
      setup: () => () => [
        h(UiModal, {
          open: true,
          title: '預設寬視窗',
          size: 'wide',
        }),
        h(UiModal, {
          open: true,
          title: '較短寬視窗',
          size: 'wide',
          maxBlockSize: 'medium',
        }),
      ],
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const dialogs = findAll(body, (node) => node.props?.role === 'dialog');
    expect(String(dialogs[0].props.class)).not.toContain(
      'ui-modal--max-block-medium',
    );
    expect(String(dialogs[1].props.class)).toContain(
      'ui-modal--max-block-medium',
    );
    expect(String(dialogs[1].props.class)).toContain('ui-modal--wide');

    app.unmount();
  });

  it('disables text selection only when the caller opts into a decision surface', async () => {
    const Root = {
      setup: () => () => [
        h(UiModal, {
          open: true,
          title: '一般內容',
        }),
        h(UiModal, {
          open: true,
          title: '確認操作',
          selectable: false,
        }),
      ],
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const dialogs = findAll(body, (node) => node.props?.role === 'dialog');
    expect(String(dialogs[0].props.class)).not.toContain(
      'ui-modal--select-none',
    );
    expect(String(dialogs[1].props.class)).toContain('ui-modal--select-none');

    app.unmount();
  });

  it('renders an optional footer outside the body scroll region', async () => {
    const Root = {
      setup: () => () =>
        h(
          UiModal,
          { open: true, title: '固定操作視窗' },
          {
            default: () => h('p', { id: 'modal-content' }, '可捲動內容'),
            footer: () => h('button', { id: 'modal-action' }, '儲存'),
          },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();

    const scrollRegion = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal__body'),
    )[0];
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    const footer = findAll(body, (node) =>
      String(node.props?.class || '').includes('ui-modal__footer'),
    )[0];

    expect(String(dialog.props.class)).toContain('ui-modal--with-footer');
    expect(footer).toBeDefined();
    expect(footer.parent).toBe(scrollRegion.parent);
    expect(findAll(scrollRegion, (node) => node === footer)).toHaveLength(0);

    app.unmount();
  });

  it('mounts on the renderer root host and hands it to its content', async () => {
    const shellHost = hostNode('div');
    const libraryHost = hostNode('div');
    namedHosts.set('#app-shell-overlay', shellHost);
    namedHosts.set('#library-overlay', libraryHost);
    let contentHost = null;
    const Content = {
      setup() {
        contentHost = Vue.inject(UI_OVERLAY_HOST_KEY);
        return () => h('p', '內容');
      },
    };
    const Root = {
      setup: () => () =>
        h(UiModal, { open: true, title: '曲目資訊' }, () => h(Content)),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, '#library-overlay');
    app.mount(root);
    await nextTick();

    expect(
      findAll(shellHost, (node) => node.props?.role === 'dialog'),
    ).toHaveLength(1);
    expect(
      findAll(libraryHost, (node) => node.props?.role === 'dialog'),
    ).toHaveLength(0);
    expect(contentHost).toBe('#app-shell-overlay');

    app.unmount();
    namedHosts.clear();
  });
});

import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiIconButton from './UiIconButton.vue';
import UiModal from './UiModal.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';

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
    return selector === 'body' ? body : null;
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
    app.mount(root);
    await nextTick();

    for (const listener of listeners.get('keydown')) {
      listener({ key: 'Escape' });
    }

    expect(closeFirst).not.toHaveBeenCalled();
    expect(closeSecond).toHaveBeenCalledOnce();
    app.unmount();
  });
});

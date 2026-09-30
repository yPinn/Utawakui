import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoCandidateModal from './DemoCandidateModal.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';

const { createRenderer, h, nextTick, shallowRef, ssrContextKey } = Vue;

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

attachClientRender(UiIconButton, '../ui/UiIconButton.vue');
attachClientRender(DemoCandidateModal, './DemoCandidateModal.vue');
attachClientRender(UiScrollRegion, '../ui/UiScrollRegion.vue');
attachClientRender(UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue');

function findAll(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, matches);
  return matches;
}

function hostNode(type, text = '') {
  const node = {
    type,
    text,
    props: {},
    children: [],
    parent: null,
    open: false,
    focus: vi.fn(),
    getAttribute(name) {
      return this.props[name] ?? null;
    },
    hasAttribute(name) {
      return name in this.props;
    },
    contains(candidate) {
      return candidate === this || Boolean(candidate?.parent);
    },
    querySelector(selector) {
      if (selector !== '[autofocus]') return null;
      return (
        findAll(
          this,
          (candidate) => 'autofocus' in (candidate.props ?? {}),
        )[0] ?? null
      );
    },
    querySelectorAll() {
      return findAll(this, (candidate) => {
        const isNativeControl = [
          'button',
          'input',
          'select',
          'textarea',
        ].includes(candidate.type);
        const isExplicitTabStop =
          'tabindex' in (candidate.props ?? {}) &&
          candidate.props.tabindex !== '-1';
        return (
          (isNativeControl || isExplicitTabStop) &&
          !('disabled' in (candidate.props ?? {}))
        );
      });
    },
  };
  if (type === 'dialog') {
    node.showModal = vi.fn(() => {
      node.open = true;
    });
    node.close = vi.fn(() => {
      node.open = false;
    });
  }
  node.scrollTop = 0;
  node.scrollTo = vi.fn((options) => {
    node.scrollTop =
      typeof options === 'object' ? (options.top ?? node.scrollTop) : options;
  });
  return node;
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

describe('DemoCandidateModal behavior', () => {
  let focusOrigin;

  beforeEach(() => {
    body = hostNode('body');
    focusOrigin = { isConnected: true, focus: vi.fn() };
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('document', { activeElement: focusOrigin });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens a controlled native modal, uses the medium geometry default, and restores focus', async () => {
    const open = shallowRef(false);
    const close = vi.fn(() => {
      open.value = false;
    });
    const Root = {
      setup: () => () =>
        h(
          DemoCandidateModal,
          {
            open: open.value,
            title: '選擇曲目',
            onClose: close,
          },
          {
            default: () => h('input', { autofocus: true }),
            footer: () => h('button', '套用'),
          },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount(root);

    open.value = true;
    await nextTick();
    await nextTick();

    const dialog = findAll(body, (node) => node.type === 'dialog')[0];
    const title = findAll(body, (node) => node.type === 'h2')[0];
    const autofocusTarget = findAll(
      body,
      (node) => 'autofocus' in (node.props ?? {}),
    )[0];

    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.props['aria-labelledby']).toBe(title.props.id);
    expect(dialog.props['aria-label']).toBeUndefined();
    expect(dialog.props['data-modal-purpose']).toBeUndefined();
    expect(dialog.props['data-modal-size']).toBe('medium');
    expect(autofocusTarget.focus).toHaveBeenCalledOnce();

    open.value = false;
    await nextTick();
    await nextTick();

    expect(dialog.close).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps dismissal controlled and delegates Escape to the top-layer dialog cancel event', async () => {
    const close = vi.fn();
    const Root = {
      setup: () => () =>
        h(
          DemoCandidateModal,
          {
            open: true,
            title: '重新命名場景',
            size: 'medium',
            onClose: close,
          },
          { default: () => h('p', '表單內容') },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount(root);
    await nextTick();
    await nextTick();

    const dialog = findAll(body, (node) => node.type === 'dialog')[0];
    const cancelEvent = { preventDefault: vi.fn() };
    dialog.props.onCancel(cancelEvent);

    expect(cancelEvent.preventDefault).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(dialog.props['data-modal-size']).toBe('medium');

    const closeButton = findAll(
      body,
      (node) =>
        node.type === 'button' &&
        String(node.props?.class ?? '').includes('demo-candidate-modal__close'),
    )[0];
    closeButton.props.onClick();
    expect(close).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('cycles Tab at the dialog boundaries without adding a global keydown listener', async () => {
    const Root = {
      setup: () => () =>
        h(
          DemoCandidateModal,
          {
            open: true,
            title: '重新命名場景',
          },
          {
            default: () => h('input', { autofocus: true }),
            footer: () => [h('button', '取消'), h('button', '儲存')],
          },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount(root);
    await nextTick();
    await nextTick();

    const dialog = findAll(body, (node) => node.type === 'dialog')[0];
    const controls = dialog.querySelectorAll();
    const first = controls[0];
    const last = controls.at(-1);
    const forwardEvent = {
      key: 'Tab',
      shiftKey: false,
      defaultPrevented: false,
      target: last,
      preventDefault: vi.fn(),
    };
    dialog.props.onKeydown(forwardEvent);

    expect(forwardEvent.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();

    const backwardEvent = {
      key: 'Tab',
      shiftKey: true,
      defaultPrevented: false,
      target: first,
      preventDefault: vi.fn(),
    };
    dialog.props.onKeydown(backwardEvent);

    expect(backwardEvent.preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('returns a newly opened body to the top without resetting content updates while open', async () => {
    const open = shallowRef(false);
    const copy = shallowRef('初始內容');
    const Root = {
      setup: () => () =>
        h(
          DemoCandidateModal,
          {
            open: open.value,
            title: '閱讀較長內容',
          },
          { default: () => h('p', copy.value) },
        ),
    };
    const root = hostNode('root');
    const app = renderer.createApp(Root);
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount(root);

    const scrollBody = findAll(body, (node) =>
      String(node.props?.class ?? '').includes(
        'demo-candidate-modal__body-viewport',
      ),
    )[0];
    scrollBody.scrollTop = 144;

    open.value = true;
    await nextTick();
    await nextTick();
    expect(scrollBody.scrollTop).toBe(0);

    scrollBody.scrollTop = 96;
    copy.value = '同一次開啟期間更新內容';
    await nextTick();
    expect(scrollBody.scrollTop).toBe(96);

    open.value = false;
    await nextTick();
    await nextTick();
    scrollBody.scrollTop = 72;

    open.value = true;
    await nextTick();
    await nextTick();
    expect(scrollBody.scrollTop).toBe(0);
    app.unmount();
  });
});

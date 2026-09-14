import fs from 'node:fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoCandidateActionMenu from './DemoCandidateActionMenu.vue';

const { createRenderer, h, nextTick, ssrContextKey } = Vue;

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

attachClientRender(DemoCandidateActionMenu, './DemoCandidateActionMenu.vue');

let activeElement;

function hostNode(type, text = '') {
  const identity = {};
  const node = {
    identity,
    type,
    text,
    props: {},
    children: [],
    parent: null,
    rect: { left: 24, top: 24, right: 244, bottom: 56, width: 220, height: 32 },
    focus: vi.fn(() => {
      activeElement = node;
    }),
    getBoundingClientRect() {
      return this.rect;
    },
    contains(target) {
      if (target?.identity === this.identity) return true;
      return this.children.some((child) => child.contains?.(target));
    },
  };
  return Vue.markRaw(node);
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

function keyEvent(key, overrides = {}) {
  return {
    key,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('DemoCandidateActionMenu behavior', () => {
  let animationFrames;
  let listeners;
  let focusOrigin;

  beforeEach(() => {
    body = hostNode('body');
    animationFrames = [];
    listeners = new Map();
    focusOrigin = hostNode('button');
    focusOrigin.isConnected = true;
    activeElement = focusOrigin;

    const documentElement = hostNode('html');
    vi.stubGlobal('document', {
      body,
      documentElement,
      get activeElement() {
        return activeElement;
      },
    });
    vi.stubGlobal('window', {
      innerWidth: 320,
      innerHeight: 240,
      addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      removeEventListener: vi.fn((name) => listeners.delete(name)),
      requestAnimationFrame: vi.fn((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
      cancelAnimationFrame: vi.fn(),
      getComputedStyle: vi.fn((element) => ({
        direction: element?.props?.dir || 'ltr',
        fontSize: '16px',
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mountMenu(props = {}) {
    const root = hostNode('root');
    const app = renderer.createApp({
      setup: () => () =>
        h(DemoCandidateActionMenu, {
          open: true,
          x: 24,
          y: 24,
          items: [
            { key: 'rename', label: '重新命名' },
            { key: 'export', label: '匯出設定' },
          ],
          'aria-label': '曲目操作',
          ...props,
        }),
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.mount(root);
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();
    return { app, root };
  }

  it('forwards the accessible name to the teleported menu and focuses its first item', async () => {
    const { app } = await mountMenu();
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];
    const items = findAll(body, (node) => node.props.role === 'menuitem');

    expect(menu.props['aria-label']).toBe('曲目操作');
    expect(items[0].props.tabindex).toBe(0);
    expect(items[0].focus).toHaveBeenCalled();
    expect(items[1].props.tabindex).toBe(-1);
    app.unmount();
  });

  it('uses roving focus, typeahead, and focusable aria-disabled items without activating them', async () => {
    const select = vi.fn();
    const { app } = await mountMenu({
      items: [
        { key: 'rename', label: '重新命名' },
        { key: 'disabled', label: '目前無法使用', disabled: true },
        { key: 'export', label: '匯出設定', value: 'export' },
      ],
      onSelect: select,
    });
    const items = findAll(body, (node) => node.props.role === 'menuitem');

    const down = keyEvent('ArrowDown');
    items[0].props.onKeydown(down);
    await nextTick();
    expect(down.preventDefault).toHaveBeenCalled();
    expect(items[1].props['aria-disabled']).toBe('true');
    expect(items[1].focus).toHaveBeenCalled();

    items[1].props.onClick(keyEvent('Enter'));
    expect(select).not.toHaveBeenCalled();

    const typeahead = keyEvent('匯');
    items[1].props.onKeydown(typeahead);
    await nextTick();
    expect(items[2].focus).toHaveBeenCalled();
    app.unmount();
  });

  it('opens a submenu with the directional key and returns to its parent', async () => {
    const { app } = await mountMenu({
      items: [
        {
          key: 'more',
          label: '新增至播放清單',
          children: [
            { key: 'first', label: '演出曲目' },
            { key: 'second', label: '練習清單' },
          ],
        },
      ],
    });
    let items = findAll(body, (node) => node.props.role === 'menuitem');

    items[0].props.onKeydown(keyEvent('ArrowRight'));
    await nextTick();
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();
    const menus = findAll(body, (node) => node.props.role === 'menu');
    items = findAll(body, (node) => node.props.role === 'menuitem');
    expect(menus).toHaveLength(2);
    expect(items[1].focus).toHaveBeenCalled();

    const back = keyEvent('ArrowLeft');
    items[1].props.onKeydown(back);
    await nextTick();
    expect(back.preventDefault).toHaveBeenCalled();
    expect(items[0].focus).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('restores the trigger for Escape and Tab without trapping page navigation', async () => {
    const close = vi.fn();
    const { app } = await mountMenu({ onClose: close });
    const item = findAll(body, (node) => node.props.role === 'menuitem')[0];

    const escape = keyEvent('Escape');
    item.props.onKeydown(escape);
    await nextTick();
    expect(close).toHaveBeenCalled();
    expect(focusOrigin.focus).toHaveBeenCalled();

    focusOrigin.focus.mockClear();
    const tab = keyEvent('Tab');
    item.props.onKeydown(tab);
    await nextTick();
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(focusOrigin.focus).toHaveBeenCalled();
    app.unmount();
  });

  it('dismisses from outside pointer, context menu, scroll, and resize without returning focus', async () => {
    const close = vi.fn();
    const { app } = await mountMenu({ onClose: close });
    focusOrigin.focus.mockClear();
    const outside = hostNode('div');

    listeners.get('pointerdown')({ target: outside });
    listeners.get('contextmenu')({ target: outside });
    listeners.get('scroll')();
    listeners.get('resize')();

    expect(close).toHaveBeenCalledTimes(4);
    expect(focusOrigin.focus).not.toHaveBeenCalled();
    app.unmount();
  });

  it('keeps internal overflow scrolling open and dismisses only external scrolling', async () => {
    const close = vi.fn();
    const { app } = await mountMenu({ onClose: close });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];

    expect(close).not.toHaveBeenCalled();
    listeners.get('scroll')({ target: menu });
    expect(close).not.toHaveBeenCalled();

    listeners.get('scroll')({ target: hostNode('section') });
    expect(close).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('aligns submenu surfaces and repositions the submenu while its root menu scrolls', async () => {
    window.innerWidth = 800;
    window.innerHeight = 600;
    const close = vi.fn();
    const { app } = await mountMenu({
      onClose: close,
      items: [
        {
          key: 'more',
          label: '新增至播放清單',
          submenuWidth: 120,
          children: [{ key: 'first', label: '演出曲目' }],
        },
      ],
    });
    const rootMenu = findAll(body, (node) => node.props.role === 'menu')[0];
    const parentItem = findAll(
      rootMenu,
      (node) => node.props.role === 'menuitem',
    )[0];
    rootMenu.rect = {
      left: 100,
      top: 96,
      right: 320,
      bottom: 224,
      width: 220,
      height: 128,
    };
    parentItem.rect = {
      left: 105,
      top: 140,
      right: 315,
      bottom: 172,
      width: 210,
      height: 32,
    };

    parentItem.props.onKeydown(keyEvent('ArrowRight'));
    await nextTick();
    const submenu = findAll(body, (node) => node.props.role === 'menu')[1];
    submenu.rect = {
      left: 0,
      top: 0,
      right: 120,
      bottom: 64,
      width: 120,
      height: 64,
    };
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();

    expect(submenu.props.style.left).toBe('324px');
    expect(submenu.props.style.top).toBe('140px');

    listeners.get('scroll')({ target: submenu });
    expect(close).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(0);

    window.innerWidth = 500;
    rootMenu.rect = {
      left: 260,
      top: 96,
      right: 480,
      bottom: 224,
      width: 220,
      height: 128,
    };
    parentItem.rect = {
      left: 265,
      top: 160,
      right: 475,
      bottom: 192,
      width: 210,
      height: 32,
    };
    listeners.get('scroll')({ target: rootMenu });
    expect(close).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(1);
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();

    expect(submenu.props.style.left).toBe('136px');
    expect(submenu.props.style.top).toBe('160px');
    app.unmount();
  });

  it('keeps long menu chrome unselectable and constrains width and height to the viewport', () => {
    const source = fs.readFileSync(
      new URL('./DemoCandidateActionMenu.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(/max-inline-size:\s*calc\(100vw - 1rem\)/);
    expect(source).toMatch(
      /max-block-size:\s*min\(20rem, calc\(100vh - 1rem\)\)/,
    );
    expect(source).toMatch(/min-block-size:\s*var\(--ui-menu-item-height\)/);
    expect(source).not.toMatch(/max-block-size:\s*2rem/);
    expect(source).toMatch(
      /\.demo-action-menu\s*\{[^}]*padding:\s*var\(--ui-space-1\)/s,
    );
    expect(source).toMatch(
      /\.demo-action-menu__item\s*\{[^}]*column-gap:\s*var\(--ui-space-2\)[^}]*padding:\s*var\(--ui-space-1\) var\(--ui-space-2\)/s,
    );
    expect(source).toMatch(
      /\.demo-action-menu__separator\s*\{[^}]*margin:\s*var\(--ui-space-1\) var\(--ui-space-2\)/s,
    );
    expect(source).toMatch(/\.demo-action-menu\s*\{[^}]*user-select:\s*none/s);
    expect(source).not.toContain('demo-action-menu__status');
    expect(source).not.toContain('demo-action-menu--has-status');
  });

  it('keeps action labels visible and ignores the retired generic status field', async () => {
    const { app } = await mountMenu({
      items: [
        { key: 'plain', label: '播放下一首' },
        { key: 'queued', label: '已在佇列', status: '不應顯示' },
        {
          key: 'playlist',
          label: '新增至播放清單',
          children: [{ key: 'live', label: '歌回演出曲目' }],
        },
      ],
    });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];
    const items = findAll(menu, (node) => node.props.role === 'menuitem');
    const itemText = items.map(textContent);

    expect(String(menu.props.class)).not.toContain(
      'demo-action-menu--has-status',
    );
    expect(String(menu.props.class)).not.toContain(
      'demo-action-menu--has-icon',
    );
    expect(String(menu.props.class)).toContain('demo-action-menu--has-submenu');
    expect(itemText).toEqual(['播放下一首', '已在佇列', '新增至播放清單']);
    expect(items[0].props.style.gridTemplateColumns).toBe(
      'minmax(0, 1fr) 1rem',
    );
    app.unmount();
  });

  it('emits the selected value and a controlled close request, then restores its trigger', async () => {
    const select = vi.fn();
    const close = vi.fn();
    const item = { key: 'rename', label: '重新命名', value: 'rename' };
    const { app } = await mountMenu({
      items: [item],
      onSelect: select,
      onClose: close,
    });
    const button = findAll(body, (node) => node.props.role === 'menuitem')[0];
    focusOrigin.focus.mockClear();

    button.props.onClick({ detail: 1 });

    expect(select).toHaveBeenCalledWith('rename', item);
    expect(close).toHaveBeenCalledOnce();
    expect(focusOrigin.focus).toHaveBeenCalledOnce();
    expect(findAll(body, (node) => node.props.role === 'menu')).toHaveLength(1);
    app.unmount();
  });

  it('focuses an empty menu root and preserves its explicit empty message', async () => {
    const close = vi.fn();
    const { app } = await mountMenu({
      items: [],
      emptyText: '目前沒有可用操作',
      onClose: close,
    });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];

    expect(menu.props.tabindex).toBe(-1);
    expect(menu.focus).toHaveBeenCalled();
    expect(textContent(menu)).toBe('目前沒有可用操作');

    const escape = keyEvent('Escape', { target: menu, currentTarget: menu });
    menu.props.onKeydown(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('uses the opposite submenu direction keys in RTL', async () => {
    window.innerWidth = 800;
    const { app } = await mountMenu({
      dir: 'rtl',
      items: [
        {
          key: 'more',
          label: 'إضافة إلى قائمة التشغيل',
          submenuWidth: 120,
          children: [{ key: 'first', label: 'قائمة المساء' }],
        },
      ],
    });
    let items = findAll(body, (node) => node.props.role === 'menuitem');
    const rootMenu = findAll(body, (node) => node.props.role === 'menu')[0];
    rootMenu.rect = {
      left: 300,
      top: 96,
      right: 520,
      bottom: 224,
      width: 220,
      height: 128,
    };
    items[0].rect = {
      left: 305,
      top: 140,
      right: 515,
      bottom: 172,
      width: 210,
      height: 32,
    };

    const open = keyEvent('ArrowLeft');
    items[0].props.onKeydown(open);
    await nextTick();
    const submenu = findAll(body, (node) => node.props.role === 'menu')[1];
    submenu.rect = {
      left: 0,
      top: 0,
      right: 120,
      bottom: 64,
      width: 120,
      height: 64,
    };
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();
    items = findAll(body, (node) => node.props.role === 'menuitem');
    expect(open.preventDefault).toHaveBeenCalled();
    expect(items).toHaveLength(2);
    expect(submenu.props.style.left).toBe('176px');
    expect(submenu.props.style.top).toBe('140px');

    const back = keyEvent('ArrowRight');
    items[1].props.onKeydown(back);
    await nextTick();
    expect(back.preventDefault).toHaveBeenCalled();
    expect(items[0].focus).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('clamps the actual menu box inside every viewport edge', async () => {
    const { app } = await mountMenu({ x: 310, y: 230, width: 220 });
    const menu = findAll(body, (node) => node.props.role === 'menu')[0];

    expect(menu.props.style.left).toBe('92px');
    expect(menu.props.style.top).toBe('200px');
    app.unmount();
  });

  it('allows only one action menu instance to hold the shared gate', async () => {
    const firstClose = vi.fn();
    const first = await mountMenu({
      'aria-label': '第一個選單',
      onClose: firstClose,
    });
    const second = await mountMenu({ 'aria-label': '第二個選單' });

    expect(firstClose).toHaveBeenCalledOnce();
    expect(findAll(body, (node) => node.props.role === 'menu')).toHaveLength(2);
    second.app.unmount();
    first.app.unmount();
  });
});

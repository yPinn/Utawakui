import fs from 'node:fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_OVERLAY_HOST_KEY } from '../../composables/useUiOverlayHost.js';
import UiContextMenu from './UiContextMenu.vue';
import UiScrollRegion from './UiScrollRegion.vue';

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

attachClientRender(UiContextMenu, './UiContextMenu.vue');
attachClientRender(UiScrollRegion, './UiScrollRegion.vue');

function hostNode(type, text = '') {
  const identity = {};
  const node = {
    identity,
    type,
    text,
    props: {},
    children: [],
    parent: null,
    rect: {
      left: 24,
      top: 24,
      right: 244,
      bottom: 56,
      width: 220,
      height: 32,
    },
    focus: vi.fn(),
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

function hasClass(node, className) {
  return String(node.props?.class ?? '')
    .split(' ')
    .includes(className);
}

function menuRoots() {
  return findAll(body, (node) => hasClass(node, 'ui-context-menu'));
}

const sourceFor = (path) =>
  fs.readFileSync(new URL(path, import.meta.url), 'utf8');

describe('UiContextMenu positioning', () => {
  let animationFrames;

  beforeEach(() => {
    body = hostNode('body');
    animationFrames = [];
    const documentElement = hostNode('html');
    vi.stubGlobal('document', {
      body,
      documentElement,
      activeElement: null,
    });
    vi.stubGlobal('window', {
      innerWidth: 320,
      innerHeight: 240,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }),
      getComputedStyle: vi.fn((element) => ({
        direction: element?.props?.dir || 'ltr',
        fontSize: '16px',
        getPropertyValue: (name) =>
          ({
            '--ui-floating-viewport-inset': '8px',
            '--ui-space-1': '4px',
            '--ui-menu-item-height': '32px',
            '--ui-border-width': '1px',
          })[name] ?? '',
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mountMenu(props = {}, beforeFrames) {
    const root = hostNode('root');
    const app = renderer.createApp({
      setup: () => () =>
        h(UiContextMenu, {
          open: true,
          x: 24,
          y: 24,
          width: 220,
          items: [{ key: 'rename', label: '重新命名' }],
          ...props,
        }),
    });
    app.provide(ssrContextKey, { modules: new Set() });
    app.provide(UI_OVERLAY_HOST_KEY, body);
    app.mount(root);
    await nextTick();
    beforeFrames?.();
    animationFrames.splice(0).forEach((callback) => callback());
    await nextTick();
    return { app, root };
  }

  it('mirrors a pointer menu to the pointer start side when inline-end cannot fit', async () => {
    const { app } = await mountMenu({ x: 310, y: 230, width: 220 }, () => {
      menuRoots()[0].rect = {
        left: 0,
        top: 0,
        right: 220,
        bottom: 40,
        width: 220,
        height: 40,
      };
    });
    const menu = menuRoots()[0];

    // 310 + 220 overflows the right edge, so the menu ends at the pointer.
    expect(menu.props.style.left).toBe('90px');
    expect(menu.props.style.top).toBe('192px');
    expect(menu.props['data-placement']).toBe('pointer');
    app.unmount();
  });

  it('aligns a button menu to the trigger start edge when the right side fits', async () => {
    window.innerWidth = 500;
    window.innerHeight = 400;
    const anchorEl = hostNode('button');
    anchorEl.rect = {
      top: 350,
      right: 380,
      bottom: 390,
      left: 300,
      width: 80,
      height: 40,
    };
    const { app } = await mountMenu({ anchorEl, width: 120 }, () => {
      menuRoots()[0].rect = {
        left: 0,
        top: 0,
        right: 120,
        bottom: 80,
        width: 120,
        height: 80,
      };
    });
    const menu = menuRoots()[0];

    expect(menu.props.style.left).toBe('300px');
    expect(menu.props.style.top).toBe('266px');
    expect(menu.props['data-placement']).toBe('top-start');
    app.unmount();
  });

  it('aligns a button menu to the trigger end edge only when the right side cannot fit', async () => {
    window.innerWidth = 500;
    window.innerHeight = 400;
    const anchorEl = hostNode('button');
    anchorEl.rect = {
      top: 100,
      right: 480,
      bottom: 132,
      left: 448,
      width: 32,
      height: 32,
    };
    const { app } = await mountMenu({ anchorEl, width: 120 }, () => {
      menuRoots()[0].rect = {
        left: 0,
        top: 0,
        right: 120,
        bottom: 80,
        width: 120,
        height: 80,
      };
    });
    const menu = menuRoots()[0];

    expect(menu.props.style.left).toBe('360px');
    expect(menu.props.style.top).toBe('136px');
    expect(menu.props['data-placement']).toBe('bottom-end');
    app.unmount();
  });

  it.each([
    {
      label: 'LTR viewport edge',
      dir: 'ltr',
      viewportWidth: 500,
      rootRect: {
        left: 260,
        top: 96,
        right: 480,
        bottom: 224,
        width: 220,
        height: 128,
      },
      itemRect: {
        left: 265,
        top: 160,
        right: 475,
        bottom: 192,
        width: 210,
        height: 32,
      },
      expectedLeft: '136px',
    },
    {
      label: 'RTL logical end',
      dir: 'rtl',
      viewportWidth: 800,
      rootRect: {
        left: 300,
        top: 96,
        right: 520,
        bottom: 224,
        width: 220,
        height: 128,
      },
      itemRect: {
        left: 305,
        top: 140,
        right: 515,
        bottom: 172,
        width: 210,
        height: 32,
      },
      expectedLeft: '176px',
    },
  ])(
    'opens the submenu on physical left for $label and mirrors the chevron',
    async ({ dir, viewportWidth, rootRect, itemRect, expectedLeft }) => {
      window.innerWidth = viewportWidth;
      window.innerHeight = 600;
      const { app } = await mountMenu({
        dir,
        items: [
          {
            key: 'playlist',
            label: '新增至播放清單',
            submenuWidth: 120,
            children: [{ key: 'live', label: '演出曲目' }],
          },
        ],
      });
      const rootMenu = menuRoots()[0];
      const parentItem = findAll(
        rootMenu,
        (node) => node.props.role === 'menuitem',
      )[0];
      rootMenu.rect = rootRect;
      parentItem.rect = itemRect;

      parentItem.props.onMouseenter();
      await nextTick();
      const submenu = menuRoots()[1];
      submenu.rect = {
        left: 0,
        top: 0,
        right: 120,
        bottom: 64,
        width: 120,
        height: 64,
      };
      await nextTick();
      const chevron = findAll(rootMenu, (node) =>
        hasClass(node, 'ui-context-menu__chevron'),
      )[0];

      expect(submenu.props.style.left).toBe(expectedLeft);
      expect(submenu.props.style.top).toBe(`${itemRect.top}px`);
      expect(submenu.props['data-side']).toBe('left');
      expect(hasClass(chevron, 'ui-context-menu__chevron--reverse')).toBe(true);
      app.unmount();
    },
  );
});

describe('UiContextMenu production caller contract', () => {
  it('uses anchor elements for every button opener and leaves pointer callers coordinate-based', () => {
    const buttonCallers = [
      '../performance-session/PerformanceSessionPlanList.vue',
      '../playlists/CollectionActionRail.vue',
      '../queue/QueuePanel.vue',
      '../separation/SeparationToolbarList.vue',
      '../settings/DiagnosticsSettingsRow.vue',
      '../settings/PlaybackHistorySettingsRow.vue',
      '../settings/SettingsDependencyActions.vue',
      '../../views/SettingsView.vue',
    ];
    for (const path of buttonCallers) {
      const source = sourceFor(path);
      expect(source, path).toMatch(/anchorEl|anchor-el/u);
      expect(source, path).not.toMatch(/alignX|align-x/u);
      expect(source, path).not.toMatch(/bottom\s*\+\s*4/u);
    }

    for (const path of [
      '../playlists/PlaylistSidebar.vue',
      '../library/LibraryBrowseContent.vue',
    ]) {
      const source = sourceFor(path);
      expect(source, path).toMatch(/clientX/u);
      expect(source, path).toMatch(/clientY/u);
    }
  });

  it('keeps one positioning implementation and one TrackActionMenu transport API', () => {
    const menuSource = sourceFor('./UiContextMenu.vue');
    const trackMenuSource = sourceFor('../track/TrackActionMenu.vue');

    expect(menuSource).toContain('anchoredFloatingLayout');
    expect(menuSource).toContain('pointFloatingPosition');
    expect(menuSource).not.toMatch(/alignX|align-x/u);
    expect(trackMenuSource).toContain('anchorEl: { type: Object');
    expect(trackMenuSource).toContain(':anchor-el="anchorEl"');
    expect(trackMenuSource).not.toMatch(/alignX|align-x/u);
  });
});

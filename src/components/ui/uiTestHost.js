import fs from 'node:fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { vi } from 'vitest';

const { createRenderer, h, ssrContextKey } = Vue;

export function attachClientRender(component, filename, importMetaUrl) {
  const source = fs.readFileSync(new URL(filename, importMetaUrl), 'utf8');
  const { descriptor } = parse(source, { filename });
  const bindingMetadata =
    descriptor.script || descriptor.scriptSetup
      ? compileScript(descriptor, { id: filename }).bindings
      : {};
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata,
  });
  component.render = new Function('Vue', code)(Vue);
}

export function hostNode(type, text = '') {
  const classNames = new Set();
  return {
    __uiTestHostNode: true,
    nodeType: type === 'text' ? 3 : type === 'comment' ? 8 : 1,
    type,
    text,
    props: {},
    children: [],
    parent: null,
    style: {},
    classList: {
      add: (...names) => names.forEach((name) => classNames.add(name)),
      contains: (name) => classNames.has(name),
      remove: (...names) => names.forEach((name) => classNames.delete(name)),
    },
    focus: vi.fn(),
    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parent = null;
      return child;
    },
    cloneNode() {
      const clone = hostNode(type, text);
      clone.props = { ...this.props };
      for (const name of classNames) clone.classList.add(name);
      return clone;
    },
    contains(candidate) {
      let current = candidate;
      while (current) {
        if (current === this) return true;
        current = current.parent;
      }
      return false;
    },
    getBoundingClientRect() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
      };
    },
    get parentNode() {
      return this.parent;
    },
  };
}

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
    return globalThis.document?.querySelector?.(selector) ?? null;
  },
  setScopeId() {},
  cloneNode(node) {
    return node.cloneNode();
  },
  insertStaticContent(content, parent) {
    const node = hostNode('static', content);
    this.insert(node, parent);
    return [node, node];
  },
});

export function mount(component, props = {}, slots = {}) {
  const root = hostNode('root');
  const Root = { setup: () => () => h(component, props, slots) };
  const app = renderer.createApp(Root);
  app.provide(ssrContextKey, { modules: new Set() });
  app.mount(root);
  return { app, root };
}

export function findAll(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, matches);
  return matches;
}

export function textContent(node) {
  return node.type === 'text'
    ? node.text
    : (node.children ?? []).map(textContent).join('');
}

export function trigger(node, eventName, event = {}) {
  const handlers = [node.props[eventName]].flat().filter(Boolean);
  handlers.forEach((handler) => handler(event));
}

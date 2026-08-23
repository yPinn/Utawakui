import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createRenderer, nextTick, reactive, ref, ssrContextKey } = Vue;

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

function hostNode(type, text = '') {
  return {
    type,
    text,
    props: {},
    children: [],
    parent: null,
    listeners: {},
    focus: vi.fn(),
    getRootNode() {
      return this;
    },
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
    removeEventListener(name) {
      delete this.listeners[name];
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
  querySelector() {
    return null;
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

function mount(component, props = {}) {
  const root = hostNode('root');
  const app = renderer.createApp(component, props);
  app.provide(ssrContextKey, { modules: new Set() });
  app.mount(root);
  return { app, root };
}

function findAll(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, matches);
  return matches;
}

function findByProp(root, key, value) {
  return findAll(root, (node) => node.props?.[key] === value)[0];
}

function nodeText(node) {
  return [node.text, ...(node.children ?? []).map(nodeText)]
    .filter(Boolean)
    .join('');
}

function findButtonByText(root, label) {
  return findAll(
    root,
    (node) => node.type === 'button' && nodeText(node).includes(label),
  )[0];
}

async function loadWorkspaceComponent() {
  const [
    { default: Workspace },
    { default: CandidateRow },
    { default: UiButton },
    { default: UiChip },
    { default: UiHint },
    { default: UiNotice },
  ] = await Promise.all([
    import('./LyricsLrclibSearchWorkspace.vue'),
    import('./LyricsLrclibCandidateRow.vue'),
    import('../ui/UiButton.vue'),
    import('../ui/UiChip.vue'),
    import('../ui/UiHint.vue'),
    import('../ui/UiNotice.vue'),
  ]);
  attachClientRender(Workspace, './LyricsLrclibSearchWorkspace.vue');
  attachClientRender(CandidateRow, './LyricsLrclibCandidateRow.vue');
  attachClientRender(UiButton, '../ui/UiButton.vue');
  attachClientRender(UiChip, '../ui/UiChip.vue');
  attachClientRender(UiHint, '../ui/UiHint.vue');
  attachClientRender(UiNotice, '../ui/UiNotice.vue');
  return Workspace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('LyricsLrclibSearchWorkspace behavior', () => {
  it('submits edited fields once, pins the track, and exits on track drift', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    let resolveSearch;
    const searchLyricsCandidates = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const clearCandidateSearch = vi.fn();
    const selectedTrack = ref({
      id: 'track-a',
      title: 'Initial title',
      artist: 'Initial artist',
    });
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack,
        clearCandidateSearch,
        searchLyricsCandidates,
        saveLyricsCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();

    const onBack = vi.fn();
    const { app, root } = mount(Workspace, { onBack });
    const titleInput = findByProp(root, 'id', 'lrclib-track-title');
    const artistInput = findByProp(root, 'id', 'lrclib-artist-name');
    titleInput.props['onUpdate:modelValue']('Edited title');
    artistInput.props['onUpdate:modelValue']('Edited artist');
    const form = findAll(root, (node) => node.type === 'form')[0];
    const event = { preventDefault: vi.fn() };

    const first = form.props.onSubmit(event);
    form.props.onSubmit(event);

    expect(searchLyricsCandidates).toHaveBeenCalledOnce();
    expect(searchLyricsCandidates).toHaveBeenCalledWith(
      {
        query: { title: 'Edited title', artist: 'Edited artist' },
      },
      'track-a',
    );

    resolveSearch({ status: 'ok', candidates: [], groups: null });
    await first;
    selectedTrack.value = { id: 'track-b', title: 'B', artist: 'Artist B' };
    await nextTick();
    expect(onBack).toHaveBeenCalledOnce();

    app.unmount();
    expect(clearCandidateSearch).toHaveBeenCalledTimes(3);
  });

  it('renders 20 related candidates, broadens explicitly, and serializes changed-record saves', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      trackName: `Candidate ${index + 1}`,
      artistName: 'Artist',
      matchBand: 'related',
      previewFingerprint: String(index + 1).padStart(64, '0'),
      previewLines: [{ start: 1, text: `Preview ${index + 1}` }],
      capability: { level: 'T1', partial: false },
      warnings: [],
      matchReasons: ['title-close'],
      lineCount: 1,
      segmentCount: 0,
      saveState: 'unsaved',
      alreadySaved: false,
    }));
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    const clearCandidateSearch = vi.fn(() => {
      state.candidateSearch.status = null;
      state.candidateSearch.error = null;
      state.candidateSearch.candidates = [];
      state.candidateSearch.groups = { best: [], related: [] };
      state.candidateSearch.invalidRecordCount = 0;
    });
    const searchLyricsCandidates = vi.fn(async () => {
      state.candidateSearch.status = 'ok';
      state.candidateSearch.candidates = candidates;
      state.candidateSearch.groups = { best: [], related: candidates };
      return { status: 'ok', candidates };
    });
    let resolveSave;
    const changed = {
      ...candidates[0],
      trackName: 'Candidate 1 updated',
      previewFingerprint: 'f'.repeat(64),
    };
    const saveLyricsCandidate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSave = () =>
              resolve({ status: 'record-changed', candidate: changed });
          }),
      )
      .mockResolvedValueOnce({ status: 'record-changed', candidate: changed })
      .mockResolvedValueOnce({
        status: 'saved',
        source: { filename: 'lrclib-1.lrc' },
      });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch,
        searchLyricsCandidates,
        saveLyricsCandidate,
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace);
    const form = findAll(root, (node) => node.type === 'form')[0];

    await form.props.onSubmit({ preventDefault: vi.fn() });
    await nextTick();
    expect(
      findAll(
        root,
        (node) =>
          node.type === 'li' &&
          String(node.props?.class || '').includes(
            'lyrics-lrclib-candidate-row',
          ),
      ),
    ).toHaveLength(20);

    const broadenButton = findButtonByText(root, '擴大搜尋');
    await broadenButton.props.onClick();
    expect(searchLyricsCandidates).toHaveBeenLastCalledWith(
      {
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      },
      'track-a',
    );

    const saveButton = findByProp(
      root,
      'aria-label',
      '保存 Candidate 1，Artist',
    );
    const firstSave = saveButton.props.onClick();
    saveButton.props.onClick();
    expect(saveLyricsCandidate).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(findByProp(root, 'type', 'submit').props.disabled).toBe(true);
    form.props.onSubmit({ preventDefault: vi.fn() });
    broadenButton.props.onClick();
    expect(searchLyricsCandidates).toHaveBeenCalledTimes(2);
    resolveSave();
    await firstSave;
    await nextTick();
    expect(nodeText(root)).toContain('Candidate 1 updated');

    findButtonByText(root, '取消').props.onClick();
    await nextTick();
    expect(nodeText(root)).not.toContain('Candidate 1 updated');
    await findByProp(
      root,
      'aria-label',
      '保存 Candidate 1，Artist',
    ).props.onClick();
    await nextTick();

    const confirmButton = findButtonByText(root, '改用更新內容');
    const confirmSave = confirmButton.props.onClick();
    confirmButton.props.onClick();
    expect(saveLyricsCandidate).toHaveBeenCalledTimes(3);
    expect(saveLyricsCandidate).toHaveBeenLastCalledWith(changed, 'track-a', {
      title: 'Song',
      artist: 'Artist',
    });
    await confirmSave;

    app.unmount();
  });

  it('shows the invalid-only state without also rendering the generic empty state', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsCandidates: vi.fn(async () => {
          state.candidateSearch.status = 'ok';
          state.candidateSearch.invalidRecordCount = 2;
          return { status: 'ok', candidates: [] };
        }),
        saveLyricsCandidate: vi.fn(),
      }),
    }));
    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace);

    await findAll(root, (node) => node.type === 'form')[0].props.onSubmit({
      preventDefault: vi.fn(),
    });
    await nextTick();

    expect(nodeText(root)).toContain('沒有可安全顯示的候選');
    expect(nodeText(root)).not.toContain('沒有找到候選歌詞');
    app.unmount();
  });
});

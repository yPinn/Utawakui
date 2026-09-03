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
    { default: RecordingGroup },
    { default: CandidateRow },
    { default: UiButton },
    { default: UiChip },
    { default: UiHint },
    { default: UiNotice },
    { default: UiField },
    { default: UiTextField },
  ] = await Promise.all([
    import('./LyricsLrclibSearchWorkspace.vue'),
    import('./LyricsProviderRecordingGroup.vue'),
    import('./LyricsLrclibCandidateRow.vue'),
    import('../ui/UiButton.vue'),
    import('../ui/UiChip.vue'),
    import('../ui/UiHint.vue'),
    import('../ui/UiNotice.vue'),
    import('../ui/UiField.vue'),
    import('../ui/UiTextField.vue'),
  ]);
  attachClientRender(Workspace, './LyricsLrclibSearchWorkspace.vue');
  attachClientRender(RecordingGroup, './LyricsProviderRecordingGroup.vue');
  attachClientRender(CandidateRow, './LyricsLrclibCandidateRow.vue');
  attachClientRender(UiButton, '../ui/UiButton.vue');
  attachClientRender(UiChip, '../ui/UiChip.vue');
  attachClientRender(UiHint, '../ui/UiHint.vue');
  attachClientRender(UiNotice, '../ui/UiNotice.vue');
  attachClientRender(UiField, '../ui/UiField.vue');
  attachClientRender(UiTextField, '../ui/UiTextField.vue');
  return Workspace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('LyricsLrclibSearchWorkspace behavior', () => {
  it('shows every grouped source immediately with one recommended marker', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const netease = {
      id: 42,
      providerId: 'netease',
      candidateKey: 'netease:42',
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      capability: { level: 'T2', partial: false },
      compatibility: { t0: true, t1: true, t2: true },
      previewLines: [{ start: 1, text: 'Word timed' }],
      warnings: [],
      saveState: 'unsaved',
      alreadySaved: false,
    };
    const lrclib = {
      ...netease,
      providerId: 'lrclib',
      candidateKey: 'lrclib:42',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      previewLines: [{ start: 1, text: 'Line timed' }],
    };
    const recordingGroup = {
      recordingKey: 'recording:one',
      matchBand: 'exact',
      recommendedCandidateKey: 'netease:42',
      candidates: [netease, lrclib],
    };
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        recordingGroups: { best: [], related: [] },
        providerStatuses: [],
        partial: false,
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    const searchLyricsProviderCandidates = vi.fn(async () => {
      state.candidateSearch.status = 'ok';
      state.candidateSearch.candidates = [netease, lrclib];
      state.candidateSearch.groups = {
        best: [netease, lrclib],
        related: [],
      };
      state.candidateSearch.recordingGroups = {
        best: [recordingGroup],
        related: [],
      };
      return { status: 'ok', candidates: [netease, lrclib] };
    });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsProviderCandidates,
        saveLyricsProviderCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace, {
      providerId: 'all',
      providerLabel: '所有線上來源',
    });
    await vi.waitFor(() => expect(nodeText(root)).toContain('網易雲音樂'));

    expect(nodeText(root)).toContain('LRCLIB');
    expect(nodeText(root)).not.toContain('顯示其他');
    expect(nodeText(root).match(/推薦/g)).toHaveLength(1);

    app.unmount();
  });

  it('keeps cache misses and healthy zero-result providers silent', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        recordingGroups: { best: [], related: [] },
        providerStatuses: [],
        partial: false,
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    const searchLyricsProviderCandidates = vi.fn(async () => {
      state.candidateSearch.status = 'ok';
      state.candidateSearch.partial = true;
      state.candidateSearch.providerStatuses = [
        { provider: 'lrclib', status: 'ok' },
        { provider: 'netease', status: 'ok' },
        {
          provider: 'betterlyrics',
          status: 'unavailable',
          reason: 'cache-miss',
        },
      ];
      return { status: 'ok', candidates: [] };
    });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsProviderCandidates,
        saveLyricsProviderCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace, {
      providerId: 'all',
      providerLabel: '所有線上來源',
    });
    await vi.waitFor(() =>
      expect(searchLyricsProviderCandidates).toHaveBeenCalledOnce(),
    );

    expect(nodeText(root)).not.toContain('部分來源沒有結果');
    expect(nodeText(root)).not.toContain('網易雲音樂沒有找到');
    expect(nodeText(root)).not.toContain('Better Lyrics 公開快取');
    expect(nodeText(root)).not.toContain('部分來源未完成');

    app.unmount();
  });

  it('reserves the partial-source warning for operational failures', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        error: null,
        candidates: [],
        groups: { best: [], related: [] },
        recordingGroups: { best: [], related: [] },
        providerStatuses: [],
        partial: false,
        invalidRecordCount: 0,
      },
      manualSave: { error: null },
    });
    const searchLyricsProviderCandidates = vi.fn(async () => {
      state.candidateSearch.status = 'ok';
      state.candidateSearch.partial = true;
      state.candidateSearch.providerStatuses = [
        { provider: 'lrclib', status: 'ok' },
        {
          provider: 'betterlyrics',
          status: 'error',
          reason: 'timeout',
        },
      ];
      return { status: 'ok', candidates: [] };
    });
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsProviderCandidates,
        saveLyricsProviderCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace, {
      providerId: 'all',
      providerLabel: '所有線上來源',
    });
    await vi.waitFor(() => expect(nodeText(root)).toContain('部分來源未完成'));

    expect(nodeText(root)).toContain('Better Lyrics 回應逾時');
    expect(nodeText(root)).not.toContain('部分來源沒有結果');

    app.unmount();
  });

  it('searches prefilled metadata once, then submits edited fields only on demand', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    let resolveEditedSearch;
    const searchLyricsCandidates = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', candidates: [], groups: null })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveEditedSearch = resolve;
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
    await vi.waitFor(() =>
      expect(searchLyricsCandidates).toHaveBeenCalledOnce(),
    );
    expect(searchLyricsCandidates).toHaveBeenCalledWith(
      {
        query: { title: 'Initial title', artist: 'Initial artist' },
      },
      'track-a',
    );

    const titleInput = findByProp(root, 'id', 'lrclib-track-title');
    const artistInput = findByProp(root, 'id', 'lrclib-artist-name');
    expect(titleInput.focus).toHaveBeenCalledOnce();
    titleInput.props.onInput({ target: { value: 'Edited title' } });
    artistInput.props.onInput({ target: { value: 'Edited artist' } });
    await nextTick();
    expect(searchLyricsCandidates).toHaveBeenCalledOnce();

    const form = findAll(root, (node) => node.type === 'form')[0];
    const event = { preventDefault: vi.fn() };

    const first = form.props.onSubmit(event);
    form.props.onSubmit(event);

    expect(searchLyricsCandidates).toHaveBeenCalledTimes(2);
    expect(searchLyricsCandidates).toHaveBeenLastCalledWith(
      {
        query: { title: 'Edited title', artist: 'Edited artist' },
      },
      'track-a',
    );

    resolveEditedSearch({ status: 'ok', candidates: [], groups: null });
    await first;
    selectedTrack.value = { id: 'track-b', title: 'B', artist: 'Artist B' };
    await nextTick();
    expect(onBack).toHaveBeenCalledOnce();

    app.unmount();
    expect(clearCandidateSearch).toHaveBeenCalledTimes(3);
  });

  it('does not send an empty initial query and searches after the title is supplied', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const searchLyricsCandidates = vi.fn(async () => ({
      status: 'ok',
      candidates: [],
      groups: null,
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
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: '', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsCandidates,
        saveLyricsCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace);
    await nextTick();

    expect(searchLyricsCandidates).not.toHaveBeenCalled();
    expect(nodeText(root)).toContain('請輸入歌曲名稱後搜尋');

    findByProp(root, 'id', 'lrclib-track-title').props.onInput({
      target: { value: 'Manual title' },
    });
    await findAll(root, (node) => node.type === 'form')[0].props.onSubmit({
      preventDefault: vi.fn(),
    });

    expect(searchLyricsCandidates).toHaveBeenCalledOnce();
    expect(searchLyricsCandidates).toHaveBeenCalledWith(
      { query: { title: 'Manual title', artist: 'Artist' } },
      'track-a',
    );
    app.unmount();
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
    await vi.waitFor(() =>
      expect(searchLyricsCandidates).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() =>
      expect(
        findAll(
          root,
          (node) =>
            node.type === 'li' &&
            String(node.props?.class || '').includes(
              'lyrics-lrclib-candidate-row',
            ),
        ),
      ).toHaveLength(20),
    );

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
    const form = findAll(root, (node) => node.type === 'form')[0];
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
    await vi.waitFor(() =>
      expect(nodeText(root)).toContain('沒有可安全顯示的候選'),
    );

    expect(nodeText(root)).toContain('沒有可安全顯示的候選');
    expect(nodeText(root)).not.toContain('沒有找到候選歌詞');
    app.unmount();
  });

  it('renders plain lyrics without timestamps and withholds save for unusable sources', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const plainCandidate = {
      id: 1,
      trackName: 'Plain lyrics',
      artistName: 'Artist',
      capability: { level: 'T0', partial: false },
      compatibility: { t0: true, t1: false, t2: false },
      previewLines: [
        { start: null, text: 'First plain line' },
        { start: null, text: 'Second plain line' },
      ],
      lineCount: 2,
      segmentCount: 0,
      warnings: [],
      matchReasons: [],
      saveState: 'unsaved',
      alreadySaved: false,
    };
    const unsupportedCandidate = {
      id: 2,
      trackName: 'Unsupported lyrics',
      artistName: 'Artist',
      capability: { level: 'unsupported', partial: false },
      compatibility: { t0: false, t1: false, t2: false },
      previewLines: [],
      lineCount: 0,
      segmentCount: 0,
      warnings: ['invalid-lyricsfile'],
      matchReasons: [],
      saveState: 'unsaved',
      alreadySaved: false,
    };
    const candidates = [plainCandidate, unsupportedCandidate];
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
          state.candidateSearch.candidates = candidates;
          state.candidateSearch.groups = { best: candidates, related: [] };
          return { status: 'ok', candidates };
        }),
        saveLyricsCandidate: vi.fn(),
      }),
    }));

    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace);
    await vi.waitFor(() =>
      expect(nodeText(root)).toContain('First plain line'),
    );

    expect(nodeText(root).match(/First plain line/g)).toHaveLength(1);
    expect(nodeText(root)).not.toContain('0:00');
    const plainSaveButton = findByProp(
      root,
      'aria-label',
      '保存 Plain lyrics，Artist',
    );
    expect(plainSaveButton).toBeDefined();
    expect(String(plainSaveButton.props.class)).toContain('ui-btn--accent');

    findByProp(
      root,
      'aria-label',
      '展開 Unsupported lyrics，Artist',
    ).props.onClick();
    await nextTick();

    expect(nodeText(root)).toContain('這筆來源格式目前不支援，無法安全匯入。');
    expect(
      findByProp(root, 'aria-label', '保存 Unsupported lyrics，Artist'),
    ).toBeUndefined();
    app.unmount();
  });
});

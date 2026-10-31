import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
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
    { default: UiScrollRegion },
    { default: UiScrollLayout },
    { default: UiSkeleton },
    { default: UiStack },
    { default: UiSurface },
    { default: UiTextField },
    { default: UiDisclosure },
    { default: UiTooltipSurface },
  ] = await Promise.all([
    import('./LyricsLrclibSearchWorkspace.vue'),
    import('./LyricsProviderRecordingGroup.vue'),
    import('./LyricsLrclibCandidateRow.vue'),
    import('../ui/UiButton.vue'),
    import('../ui/UiChip.vue'),
    import('../ui/UiHint.vue'),
    import('../ui/UiNotice.vue'),
    import('../ui/UiField.vue'),
    import('../ui/UiScrollRegion.vue'),
    import('../ui/UiScrollLayout.vue'),
    import('../ui/UiSkeleton.vue'),
    import('../ui/UiStack.vue'),
    import('../ui/UiSurface.vue'),
    import('../ui/UiTextField.vue'),
    import('../ui/UiDisclosure.vue'),
    import('../ui/tooltip/UiTooltipSurface.vue'),
  ]);
  attachClientRender(Workspace, './LyricsLrclibSearchWorkspace.vue');
  attachClientRender(RecordingGroup, './LyricsProviderRecordingGroup.vue');
  attachClientRender(CandidateRow, './LyricsLrclibCandidateRow.vue');
  attachClientRender(UiButton, '../ui/UiButton.vue');
  attachClientRender(UiChip, '../ui/UiChip.vue');
  attachClientRender(UiHint, '../ui/UiHint.vue');
  attachClientRender(UiNotice, '../ui/UiNotice.vue');
  attachClientRender(UiField, '../ui/UiField.vue');
  attachClientRender(UiScrollRegion, '../ui/UiScrollRegion.vue');
  attachClientRender(UiScrollLayout, '../ui/UiScrollLayout.vue');
  attachClientRender(UiSkeleton, '../ui/UiSkeleton.vue');
  attachClientRender(UiStack, '../ui/UiStack.vue');
  attachClientRender(UiSurface, '../ui/UiSurface.vue');
  attachClientRender(UiTextField, '../ui/UiTextField.vue');
  attachClientRender(UiDisclosure, '../ui/UiDisclosure.vue');
  attachClientRender(UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue');
  return Workspace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('LyricsLrclibSearchWorkspace behavior', () => {
  it('offers more search after useful matches and keeps the visible choice while loading', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const candidates = [1, 2].map((id) => ({
      id,
      providerId: 'lrclib',
      candidateKey: `lrclib:${id}`,
      trackName: `Choice ${id}`,
      artistName: 'Artist',
      matchBand: 'exact',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true },
      previewLines: [{ start: 1, text: `Preview ${id}` }],
    }));
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: 'ok',
        error: null,
        candidates,
        groups: { best: candidates, related: [] },
        providerStatuses: [],
      },
      manualSave: { error: null },
    });
    let finishMore;
    const clear = vi.fn();
    const search = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', candidates })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishMore = resolve;
          }),
      );
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: clear,
        searchLyricsProviderCandidates: search,
        saveLyricsProviderCandidate: vi.fn(),
      }),
    }));
    const { app, root } = mount(await loadWorkspaceComponent(), {
      providerId: 'all',
    });
    await vi.waitFor(() => expect(nodeText(root)).toContain('Preview 1'));
    findByProp(root, 'aria-label', '展開 Choice 2，Artist').props.onClick();
    await nextTick();
    const more = findButtonByText(root, '擴大搜尋');
    expect(more.props.disabled).toBe(false);
    more.props.onClick();
    await nextTick();
    expect(nodeText(root)).toContain('Preview 2');
    expect(clear).toHaveBeenCalledTimes(1);
    expect(
      findByProp(root, 'aria-label', '儲存 Choice 2，Artist').props.disabled,
    ).toBe(true);
    finishMore({ status: 'ok', candidates });
    await vi.waitFor(() =>
      expect(
        findByProp(root, 'aria-label', '收合 Choice 2，Artist'),
      ).toBeDefined(),
    );
    app.unmount();
  });
  it('renders retained-result warnings and a committed-save refresh error through the compiled template', async () => {
    const candidate = {
      id: 42,
      providerId: 'lrclib',
      candidateKey: 'lrclib:42',
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      previewLines: [],
      capability: { level: 'T1', partial: false },
    };
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: 'ok',
        error: null,
        candidates: [candidate],
        groups: { best: [candidate], related: [] },
        providerStatuses: [
          {
            provider: 'lrclib',
            status: 'ok',
            partial: true,
            reason: 'rate-limited',
          },
        ],
        partial: true,
        invalidRecordCount: 0,
      },
      manualSave: {
        error: '歌詞已儲存，但清單更新未完成。請重新開啟歌詞清單。',
      },
    });
    const search = vi.fn();
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsProviderCandidates: search,
        saveLyricsProviderCandidate: vi.fn(),
      }),
    }));
    const Workspace = (await import('./LyricsLrclibSearchWorkspace.vue'))
      .default;
    const html = await renderToString(
      Vue.createSSRApp(Workspace, { providerId: 'all' }),
    );
    expect(html).toContain('歌詞操作未完成');
    expect(html).toContain('歌詞已儲存，但清單更新未完成');
    expect(html).not.toContain('歌詞未儲存');
    expect(html).toContain('部分線上結果未載入');
    expect(html).toContain('LRCLIB 暫時限制請求');
    expect(html).not.toContain('httpStatus');
    expect(search).not.toHaveBeenCalled();
  });
  it('shows three recording groups, discloses the remaining matches, and resets on search', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      candidateKey: `lrclib:${index + 1}`,
      providerId: 'lrclib',
      trackName: `Version ${index + 1}`,
      artistName: 'Artist',
      matchBand: index === 5 ? 'related' : 'strong',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true },
      previewLines: [{ start: 1, text: 'Line' }],
      warnings: [],
    }));
    // The first recording owns two sources; the limit counts recordings, not sources.
    const groups = candidates.slice(0, 5).map((c) => ({
      recordingKey: `recording:${c.id}`,
      recommendedCandidateKey: c.candidateKey,
      candidates: [c],
    }));
    groups[0].candidates.push({
      ...candidates[0],
      id: 10,
      candidateKey: 'lrclib:10',
      artistName: 'First alternate',
    });
    groups[0].candidates.push({
      ...candidates[0],
      id: 2,
      candidateKey: 'lrclib:2-alternate',
      artistName: 'Last alternate',
    });
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: 'ok',
        candidates,
        groups: { best: candidates.slice(0, 5), related: [candidates[5]] },
        recordingGroups: {
          best: groups,
          related: [
            {
              recordingKey: 'related',
              recommendedCandidateKey: candidates[5].candidateKey,
              candidates: [candidates[5]],
            },
          ],
        },
      },
      manualSave: { error: null },
    });
    const saveLyricsCandidate = vi.fn(async () => null);
    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state,
        selectedTrack: ref({ id: 'track-a', title: 'Song', artist: 'Artist' }),
        clearCandidateSearch: vi.fn(),
        searchLyricsCandidates: vi.fn(async () => ({
          status: 'ok',
          candidates,
        })),
        saveLyricsCandidate,
      }),
    }));
    const Workspace = await loadWorkspaceComponent();
    const { app, root } = mount(Workspace, { providerId: 'all' });
    await vi.waitFor(() => expect(nodeText(root)).toContain('Version 3'));
    const { useFeedbackReport } =
      await import('../../composables/useFeedbackReport.js');
    findButtonByText(root, '回報歌詞問題').props.onClick();
    const feedback = useFeedbackReport();
    expect(feedback.state).toMatchObject({
      open: true,
      kind: 'content',
      trackLabel: 'Artist - Song',
      step: 'compose',
      includeDiagnostics: false,
    });
    expect(feedback.state.description).toContain('Version 1');
    expect(feedback.state.description).toContain('LRCLIB');
    expect(saveLyricsCandidate).not.toHaveBeenCalled();
    feedback.closeReport();
    await nextTick();
    expect(nodeText(root)).not.toContain('Version 4');
    expect(nodeText(root)).toContain('Version 6');
    expect(
      findAll(
        root,
        (n) =>
          n.type === 'button' &&
          n.props['aria-expanded'] !== undefined &&
          String(n.props['aria-label']).includes('Version 1'),
      ),
    ).toHaveLength(3);
    const sourceOrder = findAll(
      root,
      (n) =>
        n.type === 'button' &&
        n.props['aria-expanded'] !== undefined &&
        String(n.props['aria-label']).includes('Version 1'),
    );
    expect(sourceOrder.map((n) => n.props['aria-label'])).toEqual([
      '收合 Version 1，Artist，建議來源',
      '展開 Version 1，First alternate',
      '展開 Version 1，Last alternate',
    ]);
    const disclosure = findAll(root, (n) => n.type === 'details')[0];
    expect(nodeText(disclosure)).toContain('其餘符合版本（2）');
    disclosure.props.onToggle({ currentTarget: { open: true } });
    await nextTick();
    expect(nodeText(root)).toContain('Version 4');
    expect(nodeText(root)).toContain('Version 5');
    findByProp(root, 'aria-label', '展開 Version 4，Artist').props.onClick();
    await nextTick();
    expect(
      findByProp(root, 'aria-label', '儲存 Version 4，Artist'),
    ).toBeDefined();
    await findByProp(
      root,
      'aria-label',
      '儲存 Version 4，Artist',
    ).props.onClick();
    expect(saveLyricsCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateKey: 'lrclib:4' }),
      'track-a',
      { title: 'Song', artist: 'Artist' },
    );
    disclosure.props.onToggle({ currentTarget: { open: false } });
    await nextTick();
    expect(nodeText(root)).not.toContain('Version 4');
    disclosure.props.onToggle({ currentTarget: { open: true } });
    await nextTick();
    findAll(root, (n) => n.type === 'form')[0].props.onSubmit({
      preventDefault: vi.fn(),
    });
    await nextTick();
    await vi.waitFor(() =>
      expect(findAll(root, (n) => n.type === 'details')[0]?.props.open).toBe(
        false,
      ),
    );
    expect(nodeText(root)).not.toContain('Version 4');
    app.unmount();
  });

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
      duration: 185,
      durationDeltaSigned: 0,
      saveState: 'saved',
      alreadySaved: true,
    };
    const lrclib = {
      ...netease,
      providerId: 'lrclib',
      candidateKey: 'lrclib:42',
      capability: { level: 'T1', partial: false },
      compatibility: { t0: true, t1: true, t2: false },
      previewLines: [{ start: 1, text: 'Line timed' }],
      duration: 187,
      durationDeltaSigned: 2,
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
    expect(nodeText(root).match(/建議來源/g)).toHaveLength(1);
    expect(nodeText(root)).toContain('3:05 · 相同');
    expect(nodeText(root)).toContain('3:07 · 多 2 秒');
    expect(nodeText(root)).toContain('已儲存');
    expect(findButtonByText(root, '已儲存')).toBeUndefined();
    expect(nodeText(root)).not.toContain('已保存');

    const recommendedToggle = findByProp(
      root,
      'aria-label',
      '收合 Song，Artist，建議來源',
    );
    expect(recommendedToggle.props.class).toContain('ui-btn');
    const expandedToggle = findByProp(root, 'aria-expanded', true);
    const previewId = expandedToggle.props['aria-controls'];
    expect(previewId).toBeTruthy();
    expect(findByProp(root, 'id', previewId)).toBeDefined();
    expect(nodeText(root)).toContain('0:01');
    recommendedToggle.props.onClick();
    await nextTick();
    expect(findByProp(root, 'aria-expanded', true)).toBeUndefined();
    findByProp(
      root,
      'aria-label',
      '展開 Song，Artist，建議來源',
    ).props.onClick();
    await nextTick();
    findByProp(root, 'aria-label', '展開 Song，Artist').props.onClick();
    await nextTick();
    expect(
      findByProp(root, 'aria-expanded', true).props['aria-controls'],
    ).not.toBe(previewId);
    expect(findByProp(root, 'id', previewId)).toBeUndefined();
    findByProp(root, 'aria-label', '收合 Song，Artist').props.onClick();
    await nextTick();
    expect(findByProp(root, 'aria-expanded', true)).toBeUndefined();

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
    await vi.waitFor(() =>
      expect(nodeText(root)).toContain('找不到歌詞。試試其他關鍵字。'),
    );

    expect(nodeText(root)).not.toContain('部分來源沒有結果');
    expect(nodeText(root)).not.toContain('網易雲音樂沒有找到');
    expect(nodeText(root)).not.toContain('Better Lyrics 公開快取');
    expect(nodeText(root)).not.toContain('部分來源未完成');
    expect(nodeText(root)).not.toContain('找到 0 個版本');
    expect(nodeText(root).match(/找不到歌詞。試試其他關鍵字。/g)).toHaveLength(
      1,
    );

    app.unmount();
  });

  it('renders no empty-state prompt for a normal Better Lyrics miss', async () => {
    vi.stubGlobal('Document', class Document {});
    vi.stubGlobal('ShadowRoot', class ShadowRoot {});
    const state = reactive({
      candidateSearch: {
        isLoading: false,
        status: null,
        reason: null,
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
      state.candidateSearch.status = 'unavailable';
      state.candidateSearch.reason = 'cache-miss';
      return {
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'cache-miss',
        candidates: [],
      };
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
      providerId: 'betterlyrics',
      providerLabel: 'Better Lyrics',
    });
    await vi.waitFor(() =>
      expect(searchLyricsProviderCandidates).toHaveBeenCalledOnce(),
    );
    await vi.waitFor(() =>
      expect(state.candidateSearch.status).toBe('unavailable'),
    );
    await nextTick();

    expect(nodeText(root)).not.toContain('目前找不到可用的候選歌詞');
    expect(nodeText(root)).not.toContain('找不到歌詞。試試其他關鍵字。');
    expect(nodeText(root)).not.toContain('公開快取');

    app.unmount();
  });

  it('shows one retryable notice when a provider fails and no results remain', async () => {
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
    await vi.waitFor(() => expect(nodeText(root)).toContain('歌詞搜尋未完成'));

    expect(nodeText(root)).toContain('Better Lyrics 回應逾時');
    expect(nodeText(root)).not.toContain('部分來源未完成');
    expect(nodeText(root)).not.toContain('找不到歌詞。試試其他關鍵字。');
    state.candidateSearch.providerStatuses.push({
      provider: 'kugou',
      status: 'ok',
    });
    await nextTick();
    expect(nodeText(root)).toContain('酷狗備援未取得符合條件的歌詞');
    expect(nodeText(root)).toContain('原文曲名或已知別名');

    app.unmount();
  });

  it.each([
    ['error', false, 'offline', 'LRCLIB 無法連線'],
    ['ok', true, 'service-unavailable', 'LRCLIB 服務暫時無法使用'],
    ['error', false, 'invalid-ttml', 'Better Lyrics 的歌詞格式無法解析'],
    ['ok', true, 'request-budget-exhausted', 'LRCLIB 已達本次查詢上限'],
  ])(
    'merges %s source failures (%s, %s) with invalid-record details',
    async (status, partial, reason, message) => {
      vi.stubGlobal('Document', class Document {});
      vi.stubGlobal('ShadowRoot', class ShadowRoot {});
      const candidate = {
        id: 42,
        providerId: 'netease',
        candidateKey: 'netease:42',
        trackName: 'Song',
        artistName: 'Artist',
        matchBand: 'exact',
        capability: { level: 'unsupported', partial: false },
        compatibility: { t0: false, t1: false, t2: false },
        previewLines: [],
        warnings: ['invalid-lyricsfile'],
        saveState: 'unsaved',
        alreadySaved: false,
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
        state.candidateSearch.candidates = [candidate];
        state.candidateSearch.groups.best = [candidate];
        state.candidateSearch.partial = true;
        state.candidateSearch.invalidRecordCount = 1;
        state.candidateSearch.providerStatuses = [
          { provider: 'netease', status: 'ok' },
          {
            provider: reason === 'invalid-ttml' ? 'betterlyrics' : 'lrclib',
            status,
            partial,
            reason,
          },
        ];
        return { status: 'ok', candidates: [candidate] };
      });
      vi.doMock('../../composables/useLyrics.js', () => ({
        useLyrics: () => ({
          state,
          selectedTrack: ref({
            id: 'track-a',
            title: 'Song',
            artist: 'Artist',
          }),
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
        expect(nodeText(root)).toContain('部分線上結果未載入'),
      );

      expect(nodeText(root)).toContain(message);
      if (reason === 'request-budget-exhausted')
        expect(findButtonByText(root, '擴大搜尋').props.disabled).toBe(false);
      expect(nodeText(root)).toContain('另有 1 筆結果無法使用');
      expect(nodeText(root)).toContain('已載入的結果仍可檢視與儲存');
      expect(
        findByProp(root, 'aria-label', '儲存 Song，Artist'),
      ).toBeUndefined();
      expect(nodeText(root).match(/部分線上結果未載入/g)).toHaveLength(1);
      expect(nodeText(root)).not.toContain('部分候選未顯示');
      expect(nodeText(root)).not.toContain('部分來源未完成');
      expect(nodeText(root)).not.toContain('歌詞搜尋未完成');
      app.unmount();
    },
  );

  it('shows only the global error when every provider fails', async () => {
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
      state.candidateSearch.status = 'error';
      state.candidateSearch.error =
        '目前無法搜尋任何線上歌詞來源，請稍後再試。';
      state.candidateSearch.providerStatuses = [
        { provider: 'lrclib', status: 'error', reason: 'offline' },
        { provider: 'netease', status: 'error', reason: 'timeout' },
      ];
      return { status: 'error', reason: 'all-providers-failed' };
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
    await vi.waitFor(() => expect(nodeText(root)).toContain('歌詞搜尋未完成'));

    expect(nodeText(root).match(/歌詞搜尋未完成/g)).toHaveLength(1);
    expect(nodeText(root)).not.toContain('部分來源未完成');
    expect(nodeText(root)).not.toContain('找不到歌詞。試試其他關鍵字。');
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
    expect(titleInput.props['aria-describedby']).toBe('lrclib-query-help');
    expect(artistInput.props['aria-describedby']).toBe('lrclib-query-help');
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
    expect(nodeText(root)).toContain('輸入歌名開始搜尋');

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
    const submitButton = findAll(
      root,
      (n) => n.type === 'button' && n.props.type === 'submit',
    )[0];
    expect(broadenButton.parent).toBe(submitButton.parent);
    expect(broadenButton.parent.props['aria-label']).toBe('搜尋操作');
    expect(broadenButton.parent.children.indexOf(broadenButton)).toBeLessThan(
      broadenButton.parent.children.indexOf(submitButton),
    );
    await broadenButton.props.onClick();
    expect(searchLyricsCandidates).toHaveBeenLastCalledWith(
      {
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      },
      'track-a',
    );

    await nextTick();
    const unavailableBroaden = findButtonByText(root, '擴大搜尋');
    expect(unavailableBroaden).toBe(broadenButton);
    expect(unavailableBroaden.props.disabled).toBe(true);
    expect(unavailableBroaden.props['aria-hidden']).toBe(true);
    expect(unavailableBroaden.props.class).toContain(
      'lyrics-lrclib-search__broaden--hidden',
    );

    state.candidateSearch.isLoading = true;
    await nextTick();
    expect(nodeText(findByProp(root, 'type', 'submit'))).toContain('搜尋');
    expect(nodeText(findByProp(root, 'type', 'submit'))).not.toContain(
      '搜尋中',
    );
    expect(findByProp(root, 'type', 'submit').props.disabled).toBe(true);
    state.candidateSearch.isLoading = false;
    await nextTick();

    const saveButton = findByProp(
      root,
      'aria-label',
      '儲存 Candidate 1，Artist',
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
      '儲存 Candidate 1，Artist',
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
      expect(nodeText(root)).toContain('沒有可用的歌詞結果'),
    );

    expect(nodeText(root)).toContain('沒有可用的歌詞結果');
    expect(nodeText(root)).not.toContain('找不到歌詞。試試其他關鍵字。');
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
      '儲存 Plain lyrics，Artist',
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
      findByProp(root, 'aria-label', '儲存 Unsupported lyrics，Artist'),
    ).toBeUndefined();
    app.unmount();
  });
});

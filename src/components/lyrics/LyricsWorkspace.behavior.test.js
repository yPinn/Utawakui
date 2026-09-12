import fs from 'fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { describe, expect, it, vi } from 'vitest';
import LyricsLiveControls from './LyricsLiveControls.vue';
import LyricsDocumentPanel from './LyricsDocumentPanel.vue';
import LyricsPreparationBar from './LyricsPreparationBar.vue';
import LyricsSegmentEditor from './LyricsSegmentEditor.vue';
import LyricsTimingToolbar from './LyricsTimingToolbar.vue';
import LyricsWorkspaceHeader from './LyricsWorkspaceHeader.vue';
import SeparationPresetControl from '../separation/SeparationPresetControl.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';

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

attachClientRender(LyricsLiveControls, './LyricsLiveControls.vue');
attachClientRender(LyricsDocumentPanel, './LyricsDocumentPanel.vue');
attachClientRender(LyricsPreparationBar, './LyricsPreparationBar.vue');
attachClientRender(LyricsSegmentEditor, './LyricsSegmentEditor.vue');
attachClientRender(LyricsTimingToolbar, './LyricsTimingToolbar.vue');
attachClientRender(LyricsWorkspaceHeader, './LyricsWorkspaceHeader.vue');
attachClientRender(
  SeparationPresetControl,
  '../separation/SeparationPresetControl.vue',
);
attachClientRender(UiButton, '../ui/UiButton.vue');
attachClientRender(UiChip, '../ui/UiChip.vue');
attachClientRender(UiHint, '../ui/UiHint.vue');
attachClientRender(UiIconButton, '../ui/UiIconButton.vue');
attachClientRender(UiNotice, '../ui/UiNotice.vue');

function hostNode(type, text = '') {
  return { type, text, props: {}, children: [], parent: null };
}

const renderer = createRenderer({
  patchProp(element, key, _previousValue, nextValue) {
    element.props[key] = nextValue;
  },
  insert(child, parent, anchor = null) {
    child.parent = parent;
    if (!anchor) {
      parent.children.push(child);
      return;
    }
    parent.children.splice(parent.children.indexOf(anchor), 0, child);
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
  insertStaticContent(content, parent, anchor) {
    const node = hostNode('static', content);
    this.insert(node, parent, anchor);
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

function findByType(root, type) {
  return findAll(root, (node) => node.type === type)[0];
}

function nodeText(node) {
  return [node.text, ...(node.children ?? []).map(nodeText)].join('');
}

describe('Lyrics workspace control contracts', () => {
  it('keeps document display events semantic and keyed by stable line id', () => {
    const seekLine = vi.fn();
    const editTiming = vi.fn();
    const panel = mount(LyricsDocumentPanel, {
      lines: [{ lineId: 'line_1', start: 1, text: 'Hello world' }],
      trackCount: 1,
      hasSelectedTrack: true,
      lyricsStatus: 'available',
      hasSelectedSource: true,
      activeLineIndex: 0,
      canEditTiming: true,
      onSeekLine: seekLine,
      onEditTiming: editTiming,
    });

    findByProp(panel.root, 'aria-label', '從 0:01 播放').props.onClick();
    findByProp(
      panel.root,
      'aria-label',
      '編輯逐字時間：Hello world',
    ).props.onClick();

    expect(seekLine).toHaveBeenCalledWith(
      expect.objectContaining({ lineId: 'line_1' }),
    );
    expect(editTiming).toHaveBeenCalledWith('line_1');
  });

  it('lets manual scrolling pause line following until the return action resumes it', async () => {
    const activeLineIndex = ref(0);
    const documentId = ref('lyrics-document-1');
    const lines = [
      { lineId: 'line_1', start: 1, text: 'First line' },
      { lineId: 'line_2', start: 2, text: 'Second line' },
    ];
    const harness = {
      setup() {
        return () =>
          Vue.h(LyricsDocumentPanel, {
            documentId: documentId.value,
            lines,
            trackCount: 1,
            hasSelectedTrack: true,
            lyricsStatus: 'available',
            hasSelectedSource: true,
            activeLineIndex: activeLineIndex.value,
          });
      },
    };
    const panel = mount(harness);
    await nextTick();

    const reader = findByProp(panel.root, 'aria-label', '歌詞內容');
    const activeRow = {
      getBoundingClientRect: () => ({ top: 620, height: 48 }),
    };
    const scrollTo = vi.fn();
    reader.scrollTop = 160;
    reader.clientHeight = 400;
    reader.getBoundingClientRect = () => ({ top: 100 });
    reader.querySelector = () => activeRow;
    reader.scrollTo = scrollTo;

    expect(
      findByProp(panel.root, 'aria-label', '回到目前歌詞'),
    ).toBeUndefined();

    reader.props.onWheelPassive();
    await nextTick();
    const returnButton = findByProp(panel.root, 'aria-label', '回到目前歌詞');
    expect(returnButton).toBeTruthy();

    activeLineIndex.value = 1;
    await nextTick();
    expect(scrollTo).not.toHaveBeenCalled();

    await returnButton.props.onClick();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 536,
      behavior: 'smooth',
    });
    await nextTick();
    expect(
      findByProp(panel.root, 'aria-label', '回到目前歌詞'),
    ).toBeUndefined();

    scrollTo.mockClear();
    activeLineIndex.value = 0;
    await nextTick();
    await nextTick();
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('recognizes touch, keyboard, and scrollbar browsing and resets follow mode for a new document', async () => {
    const documentId = ref('lyrics-document-1');
    const harness = {
      setup() {
        return () =>
          Vue.h(LyricsDocumentPanel, {
            documentId: documentId.value,
            lines: [{ lineId: 'line_1', start: 1, text: 'First line' }],
            trackCount: 1,
            hasSelectedTrack: true,
            lyricsStatus: 'available',
            hasSelectedSource: true,
            activeLineIndex: 0,
          });
      },
    };
    const panel = mount(harness);
    await nextTick();
    const reader = findByProp(panel.root, 'aria-label', '歌詞內容');

    reader.props.onTouchmovePassive();
    await nextTick();
    expect(findByProp(panel.root, 'aria-label', '回到目前歌詞')).toBeTruthy();

    documentId.value = 'lyrics-document-2';
    await nextTick();
    expect(
      findByProp(panel.root, 'aria-label', '回到目前歌詞'),
    ).toBeUndefined();

    reader.props.onKeydown({
      key: 'PageDown',
      target: reader,
      currentTarget: reader,
    });
    await nextTick();
    expect(findByProp(panel.root, 'aria-label', '回到目前歌詞')).toBeTruthy();

    documentId.value = 'lyrics-document-3';
    await nextTick();
    reader.props.onPointerdown({ target: reader, currentTarget: reader });
    reader.scrollTop = 120;
    reader.props.onScroll();
    await nextTick();
    expect(findByProp(panel.root, 'aria-label', '回到目前歌詞')).toBeTruthy();
  });

  it('returns to the active line without smooth motion when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      const panel = mount(LyricsDocumentPanel, {
        documentId: 'lyrics-document-1',
        lines: [{ lineId: 'line_1', start: 1, text: 'First line' }],
        trackCount: 1,
        hasSelectedTrack: true,
        lyricsStatus: 'available',
        hasSelectedSource: true,
        activeLineIndex: 0,
      });
      await nextTick();
      const reader = findByProp(panel.root, 'aria-label', '歌詞內容');
      const scrollTo = vi.fn();
      reader.scrollTop = 0;
      reader.clientHeight = 200;
      reader.getBoundingClientRect = () => ({ top: 0 });
      reader.querySelector = () => ({
        getBoundingClientRect: () => ({ top: 300, height: 40 }),
      });
      reader.scrollTo = scrollTo;

      reader.props.onWheelPassive();
      await nextTick();
      await findByProp(
        panel.root,
        'aria-label',
        '回到目前歌詞',
      ).props.onClick();

      expect(scrollTo).toHaveBeenCalledWith({
        top: 236,
        behavior: 'auto',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('emits global timing commands and reports compact draft progress', () => {
    const undo = vi.fn();
    const save = vi.fn();
    const cancel = vi.fn();
    const toolbar = mount(LyricsTimingToolbar, {
      canTap: true,
      canUndo: true,
      canSave: true,
      completedBoundaries: 1,
      totalBoundaries: 2,
      onUndo: undo,
      onSave: save,
      onCancel: cancel,
    });

    findByProp(toolbar.root, 'aria-label', '復原逐字時間').props.onClick();
    findByProp(toolbar.root, 'aria-label', '儲存逐字時間').props.onClick();
    findByProp(toolbar.root, 'aria-label', '取消逐字編輯').props.onClick();

    expect(nodeText(toolbar.root)).toContain('逐字校時');
    expect(nodeText(toolbar.root)).toContain('已記錄 1 / 2');
    expect(nodeText(toolbar.root)).toContain('復原');
    expect(nodeText(toolbar.root)).toContain('儲存');
    expect(nodeText(toolbar.root)).toContain('取消');
    expect(undo).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('shows one next tap target and nudges only the selected recorded boundary', async () => {
    const nudge = vi.fn();
    const tap = vi.fn();
    const editor = mount(LyricsSegmentEditor, {
      draft: {
        lineId: 'line_1',
        text: 'Hello world',
        segments: [
          {
            segmentId: 's_1',
            text: 'Hello ',
            startMs: 1000,
            endMs: 1500,
          },
          {
            segmentId: 's_2',
            text: 'world',
            startMs: 1500,
            endMs: 2000,
          },
          {
            segmentId: 's_3',
            text: ' again',
            startMs: null,
            endMs: 2500,
          },
        ],
      },
      canTap: true,
      onNudgeBoundary: nudge,
      onTap: tap,
    });

    expect(nodeText(editor.root)).toContain('下一個起點：「again」');
    findByProp(editor.root, 'aria-label', '記錄「again」起點').props.onClick();
    expect(tap).toHaveBeenCalledOnce();

    findByProp(
      editor.root,
      'aria-label',
      '選取「world」的起點 1.50 秒',
    ).props.onClick();
    await nextTick();
    findByProp(
      editor.root,
      'aria-label',
      '將「world」提前 0.1 秒',
    ).props.onClick();
    findByProp(
      editor.root,
      'aria-label',
      '將「world」延後 0.1 秒',
    ).props.onClick();

    expect(nudge.mock.calls).toEqual([
      [1, -100],
      [1, 100],
    ]);
  });

  it('shows completion without a record action when every boundary is set', () => {
    const editor = mount(LyricsSegmentEditor, {
      draft: {
        lineId: 'line_1',
        text: 'Hello world',
        segments: [
          { segmentId: 's_1', text: 'Hello ', startMs: 1000, endMs: 1500 },
          { segmentId: 's_2', text: 'world', startMs: 1500, endMs: 2000 },
        ],
      },
      canTap: false,
    });

    expect(nodeText(editor.root)).toContain('起點已全部記錄');
    expect(findByProp(editor.root, 'aria-label', '記錄「world」起點')).toBe(
      undefined,
    );
  });

  it('shows reading failures through the shared notice component', () => {
    const empty = mount(LyricsPreparationBar, {
      showsReadingAid: true,
      lyricsScript: 'ja',
    });
    const failed = mount(LyricsPreparationBar, {
      showsReadingAid: true,
      lyricsScript: 'ja',
      readingError: '讀音產生失敗',
    });

    expect(findByProp(empty.root, 'role', 'alert')).toBeUndefined();
    expect(findByProp(failed.root, 'role', 'alert')).toBeTruthy();
    expect(
      findAll(failed.root, (node) => node.text === '讀音產生失敗'),
    ).toHaveLength(1);
  });

  it('applies reading selection on change without adjacent status or commands', () => {
    const handlers = {
      source: vi.fn(),
      manage: vi.fn(),
      reading: vi.fn(),
      decrease: vi.fn(),
      increase: vi.fn(),
    };
    const { root } = mount(LyricsPreparationBar, {
      sources: [{ filename: 'main.lrc', kind: 'manual' }],
      selectedSourceFilename: 'main.lrc',
      hasSelectedTrack: true,
      showsReadingAid: true,
      lyricsScript: 'ja',
      readingVariant: 'furigana',
      canDecreaseFontSize: true,
      canIncreaseFontSize: true,
      onSourceChange: handlers.source,
      onManageSources: handlers.manage,
      onReadingVariantChange: handlers.reading,
      onDecreaseFontSize: handlers.decrease,
      onIncreaseFontSize: handlers.increase,
    });

    findByProp(root, 'aria-label', '歌詞來源').props.onChange({
      target: { value: 'main.lrc' },
    });
    findByProp(root, 'title', '管理歌詞來源').props.onClick();
    findByProp(root, 'aria-label', '讀音顯示').props.onChange({
      target: { value: 'furigana' },
    });
    expect(nodeText(root)).not.toContain('已自動套用');
    expect(findByProp(root, 'title', '重新建立讀音資料')).toBeUndefined();
    expect(findByProp(root, 'title', '重試建立讀音資料')).toBeUndefined();
    findByProp(root, 'title', '縮小歌詞').props.onClick();
    findByProp(root, 'title', '放大歌詞').props.onClick();

    expect(handlers.source).toHaveBeenCalledWith('main.lrc');
    expect(handlers.manage).toHaveBeenCalledOnce();
    expect(handlers.reading).toHaveBeenCalledWith('furigana');
    expect(handlers.decrease).toHaveBeenCalledOnce();
    expect(handlers.increase).toHaveBeenCalledOnce();
  });

  it('orders Original before Traditional Chinese while keeping Traditional selected by default', () => {
    const changeVariant = vi.fn();
    const { root } = mount(LyricsPreparationBar, {
      showsLyricsTextVariant: true,
      lyricsTextVariant: 'traditional-tw',
      onLyricsTextVariantChange: changeVariant,
    });
    const selector = findByProp(root, 'aria-label', '歌詞文字顯示');
    const options = findAll(selector, (node) => node.type === 'option');

    expect(selector.props.value).toBe('traditional-tw');
    expect(options.map((option) => option.props.value)).toEqual([
      'original',
      'traditional-tw',
    ]);
    expect(options.map(nodeText)).toEqual(['原文', '繁體中文']);

    selector.props.onChange({ target: { value: 'original' } });

    expect(changeVariant).toHaveBeenCalledWith('original');
  });

  it('hides the text display control for non-Chinese lyrics', () => {
    const { root } = mount(LyricsPreparationBar, {
      showsLyricsTextVariant: false,
      lyricsTextVariant: 'traditional-tw',
    });

    expect(findByProp(root, 'aria-label', '歌詞文字顯示')).toBeUndefined();
  });

  it('emits header and live-control commands without changing their meaning', () => {
    const selectTrack = vi.fn();
    const refresh = vi.fn();
    const preset = vi.fn();
    const generateSeparation = vi.fn();
    const adjustOffset = vi.fn();
    const resetOffset = vi.fn();
    const header = mount(LyricsWorkspaceHeader, {
      track: { title: 'Euphoria', lyrics: { status: 'available' } },
      trackMeta: 'BTS / 3:49',
      separationPresetOptions: [{ id: 'quick', label: '速度優先' }],
      selectedSeparationPresetId: 'quick',
      onSeparationPresetChange: preset,
      onGenerateSeparation: generateSeparation,
      onSelectTrack: selectTrack,
      onRefresh: refresh,
    });
    const live = mount(LyricsLiveControls, {
      offsetLabel: '+0.2s',
      canReset: true,
      onAdjustOffset: adjustOffset,
      onResetOffset: resetOffset,
    });

    findByProp(header.root, 'title', '選擇歌詞曲目').props.onClick();
    findByProp(header.root, 'title', '重新掃描歌詞').props.onClick();
    findByProp(header.root, 'aria-label', '伴奏處理模式').props.onChange({
      target: { value: 'quick' },
    });
    findByProp(header.root, 'aria-label', '產生伴奏').props.onClick();
    findByProp(live.root, 'aria-label', '延後 0.1 秒').props.onClick();
    findByProp(live.root, 'aria-label', '重設歌詞時間偏移').props.onClick();
    findByProp(live.root, 'aria-label', '提前 0.1 秒').props.onClick();

    expect(selectTrack).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(preset).toHaveBeenCalledWith('quick');
    expect(generateSeparation).toHaveBeenCalledOnce();
    expect(adjustOffset.mock.calls).toEqual([[-0.1], [0.1]]);
    expect(resetOffset).toHaveBeenCalledOnce();
  });

  it('offers an explicit retry when offset persistence fails', () => {
    const retry = vi.fn();
    const live = mount(LyricsLiveControls, {
      offsetLabel: '+0.2s',
      canReset: true,
      error: '同步調整未儲存，請再試一次。',
      onRetryOffset: retry,
    });
    const retryButton = findAll(
      live.root,
      (node) => node.type === 'button' && nodeText(node).includes('重試'),
    )[0];

    expect(findByProp(live.root, 'role', 'alert')).toBeTruthy();
    retryButton.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('LyricsWorkspace event wiring', () => {
  it('routes child selection and live commands to the existing composables', async () => {
    const track = {
      id: 'track-1',
      title: 'Euphoria',
      artist: 'BTS',
      duration: 229,
      lyrics: { status: 'available' },
      separation: {
        results: {
          'high-quality': { modelIds: ['kara2'], legacy: true },
        },
      },
    };
    const source = { filename: 'main.lrc', kind: 'manual' };
    const secondTrack = {
      ...track,
      id: 'track-2',
      title: 'Second song',
    };
    const secondSource = { filename: 'second.lrc', kind: 'manual' };
    const selectedTrackRef = ref(track);
    const selectedSourceRef = ref(source);
    const playerState = reactive({
      track: { id: track.id },
      currentTime: 4,
      continuityRevision: 0,
    });
    const lyricsState = reactive({
      tracks: [track],
      selectedSourceFilename: source.filename,
      offsetSeconds: 0.2,
      error: '',
      isLoading: false,
      isLoadingLyrics: false,
      timingSave: { isSaving: false, error: null },
      offsetSave: { isSaving: false, error: null },
      backfillStatus: { error: '', isRunning: false },
    });
    const selectSource = vi.fn();
    const adjustOffset = vi.fn();
    const resetOffset = vi.fn();
    const refresh = vi.fn();
    const generateReading = vi.fn();
    const loadReading = vi.fn().mockResolvedValue(null);
    const readingDoc = ref(null);
    const separate = vi.fn();
    const selectPreset = vi.fn();
    const selectedPreset = ref('quick');
    const readingVariant = ref('off');
    const lyricsTextVariant = ref('traditional-tw');
    const setLyricsTextVariant = vi.fn((variant) => {
      lyricsTextVariant.value = variant;
    });
    const lyricsDocumentRef = ref({
      granularity: 'T1',
      lines: [
        {
          lineId: 'line_1',
          text: '너는 내 삶에 다시 뜬 햇빛',
          startMs: 0,
          endMs: null,
        },
      ],
    });
    const lyricLinesRef = ref([
      { lineId: 'line_1', start: 0, text: '너는 내 삶에 다시 뜬 햇빛' },
    ]);

    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state: lyricsState,
        selectedTrack: selectedTrackRef,
        selectedLyrics: ref({ status: 'available', sources: [source] }),
        selectedSource: selectedSourceRef,
        lyricsDocument: lyricsDocumentRef,
        lyricsTextVariant,
        lyricLines: lyricLinesRef,
        activeLineIndex: ref(-1),
        currentLyricsPositionMs: ref(0),
        isReloading: ref(false),
        refresh,
        selectSource,
        setLyricsTextVariant,
        adjustOffset,
        resetOffset,
        retryOffsetSave: vi.fn(),
        playFromLine: vi.fn(),
        saveTimingDocument: vi.fn(),
      }),
    }));
    vi.doMock('../../composables/useLyricsReading.js', () => ({
      useLyricsReading: () => ({
        variant: readingVariant,
        getDoc: () => readingDoc.value,
        isGenerating: () => false,
        errorFor: () => null,
        loadReading,
        generateReading,
        setReadingLine: vi.fn(),
      }),
    }));
    vi.doMock('../../composables/useSeparation.js', () => ({
      useSeparation: () => ({
        state: { errors: new Map() },
        isSeparating: () => false,
        presetIdFor: () => selectedPreset.value,
        progressPercent: () => 0,
        separate,
        selectPreset: (selectedTrack, presetId) => {
          selectedPreset.value = presetId;
          return selectPreset(selectedTrack, presetId);
        },
      }),
    }));
    vi.doMock('../../composables/usePlayer.js', () => ({
      usePlayer: () => ({ state: playerState }),
    }));

    const [
      { default: LyricsTrackPickerModal },
      { default: LyricsSourceManagerModal },
    ] = await Promise.all([
      import('./LyricsTrackPickerModal.vue'),
      import('./LyricsSourceManagerModal.vue'),
    ]);
    LyricsTrackPickerModal.setup = (props) => () =>
      Vue.h('track-picker-probe', { 'data-open': props.open });
    LyricsSourceManagerModal.setup = (props) => () =>
      Vue.h('source-manager-probe', { 'data-open': props.open });

    const { default: LyricsWorkspace } = await import('./LyricsWorkspace.vue');
    attachClientRender(LyricsWorkspace, './LyricsWorkspace.vue');
    const { root } = mount(LyricsWorkspace);
    await Promise.resolve();
    expect(loadReading).toHaveBeenCalledWith(
      track.id,
      source.filename,
      lyricsDocumentRef.value,
    );
    expect(generateReading).not.toHaveBeenCalled();

    findByProp(root, 'title', '選擇歌詞曲目').props.onClick();
    findByProp(root, 'title', '重新掃描歌詞').props.onClick();
    findByProp(root, 'title', '管理歌詞來源').props.onClick();
    findByProp(root, 'aria-label', '歌詞來源').props.onChange({
      target: { value: 'main.lrc' },
    });
    findByProp(root, 'aria-label', '讀音顯示').props.onChange({
      target: { value: 'romaji' },
    });
    await Promise.resolve();
    await nextTick();
    expect(generateReading).toHaveBeenCalledOnce();
    readingDoc.value = { lines: [] };
    loadReading.mockResolvedValue(readingDoc.value);
    findByProp(root, 'aria-label', '讀音顯示').props.onChange({
      target: { value: 'off' },
    });
    findByProp(root, 'aria-label', '讀音顯示').props.onChange({
      target: { value: 'furigana' },
    });
    findByProp(root, 'title', '縮小歌詞').props.onClick();
    await nextTick();
    expect(findByProp(root, 'title', '縮小歌詞').props.disabled).toBe(true);
    findByProp(root, 'title', '放大歌詞').props.onClick();
    findByProp(root, 'title', '放大歌詞').props.onClick();
    await nextTick();
    expect(findByProp(root, 'title', '放大歌詞').props.disabled).toBe(true);
    findByProp(root, 'aria-label', '伴奏處理模式').props.onChange({
      target: { value: 'high-quality' },
    });
    await nextTick();
    expect(separate).not.toHaveBeenCalled();
    expect(findByProp(root, 'aria-label', '此模式已產生')).toBeTruthy();
    findByProp(root, 'aria-label', '伴奏處理模式').props.onChange({
      target: { value: 'quick' },
    });
    await nextTick();
    findByProp(root, 'aria-label', '產生伴奏').props.onClick();
    findByProp(root, 'aria-label', '延後 0.1 秒').props.onClick();
    findByProp(root, 'aria-label', '重設歌詞時間偏移').props.onClick();
    findByProp(root, 'aria-label', '提前 0.1 秒').props.onClick();

    expect(findByType(root, 'track-picker-probe').props['data-open']).toBe(
      true,
    );
    expect(findByType(root, 'source-manager-probe').props['data-open']).toBe(
      true,
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(selectSource).toHaveBeenCalledWith('main.lrc');
    expect(readingVariant.value).toBe('furigana');
    expect(generateReading).toHaveBeenCalledOnce();
    expect(selectPreset.mock.calls).toEqual([
      [track, 'high-quality'],
      [track, 'quick'],
    ]);
    expect(separate).toHaveBeenCalledWith(track, 'quick');
    expect(adjustOffset.mock.calls).toEqual([[-0.1], [0.1]]);
    expect(resetOffset).toHaveBeenCalledOnce();

    loadReading.mockClear();
    generateReading.mockClear();
    loadReading.mockResolvedValueOnce(null);
    selectedTrackRef.value = secondTrack;
    selectedSourceRef.value = secondSource;
    await Promise.resolve();
    await nextTick();
    expect(loadReading).toHaveBeenCalledOnce();
    expect(loadReading).toHaveBeenLastCalledWith(
      'track-2',
      'second.lrc',
      lyricsDocumentRef.value,
    );
    expect(generateReading).toHaveBeenCalledOnce();
    expect(generateReading).toHaveBeenLastCalledWith(
      'track-2',
      'second.lrc',
      expect.any(Object),
      'ko',
    );

    loadReading.mockClear();
    generateReading.mockClear();
    playerState.track = { id: secondTrack.id };
    await nextTick();
    expect(loadReading).not.toHaveBeenCalled();
    playerState.currentTime = 0.1;
    await nextTick();
    expect(loadReading).toHaveBeenCalledOnce();
    expect(loadReading).toHaveBeenLastCalledWith(
      'track-2',
      'second.lrc',
      lyricsDocumentRef.value,
    );
    expect(generateReading).not.toHaveBeenCalled();

    loadReading.mockClear();
    playerState.continuityRevision += 1;
    await nextTick();
    expect(loadReading).toHaveBeenCalledOnce();
    expect(loadReading).toHaveBeenLastCalledWith(
      'track-2',
      'second.lrc',
      lyricsDocumentRef.value,
    );
    expect(generateReading).not.toHaveBeenCalled();

    let resolveStaleTrackLoad;
    const staleTrackLoad = new Promise((resolve) => {
      resolveStaleTrackLoad = resolve;
    });
    const thirdTrack = { ...track, id: 'track-3', title: 'Third song' };
    const thirdSource = { filename: 'third.lrc', kind: 'manual' };
    const fourthTrack = { ...track, id: 'track-4', title: 'Fourth song' };
    const fourthSource = { filename: 'fourth.lrc', kind: 'manual' };
    loadReading.mockImplementationOnce(() => staleTrackLoad);
    loadReading.mockClear();
    generateReading.mockClear();
    selectedTrackRef.value = thirdTrack;
    selectedSourceRef.value = thirdSource;
    await nextTick();
    expect(loadReading).toHaveBeenLastCalledWith(
      'track-3',
      'third.lrc',
      lyricsDocumentRef.value,
    );

    selectedTrackRef.value = fourthTrack;
    selectedSourceRef.value = fourthSource;
    await Promise.resolve();
    await nextTick();
    resolveStaleTrackLoad(null);
    await Promise.resolve();
    await nextTick();
    expect(generateReading).not.toHaveBeenCalled();

    loadReading.mockResolvedValueOnce(undefined);
    const fifthTrack = { ...track, id: 'track-5', title: 'Fifth song' };
    const fifthSource = { filename: 'fifth.lrc', kind: 'manual' };
    selectedTrackRef.value = fifthTrack;
    selectedSourceRef.value = fifthSource;
    await Promise.resolve();
    await nextTick();
    expect(generateReading).not.toHaveBeenCalled();

    loadReading.mockClear();
    generateReading.mockClear();
    loadReading.mockResolvedValue(null);
    readingDoc.value = null;
    lyricLinesRef.value = [];
    lyricsDocumentRef.value = { granularity: 'T1', lines: [] };
    const sixthTrack = { ...track, id: 'track-6', title: 'Sixth song' };
    const sixthSource = { filename: 'sixth.lrc', kind: 'manual' };
    selectedTrackRef.value = sixthTrack;
    selectedSourceRef.value = sixthSource;
    await Promise.resolve();
    await nextTick();
    expect(loadReading).toHaveBeenCalledWith(
      'track-6',
      'sixth.lrc',
      lyricsDocumentRef.value,
    );
    expect(generateReading).not.toHaveBeenCalled();

    lyricsDocumentRef.value = {
      granularity: 'T1',
      lines: [
        {
          lineId: 'line_ja',
          text: '君の声',
          startMs: 0,
          endMs: null,
        },
      ],
    };
    lyricLinesRef.value = [{ lineId: 'line_ja', start: 0, text: '君の声' }];
    await Promise.resolve();
    await nextTick();
    expect(generateReading).toHaveBeenCalledOnce();
    expect(generateReading).toHaveBeenLastCalledWith(
      'track-6',
      'sixth.lrc',
      lyricsDocumentRef.value,
      'ja',
    );
  });
});

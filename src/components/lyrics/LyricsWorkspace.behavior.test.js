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

  it('emits timing commands without owning the player clock or document save', () => {
    const tap = vi.fn();
    const undo = vi.fn();
    const save = vi.fn();
    const cancel = vi.fn();
    const toolbar = mount(LyricsTimingToolbar, {
      granularity: 'T2',
      hasDraft: true,
      canTap: true,
      canUndo: true,
      canSave: true,
      onTap: tap,
      onUndo: undo,
      onSave: save,
      onCancel: cancel,
    });

    findByProp(toolbar.root, 'aria-label', '記錄目前播放位置').props.onClick();
    findByProp(toolbar.root, 'aria-label', '復原逐字時間').props.onClick();
    findByProp(toolbar.root, 'aria-label', '儲存逐字時間').props.onClick();
    findByProp(toolbar.root, 'aria-label', '取消逐字編輯').props.onClick();

    expect(tap).toHaveBeenCalledOnce();
    expect(undo).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('emits boundary nudges by boundary index and delta', () => {
    const nudge = vi.fn();
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
        ],
      },
      onNudgeBoundary: nudge,
    });

    findByProp(
      editor.root,
      'aria-label',
      '將第 2 段提前 0.1 秒',
    ).props.onClick();
    findByProp(
      editor.root,
      'aria-label',
      '將第 2 段延後 0.1 秒',
    ).props.onClick();

    expect(nudge.mock.calls).toEqual([
      [1, -100],
      [1, 100],
    ]);
  });

  it('reserves the reading error slot before and after an error appears', () => {
    const empty = mount(LyricsPreparationBar, {
      showsReadingAid: true,
      lyricsScript: 'ja',
    });
    const failed = mount(LyricsPreparationBar, {
      showsReadingAid: true,
      lyricsScript: 'ja',
      readingError: '讀音產生失敗',
    });

    expect(
      findAll(empty.root, (node) =>
        String(node.props?.class || '').includes(
          'lyrics-preparation__error-slot',
        ),
      ),
    ).toHaveLength(1);
    expect(
      findAll(failed.root, (node) =>
        String(node.props?.class || '').includes(
          'lyrics-preparation__error-slot',
        ),
      ),
    ).toHaveLength(1);
    expect(findByProp(failed.root, 'role', 'alert').props['aria-label']).toBe(
      '讀音產生失敗',
    );
  });

  it('emits preparation selections and commands with semantic payloads', () => {
    const handlers = {
      source: vi.fn(),
      manage: vi.fn(),
      reading: vi.fn(),
      generate: vi.fn(),
      decrease: vi.fn(),
      increase: vi.fn(),
    };
    const { root } = mount(LyricsPreparationBar, {
      sources: [{ filename: 'main.lrc', kind: 'manual' }],
      selectedSourceFilename: 'main.lrc',
      hasSelectedTrack: true,
      showsReadingAid: true,
      lyricsScript: 'ja',
      readingVariant: 'off',
      canDecreaseFontSize: true,
      canIncreaseFontSize: true,
      onSourceChange: handlers.source,
      onManageSources: handlers.manage,
      onReadingVariantChange: handlers.reading,
      onGenerateReading: handlers.generate,
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
    findByProp(root, 'title', '產生讀音').props.onClick();
    findByProp(root, 'title', '縮小歌詞').props.onClick();
    findByProp(root, 'title', '放大歌詞').props.onClick();

    expect(handlers.source).toHaveBeenCalledWith('main.lrc');
    expect(handlers.manage).toHaveBeenCalledOnce();
    expect(handlers.reading).toHaveBeenCalledWith('furigana');
    expect(handlers.generate).toHaveBeenCalledOnce();
    expect(handlers.decrease).toHaveBeenCalledOnce();
    expect(handlers.increase).toHaveBeenCalledOnce();
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
      separationPresetOptions: [{ id: 'quick', label: '快速分離' }],
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
    findByProp(header.root, 'aria-label', '伴奏分離設定').props.onChange({
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
    const lyricsState = reactive({
      tracks: [track],
      selectedSourceFilename: source.filename,
      offsetSeconds: 0.2,
      error: '',
      isLoading: false,
      isLoadingLyrics: false,
      timingSave: { isSaving: false, error: null },
      backfillStatus: { error: '', isRunning: false },
    });
    const selectSource = vi.fn();
    const adjustOffset = vi.fn();
    const resetOffset = vi.fn();
    const refresh = vi.fn();
    const generateReading = vi.fn();
    const separate = vi.fn();
    const selectPreset = vi.fn();
    const selectedPreset = ref('quick');
    const readingVariant = ref('off');

    vi.doMock('../../composables/useLyrics.js', () => ({
      useLyrics: () => ({
        state: lyricsState,
        selectedTrack: ref(track),
        selectedLyrics: ref({ status: 'available', sources: [source] }),
        selectedSource: ref(source),
        lyricsDocument: ref({
          granularity: 'T1',
          lines: [
            {
              lineId: 'line_1',
              text: '너는 내 삶에 다시 뜬 햇빛',
              startMs: 0,
              endMs: null,
            },
          ],
        }),
        lyricLines: ref([
          { lineId: 'line_1', start: 0, text: '너는 내 삶에 다시 뜬 햇빛' },
        ]),
        activeLineIndex: ref(-1),
        currentLyricsPositionMs: ref(0),
        isReloading: ref(false),
        refresh,
        selectSource,
        adjustOffset,
        resetOffset,
        playFromLine: vi.fn(),
        saveTimingDocument: vi.fn(),
      }),
    }));
    vi.doMock('../../composables/useLyricsReading.js', () => ({
      useLyricsReading: () => ({
        variant: readingVariant,
        getDoc: () => null,
        isGenerating: () => false,
        errorFor: () => null,
        loadReading: vi.fn(),
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

    findByProp(root, 'title', '選擇歌詞曲目').props.onClick();
    findByProp(root, 'title', '重新掃描歌詞').props.onClick();
    findByProp(root, 'title', '管理歌詞來源').props.onClick();
    findByProp(root, 'aria-label', '歌詞來源').props.onChange({
      target: { value: 'main.lrc' },
    });
    findByProp(root, 'aria-label', '讀音顯示').props.onChange({
      target: { value: 'romaji' },
    });
    findByProp(root, 'title', '產生讀音').props.onClick();
    findByProp(root, 'title', '縮小歌詞').props.onClick();
    await nextTick();
    expect(findByProp(root, 'title', '縮小歌詞').props.disabled).toBe(true);
    findByProp(root, 'title', '放大歌詞').props.onClick();
    findByProp(root, 'title', '放大歌詞').props.onClick();
    await nextTick();
    expect(findByProp(root, 'title', '放大歌詞').props.disabled).toBe(true);
    findByProp(root, 'aria-label', '伴奏分離設定').props.onChange({
      target: { value: 'high-quality' },
    });
    await nextTick();
    expect(separate).not.toHaveBeenCalled();
    expect(findByProp(root, 'aria-label', '此模型已產生')).toBeTruthy();
    findByProp(root, 'aria-label', '伴奏分離設定').props.onChange({
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
    expect(readingVariant.value).toBe('romaji');
    expect(generateReading).toHaveBeenCalledOnce();
    expect(selectPreset.mock.calls).toEqual([
      [track, 'high-quality'],
      [track, 'quick'],
    ]);
    expect(separate).toHaveBeenCalledWith(track, 'quick');
    expect(adjustOffset.mock.calls).toEqual([[-0.1], [0.1]]);
    expect(resetOffset).toHaveBeenCalledOnce();
  });
});

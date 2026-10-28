import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, createSSRApp, nextTick, reactive, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LyricsAuthoringWorkspace from './LyricsAuthoringWorkspace.vue';
import LyricsWorkspaceHeader from './LyricsWorkspaceHeader.vue';
import { mount } from '../ui/uiTestHost.js';
const owners = vi.hoisted(() => ({
  lyrics: null,
  reading: null,
  timing: null,
}));
vi.mock('../../composables/useLyrics.js', () => ({
  useLyrics: () => owners.lyrics,
}));
vi.mock('../../composables/useLyricsReading.js', () => ({
  useLyricsReading: () => owners.reading,
}));
vi.mock('../../composables/useLyricsTimingEditor.js', () => ({
  useLyricsTimingEditor: () => owners.timing,
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: reactive({}) }),
}));
let app;
let vm;
let readError;
beforeEach(() => {
  const document = {
    documentId: 'doc-a',
    source: { sha256: 'a'.repeat(64) },
    normalizerProfileId: 'v1',
    lines: [
      { lineId: 'one', text: '君の声', startMs: 0, endMs: 1000 },
      { lineId: 'two', text: 'あした', startMs: 1000, endMs: 2000 },
    ],
  };
  owners.lyrics = {
    state: reactive({
      timingSave: { isSaving: false },
      offsetSave: {},
      backfillStatus: {},
      tracks: [],
      offsetSeconds: 0,
    }),
    selectedTrack: shallowRef({ id: 'track-a' }),
    selectedSource: shallowRef({ filename: 'a.lrc' }),
    selectedLyrics: shallowRef({ sources: [] }),
    lyricsDocument: shallowRef(document),
    lyricsTiming: shallowRef({ sourceSession: { id: 'source-a' } }),
    lyricLines: shallowRef(document.lines),
    activeLineIndex: shallowRef(0),
    currentLyricsPositionMs: shallowRef(0),
    saveTimingDocument: vi.fn(async () => true),
  };
  readError = shallowRef(null);
  owners.reading = {
    variant: shallowRef('off'),
    getDoc: () => ({
      lines: [
        {
          lineId: 'one',
          text: '君の声',
          segments: [
            { t: '君', r: 'きみ' },
            { t: 'の声', r: 'のこえ' },
          ],
        },
      ],
    }),
    errorFor: () => readError.value,
    isGenerating: () => false,
    loadReading: vi.fn(async () => ({
      lines: [{ lineId: 'one', text: '君の声' }],
    })),
    generateReading: vi.fn(),
    setReadingLine: vi.fn(async () => {}),
    setVariant: (value) => {
      owners.reading.variant.value = value;
    },
  };
  const draft = shallowRef(null);
  owners.timing = {
    draft,
    sourceSession: shallowRef(null),
    canCommit: computed(() => Boolean(draft.value)),
    canUndo: shallowRef(false),
    beginLine: vi.fn((doc, id, readings, session) => {
      draft.value = { lineId: id, segments: [] };
      owners.timing.sourceSession.value = session;
    }),
    cancel: vi.fn(() => {
      draft.value = null;
    }),
    tapBoundary: vi.fn(),
    buildDocument: vi.fn(() => document),
  };
  const mounted = mount({ ...LyricsAuthoringWorkspace, render: () => null });
  app = mounted.app;
  vm = app._instance.subTree.component.setupState;
});
afterEach(() => app?.unmount());
describe('contextual lyrics editing tasks', () => {
  it('keeps timing drafts on failure and never clears a replacement draft after an older save', async () => {
    vm.setEditMode('timing');
    vm.startTimingEdit('one');
    expect(owners.timing.sourceSession.value).toEqual({ id: 'source-a' });
    vm.recordTimingBoundary();
    expect(owners.timing.tapBoundary).toHaveBeenCalledWith(0);
    owners.lyrics.saveTimingDocument.mockResolvedValueOnce(false);
    await vm.commitTimingDocument();
    expect(owners.lyrics.saveTimingDocument).toHaveBeenLastCalledWith(
      owners.lyrics.lyricsDocument.value,
      owners.timing.sourceSession.value,
    );
    expect(owners.timing.draft.value?.lineId).toBe('one');
    let resolve;
    owners.lyrics.saveTimingDocument.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const save = vm.commitTimingDocument();
    owners.timing.draft.value = { lineId: 'replacement', segments: [] };
    resolve(true);
    await save;
    expect(owners.timing.draft.value?.lineId).toBe('replacement');
    await vm.commitTimingDocument();
    expect(owners.timing.draft.value).toBe(null);
  });
  it('does not enter unavailable editing modes or open a manager after context loss', async () => {
    vm.setEditMode('unknown');
    owners.lyrics.state.isLoadingLyrics = true;
    vm.setEditMode('reading');
    expect(vm.editMode).toBe('preview');
    owners.lyrics.state.isLoadingLyrics = false;
    owners.lyrics.selectedTrack.value = null;
    await vm.openSourceManager(async () => {});
    expect(vm.isSourceManagerOpen).toBe(false);
  });
  it('starts in preview and reveals only the selected task without tabs', () => {
    expect(vm.editMode).toBe('preview');
    vm.startEditReadingLine(0);
    expect(vm.editingReadingLineIndex).toBe(null);
    vm.setEditMode('reading');
    expect(owners.reading.variant.value).toBe('furigana');
    vm.startEditReadingLine(0);
    expect(vm.readingLineDraft).toBe('きみのこえ');
    expect(vm.isEditingLocked).toBe(true);
    vm.startEditReadingLine(1);
    vm.setEditMode('timing');
    expect(vm.editMode).toBe('reading');
    expect(vm.editingReadingLineIndex).toBe(0);
    vm.cancelReadingLineEdit();
    vm.setEditMode('timing');
    vm.startTimingEdit('one');
    vm.startTimingEdit('two');
    expect(owners.timing.beginLine).toHaveBeenCalledOnce();
    vm.setEditMode('preview');
    expect(vm.editMode).toBe('timing');
    owners.timing.cancel();
    vm.setEditMode('preview');
    expect(vm.editMode).toBe('preview');
  });
  it('blocks source navigation while a draft exists', async () => {
    vm.setEditMode('reading');
    vm.startEditReadingLine(0);
    const close = vi.fn();
    await vm.openSourceManager(close);
    expect(close).not.toHaveBeenCalled();
    expect(vm.isSourceManagerOpen).toBe(false);
  });
  it('prevents duplicate saves, preserves failed reading drafts and closes successful ones', async () => {
    vm.setEditMode('reading');
    vm.startEditReadingLine(0);
    let resolve;
    owners.reading.setReadingLine.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const save = vm.commitReadingLineEdit(0);
    await vm.commitReadingLineEdit(0);
    expect(owners.reading.setReadingLine).toHaveBeenCalledOnce();
    expect(vm.isSavingReading).toBe(true);
    readError.value = '未儲存';
    resolve();
    await save;
    expect(vm.editingReadingLineIndex).toBe(0);
    readError.value = null;
    await vm.commitReadingLineEdit(0);
    expect(vm.editingReadingLineIndex).toBe(null);
    expect(vm.isSavingReading).toBe(false);
  });
  it('clears contextual tools after a real track/source change', async () => {
    vm.setEditMode('timing');
    vm.startTimingEdit('one');
    owners.lyrics.selectedSource.value = { filename: 'b.lrc' };
    await nextTick();
    expect(owners.timing.draft.value).toBe(null);
    expect(vm.editMode).toBe('preview');
  });
  it('restores the timing task on return only while its source session still matches', () => {
    vm.setEditMode('timing');
    vm.startTimingEdit('one');
    app.unmount();
    let mounted = mount({ ...LyricsAuthoringWorkspace, render: () => null });
    app = mounted.app;
    vm = app._instance.subTree.component.setupState;
    expect(vm.editMode).toBe('timing');
    expect(owners.timing.draft.value?.lineId).toBe('one');
    app.unmount();
    owners.lyrics.lyricsTiming.value = { sourceSession: { id: 'source-b' } };
    mounted = mount({ ...LyricsAuthoringWorkspace, render: () => null });
    app = mounted.app;
    vm = app._instance.subTree.component.setupState;
    expect(owners.timing.draft.value).toBe(null);
    expect(vm.editMode).toBe('preview');
  });
});
describe('minimal lyrics toolbar', () => {
  it('renders only the display and edit commands in the default toolbar', async () => {
    const html = await renderToString(
      createSSRApp(LyricsWorkspaceHeader, { track: { title: 'Song' } }),
    );
    expect(html.match(/<button/g) ?? []).toHaveLength(2);
    expect(html).toContain('顯示');
    expect(html).toContain('編輯');
    expect(html).not.toContain('伴奏');
  });
  it('routes menu tasks, locks unavailable actions, and closes display before modal handoff', async () => {
    const mode = vi.fn();
    const select = vi.fn();
    const refresh = vi.fn();
    const props = reactive({
      track: { title: 'Song' },
      canEditReadings: true,
      canEditTiming: true,
      onEditModeChange: mode,
      onSelectTrack: select,
      onRefresh: refresh,
    });
    const mounted = mount(
      { ...LyricsWorkspaceHeader, render: () => null },
      props,
    );
    const header = mounted.app._instance.subTree.component.setupState;
    header.selectAction({ id: 'reading' });
    header.selectAction({ id: 'timing' });
    header.selectAction({ id: 'selectTrack' });
    header.selectAction({ id: 'refresh' });
    expect(mode.mock.calls).toEqual([['reading'], ['timing']]);
    expect(select).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    props.isLocked = true;
    await nextTick();
    header.selectAction({ id: 'selectTrack' });
    expect(select).toHaveBeenCalledOnce();
    const trigger = { focus: vi.fn() };
    header.toggleDisplay({ currentTarget: trigger });
    await header.closeDisplay();
    expect(header.displayOpen).toBe(false);
    expect(trigger.focus).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });
});

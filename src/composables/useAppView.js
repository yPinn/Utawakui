import { computed, readonly, shallowRef } from 'vue';

// Module-scope singleton (like usePlayer.js/usePlaylists.js) so components
// below App.vue can switch tabs too, not just App.vue and the sidebar.
const activeView = shallowRef('library');
const returnView = shallowRef('library');
const libraryWorkspace = shallowRef('browse');
const performanceTool = shallowRef('live-lyrics');
const performanceArchiveId = shallowRef(null);
const performanceSessionTab = shallowRef('pending');
const rootEntryRevision = shallowRef(0);
const isSettingsView = computed(() => activeView.value === 'settings');
// One-shot section request so other views can open Settings at a block.
const settingsSection = shallowRef(null);

function openSettings(section = null) {
  if (typeof section === 'string') settingsSection.value = section;
  if (activeView.value !== 'settings') {
    returnView.value = activeView.value;
    activeView.value = 'settings';
  }
}

function commitActiveView(view) {
  activeView.value = view;
  returnView.value = view;
}

function setActiveView(view) {
  if (view === 'settings') {
    openSettings();
    return;
  }

  if (view === 'library') resetLibraryWorkspace();
  if (view === 'performance') {
    performanceTool.value = 'live-lyrics';
    performanceArchiveId.value = null;
    performanceSessionTab.value = 'pending';
  }
  rootEntryRevision.value += 1;
  commitActiveView(view);
}

function resetLibraryWorkspace() {
  libraryWorkspace.value = 'browse';
  performanceArchiveId.value = null;
}

function openLibraryContent() {
  resetLibraryWorkspace();
  commitActiveView('library');
}

function openLyricsAuthoring() {
  libraryWorkspace.value = 'lyrics-authoring';
  commitActiveView('library');
}

function openLiveLyrics() {
  performanceArchiveId.value = null;
  performanceTool.value = 'live-lyrics';
  commitActiveView('performance');
}

// Authoring is entered from live lyrics, so leaving it returns there.
function returnFromLyricsAuthoring() {
  libraryWorkspace.value = 'browse';
  openLiveLyrics();
}

function selectPerformanceSessionTab(tab) {
  if (tab === 'pending' || tab === 'history') performanceSessionTab.value = tab;
}

function openPerformancePreparation(tab) {
  performanceArchiveId.value = null;
  selectPerformanceSessionTab(tab);
  performanceTool.value = 'session';
  commitActiveView('performance');
}

function selectPerformanceTool(tool) {
  if (!['session', 'live-lyrics'].includes(tool)) return false;
  performanceArchiveId.value = null;
  performanceTool.value = tool;
  if (activeView.value !== 'performance') commitActiveView('performance');
  return true;
}

function clearSettingsSection() {
  settingsSection.value = null;
}

function openPerformanceArchive(id) {
  if (typeof id !== 'string' || !id || id.length > 255) return false;
  performanceArchiveId.value = id;
  libraryWorkspace.value = 'performance-records';
  commitActiveView('library');
  return true;
}

function openPerformanceArchiveIndex() {
  performanceArchiveId.value = null;
  libraryWorkspace.value = 'performance-records';
  commitActiveView('library');
}

function returnFromSettings() {
  if (activeView.value !== 'settings') return;
  commitActiveView(returnView.value || 'library');
}

// History restore (ADR 0025): puts back a recorded location without the side
// effects of a fresh entry — no root-entry bump, Performance tool untouched.
function restoreLocation({
  view,
  workspace,
  archiveId,
  returnView: settingsReturnView,
}) {
  if (view === 'library') {
    libraryWorkspace.value = workspace ?? 'browse';
    performanceArchiveId.value = archiveId ?? null;
  }
  activeView.value = view;
  returnView.value =
    view === 'settings' ? settingsReturnView || 'library' : view;
}

export function useAppView() {
  return {
    activeView: readonly(activeView),
    returnView: readonly(returnView),
    libraryWorkspace: readonly(libraryWorkspace),
    performanceTool: readonly(performanceTool),
    performanceArchiveId: readonly(performanceArchiveId),
    performanceSessionTab: readonly(performanceSessionTab),
    rootEntryRevision: readonly(rootEntryRevision),
    isSettingsView,
    settingsSection: readonly(settingsSection),
    clearSettingsSection,
    setActiveView,
    openLibraryContent,
    openLyricsAuthoring,
    openLiveLyrics,
    returnFromLyricsAuthoring,
    openPerformancePreparation,
    openPerformanceArchive,
    openPerformanceArchiveIndex,
    selectPerformanceSessionTab,
    selectPerformanceTool,
    openSettings,
    returnFromSettings,
    restoreLocation,
  };
}

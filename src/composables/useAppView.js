import { computed, readonly, shallowRef } from 'vue';

// Module-scope singleton (like usePlayer.js/usePlaylists.js) so components
// below App.vue can switch tabs too, not just App.vue and the sidebar.
const activeView = shallowRef('library');
const returnView = shallowRef('library');
const libraryWorkspace = shallowRef('browse');
const performanceTool = shallowRef('session');
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

  if (view === 'library') libraryWorkspace.value = 'browse';
  if (view === 'performance') performanceTool.value = 'session';
  rootEntryRevision.value += 1;
  commitActiveView(view);
}

function openLibraryContent() {
  libraryWorkspace.value = 'browse';
  commitActiveView('library');
}

function openLyricsAuthoring() {
  libraryWorkspace.value = 'lyrics-authoring';
  commitActiveView('library');
}

function openLiveLyrics() {
  performanceTool.value = 'live-lyrics';
  commitActiveView('performance');
}

function openPerformancePreparation() {
  performanceTool.value = 'session';
  commitActiveView('performance');
}

function selectPerformanceTool(tool) {
  if (!['session', 'live-lyrics'].includes(tool)) return false;
  performanceTool.value = tool;
  if (activeView.value !== 'performance') commitActiveView('performance');
  return true;
}

function clearSettingsSection() {
  settingsSection.value = null;
}

function returnFromSettings() {
  if (activeView.value !== 'settings') return;
  commitActiveView(returnView.value || 'library');
}

// History restore (ADR 0025): puts back a recorded location without the side
// effects of a fresh entry — no root-entry bump, Performance tool untouched.
function restoreLocation({ view, workspace, returnView: settingsReturnView }) {
  if (view === 'library') libraryWorkspace.value = workspace ?? 'browse';
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
    rootEntryRevision: readonly(rootEntryRevision),
    isSettingsView,
    settingsSection: readonly(settingsSection),
    clearSettingsSection,
    setActiveView,
    openLibraryContent,
    openLyricsAuthoring,
    openLiveLyrics,
    openPerformancePreparation,
    selectPerformanceTool,
    openSettings,
    returnFromSettings,
    restoreLocation,
  };
}

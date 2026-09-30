import { computed, readonly, shallowRef } from 'vue';

// Module-scope singleton (like usePlayer.js/usePlaylists.js) so components
// below App.vue can switch tabs too, not just App.vue and the sidebar.
const activeView = shallowRef('setlist');
const returnView = shallowRef('setlist');
const isSettingsView = computed(() => activeView.value === 'settings');

function openSettings() {
  if (activeView.value !== 'settings') {
    returnView.value = activeView.value;
    activeView.value = 'settings';
  }
}

function setActiveView(view) {
  if (view === 'settings') {
    openSettings();
    return;
  }

  activeView.value = view;
  returnView.value = view;
}

function returnFromSettings() {
  if (activeView.value !== 'settings') return;
  setActiveView(returnView.value || 'setlist');
}

export function useAppView() {
  return {
    activeView: readonly(activeView),
    returnView: readonly(returnView),
    isSettingsView,
    setActiveView,
    openSettings,
    returnFromSettings,
  };
}

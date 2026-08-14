import { ref } from 'vue';

// Module-scope singleton (like usePlayer.js/usePlaylists.js) so components
// below App.vue can switch tabs too, not just App.vue and the sidebar.
const activeView = ref('setlist');

function setActiveView(view) {
  activeView.value = view;
}

export function useAppView() {
  return { activeView, setActiveView };
}

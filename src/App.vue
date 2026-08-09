<script setup>
import { ref } from 'vue';
import AppSidebar from './components/AppSidebar.vue';
import PlayerBar from './components/PlayerBar.vue';
import SetlistView from './views/SetlistView.vue';
import AppearanceView from './views/AppearanceView.vue';
import LyricsView from './views/LyricsView.vue';
import ImportView from './views/ImportView.vue';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';

// App.vue lives for the app's whole lifetime in production; each composable
// still owns cleanup for dev HMR and test-like remounts.
useTaskbarControls();
useWindowTitle();
useMediaSession();
useKeyboardShortcuts();

// No router: 4 fixed sections, an Electron window has no address bar and
// nothing here needs deep-linking. Revisit only if that changes.
const views = {
  setlist: SetlistView,
  appearance: AppearanceView,
  lyrics: LyricsView,
  import: ImportView,
};

const activeView = ref('setlist');
</script>

<template>
  <div class="shell">
    <AppSidebar v-model:active-view="activeView" class="shell__sidebar" />
    <main class="shell__main">
      <component :is="views[activeView]" />
    </main>
    <PlayerBar class="shell__player" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-areas:
    'sidebar main'
    'player player';
  grid-template-columns: 180px 1fr;
  grid-template-rows: 1fr auto;
  height: 100%;
}

.shell__sidebar {
  grid-area: sidebar;
}

.shell__main {
  grid-area: main;
  overflow-y: auto;
  padding: var(--ui-space-3);
}

.shell__player {
  grid-area: player;
}
</style>

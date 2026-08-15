<script setup>
import { computed } from 'vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { Moon, Sun } from '../../icons/index.js';
import { useTheme } from '../../composables/useTheme.js';

const { theme, toggleTheme } = useTheme();

const isLight = computed(() => theme.value === 'light');
const label = computed(() =>
  isLight.value ? '切換為深色主題' : '切換為淺色主題',
);
</script>

<template>
  <header class="app-title-bar">
    <div class="app-title-bar__controls">
      <UiIconButton
        :icon="isLight ? Moon : Sun"
        :label="label"
        variant="overlay"
        size="md"
        @click="toggleTheme"
      />
    </div>
  </header>
</template>

<style scoped>
.app-title-bar {
  position: relative;
  height: var(--ui-titlebar-height);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--ui-color-canvas) 84%, black),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
  user-select: none;
  app-region: drag;
  -webkit-app-region: drag;
}

.app-title-bar__controls {
  /* Shrink-to-fit (right set, no left/width) — a *sized* no-drag div
     here (tried first, via width: env(titlebar-area-width, 100%)) silently
     grows to the full bar on a bad env() read and kills window dragging.
     Only the position depends on env() now; the box stays button-sized. */
  position: absolute;
  top: 0;
  right: calc(100% - env(titlebar-area-width, 100%));
  height: 100%;
  display: flex;
  align-items: center;
  padding-right: var(--ui-space-2);
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
</style>

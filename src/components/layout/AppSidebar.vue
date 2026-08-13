<script setup>
import { Captions, Download, ListMusic, Palette } from '@lucide/vue';
import { ICON_SIZE } from '../../constants/ui.js';

defineProps({
  activeView: { type: String, required: true },
});

const emit = defineEmits(['update:activeView']);

const items = [
  { key: 'import', label: 'Import', icon: Download },
  { key: 'setlist', label: 'Setlist', icon: ListMusic },
  { key: 'lyrics', label: 'Lyrics', icon: Captions },
  { key: 'appearance', label: 'Appearance', icon: Palette },
];
</script>

<template>
  <nav class="sidebar">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="sidebar__item"
      :class="{ 'sidebar__item--active': item.key === activeView }"
      :aria-current="item.key === activeView ? 'page' : undefined"
      @click="emit('update:activeView', item.key)"
    >
      <component :is="item.icon" class="sidebar__icon" :size="ICON_SIZE" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2);
  background: var(--ui-color-surface);
  border-right: var(--ui-border-width) solid var(--ui-color-border);
  height: 100%;
  box-sizing: border-box;
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--ui-motion-fast) var(--ui-motion-ease);
}

.sidebar__item:hover {
  background: var(--ui-color-surface-hover);
}

.sidebar__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.sidebar__item--active {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

@media (prefers-reduced-motion: reduce) {
  .sidebar__item {
    transition: none;
  }
}

.sidebar__icon {
  flex-shrink: 0;
}
</style>

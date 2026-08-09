<script setup>
import { Captions, Download, ListMusic, Palette } from '@lucide/vue';
import { ICON_SIZE } from '../constants/ui.js';

defineProps({
  activeView: { type: String, required: true },
});

const emit = defineEmits(['update:activeView']);

const items = [
  { key: 'setlist', label: 'Setlist', icon: ListMusic },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'lyrics', label: 'Lyrics', icon: Captions },
  { key: 'import', label: 'Import', icon: Download },
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
  background: var(--ui-surface);
  border-right: 1px solid var(--ui-border);
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
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}

.sidebar__item:hover {
  background: var(--ui-surface-hover);
}

.sidebar__item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

.sidebar__item--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
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

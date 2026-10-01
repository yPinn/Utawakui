<script setup>
import { X } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  closeLabel: { type: String, required: true },
});

const emit = defineEmits(['close']);

function closeDock() {
  emit('close');
}
</script>

<template>
  <header class="app-right-dock-header">
    <div class="app-right-dock-header__identity">
      <slot name="identity">
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </slot>
    </div>
    <UiIconButton
      class="app-right-dock-header__close"
      :icon="X"
      :label="closeLabel"
      size="md"
      @click="closeDock"
    />
  </header>
</template>

<style scoped>
.app-right-dock-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-right-dock-content-inset);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.app-right-dock-header__identity {
  min-width: 0;
  display: grid;
  gap: var(--ui-side-panel-list-gap);
}

.app-right-dock-header h2,
.app-right-dock-header p {
  margin: 0;
}

.app-right-dock-header h2 {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-user-select: none;
  user-select: none;
}

.app-right-dock-header p {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-user-select: text;
  user-select: text;
}
</style>

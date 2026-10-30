<script setup>
import { computed } from 'vue';
import UiKbd from '../ui/UiKbd.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps({
  tools: { type: Array, default: () => [] },
  activeToolId: { type: String, required: true },
});

const emit = defineEmits(['navigate']);

const toolItems = computed(() =>
  props.tools.map((tool) => ({ ...tool, id: tool.route })),
);

function selectTool(route) {
  if (route !== props.activeToolId) emit('navigate', route);
}
</script>

<template>
  <nav class="internal-tools-nav" aria-label="內部工具">
    <UiSegmentedControl
      :items="toolItems"
      :model-value="activeToolId"
      aria-label="內部工具"
      @update:model-value="selectTool"
    >
      <template #label="{ item }">
        <span>{{ item.label }}</span>
        <UiKbd v-if="item.shortcut">{{ item.shortcut }}</UiKbd>
      </template>
    </UiSegmentedControl>
  </nav>
</template>

<style scoped>
.internal-tools-nav {
  min-width: 0;
  display: flex;
  align-items: center;
  -webkit-user-select: none;
  user-select: none;
}

.internal-tools-nav :deep(.ui-segmented-control__option) {
  gap: var(--ui-space-2);
}
</style>

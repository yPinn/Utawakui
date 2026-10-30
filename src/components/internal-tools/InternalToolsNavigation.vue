<script setup>
import { computed } from 'vue';
import UiKbd from '../ui/UiKbd.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  activeToolId: { type: String, required: true },
});

const emit = defineEmits(['navigate']);

const activeCategory = computed(
  () =>
    props.categories.find((category) =>
      category.tools.some((tool) => tool.route === props.activeToolId),
    ) ?? props.categories[0],
);
const categoryItems = computed(() =>
  props.categories.map(({ id, label }) => ({ id, label })),
);
const toolItems = computed(() =>
  (activeCategory.value?.tools ?? []).map((tool) => ({
    ...tool,
    id: tool.route,
  })),
);

function selectCategory(categoryId) {
  const category = props.categories.find(
    (candidate) => candidate.id === categoryId,
  );
  const firstTool = category?.tools[0];
  if (firstTool) emit('navigate', firstTool.route);
}

function selectTool(route) {
  if (route !== props.activeToolId) emit('navigate', route);
}
</script>

<template>
  <nav class="internal-tools-nav" aria-label="內部工具">
    <div class="internal-tools-nav__topline">
      <UiSegmentedControl
        :items="categoryItems"
        :model-value="activeCategory?.id ?? ''"
        aria-label="內部工具分類"
        @update:model-value="selectCategory"
      />
    </div>

    <div class="internal-tools-nav__tools">
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
    </div>
  </nav>
</template>

<style scoped>
.internal-tools-nav {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  -webkit-user-select: none;
  user-select: none;
}

.internal-tools-nav__topline,
.internal-tools-nav__tools {
  min-width: 0;
  display: flex;
  align-items: center;
}

.internal-tools-nav__topline {
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.internal-tools-nav__tools {
  justify-content: space-between;
  gap: var(--ui-space-4);
}

.internal-tools-nav :deep(.ui-segmented-control__option) {
  gap: var(--ui-space-2);
}
</style>

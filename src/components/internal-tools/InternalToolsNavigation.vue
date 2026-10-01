<script setup>
import { computed } from 'vue';
import UiChip from '../ui/UiChip.vue';
import UiKbd from '../ui/UiKbd.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTabs from '../ui/UiTabs.vue';

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
const activeTool = computed(
  () =>
    activeCategory.value?.tools.find(
      (tool) => tool.route === props.activeToolId,
    ) ?? activeCategory.value?.tools[0],
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
      <UiTabs
        :items="categoryItems"
        :active-id="activeCategory?.id ?? ''"
        aria-label="內部工具分類"
        tab-id-prefix="internal-tools-category"
        variant="bar"
        @update:active-id="selectCategory"
      />
      <UiChip tone="gated">僅開發版本</UiChip>
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

      <div v-if="activeTool" class="internal-tools-nav__context">
        <UiChip :tone="activeTool.tone">{{ activeTool.lifecycle }}</UiChip>
        <p>{{ activeTool.description }}</p>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.internal-tools-nav {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block-end: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  -webkit-user-select: none;
  user-select: none;
}

.internal-tools-nav__topline,
.internal-tools-nav__tools,
.internal-tools-nav__context {
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

.internal-tools-nav__context {
  flex: 1 1 24rem;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.internal-tools-nav__context p {
  min-width: 0;
  max-width: 58ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.internal-tools-nav :deep(.ui-tabs__tab),
.internal-tools-nav :deep(.ui-segmented-control__option) {
  gap: var(--ui-space-2);
}

@media (max-width: 70rem) {
  .internal-tools-nav__tools {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--ui-space-2);
  }

  .internal-tools-nav__context {
    flex-basis: auto;
    justify-content: flex-start;
  }
}
</style>

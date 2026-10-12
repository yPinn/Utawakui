<script setup>
import { computed, shallowRef } from 'vue';
import { separationQueueSummary } from '../separation/separationQueuePresentation.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import ImportDockContent from '../import/ImportDockContent.vue';
import SeparationDockContent from '../separation/SeparationDockContent.vue';

const props = defineProps({
  active: { type: Boolean, default: false },
  separationController: { type: Object, required: true },
});

const emit = defineEmits(['collapse']);
const preparationTabs = [
  { id: 'import', label: '匯入' },
  { id: 'separation', label: '伴奏處理' },
];

// Module scope would leak across renderer instances in tests. This component is
// retained after its first shell mount, so local state still remembers the
// selected tab for the lifetime of the app session.
const activePreparationTab = shallowRef('import');
const subtitle = computed(() =>
  activePreparationTab.value === 'separation'
    ? separationQueueSummary(props.separationController.queue.value)
    : '本機與外部來源',
);
</script>

<template>
  <AppRightDockPanel
    title="曲目準備"
    :subtitle="subtitle"
    collapse-label="摺疊曲目準備"
    aria-label="曲目準備"
    @collapse="emit('collapse')"
  >
    <UiSegmentedControl
      v-model="activePreparationTab"
      class="preparation-dock-panel__tabs"
      :items="preparationTabs"
      aria-label="選擇曲目準備工具"
    />

    <ImportDockContent
      v-show="activePreparationTab === 'import'"
      :active="active && activePreparationTab === 'import'"
    />
    <SeparationDockContent
      v-show="activePreparationTab === 'separation'"
      :separation-controller="separationController"
    />
  </AppRightDockPanel>
</template>

<style scoped>
.preparation-dock-panel__tabs {
  inline-size: 100%;
}

.preparation-dock-panel__tabs :deep(.ui-segmented-control__option) {
  flex: 1;
}
</style>

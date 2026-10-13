<script setup>
import { nextTick, shallowRef, useTemplateRef } from 'vue';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import UiTabs from '../ui/UiTabs.vue';
import ImportDockContent from '../import/ImportDockContent.vue';
import SeparationDockContent from '../separation/SeparationDockContent.vue';

defineProps({
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
const dockPanel = useTemplateRef('dockPanel');

function selectTab(tabId) {
  activePreparationTab.value = tabId;
  nextTick(() => {
    dockPanel.value?.scrollTo({ top: 0 });
  });
}
</script>

<template>
  <AppRightDockPanel
    ref="dockPanel"
    title="曲目準備"
    collapse-label="摺疊曲目準備"
    aria-label="曲目準備"
    @collapse="emit('collapse')"
  >
    <template #identity>
      <UiTabs
        :items="preparationTabs"
        :active-id="activePreparationTab"
        aria-label="曲目準備工具"
        tab-id-prefix="preparation-dock"
        panel-id-prefix="preparation-dock"
        variant="bar"
        @update:active-id="selectTab"
      />
    </template>

    <div
      v-show="activePreparationTab === 'import'"
      id="preparation-dock-import-panel"
      class="preparation-dock-panel__content"
      role="tabpanel"
      aria-labelledby="preparation-dock-import-tab"
      tabindex="0"
    >
      <ImportDockContent
        :active="active && activePreparationTab === 'import'"
      />
    </div>
    <div
      v-show="activePreparationTab === 'separation'"
      id="preparation-dock-separation-panel"
      class="preparation-dock-panel__content"
      role="tabpanel"
      aria-labelledby="preparation-dock-separation-tab"
      tabindex="0"
    >
      <SeparationDockContent
        :separation-controller="separationController"
        @navigate="emit('collapse')"
      />
    </div>
  </AppRightDockPanel>
</template>

<style scoped>
.preparation-dock-panel__content {
  min-inline-size: 0;
}

.preparation-dock-panel__content:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: calc(-1 * var(--ui-focus-width));
}
</style>

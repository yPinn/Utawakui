<script setup>
import { useTemplateRef, watch } from 'vue';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import UiTabs from '../ui/UiTabs.vue';
import ImportDockContent from '../import/ImportDockContent.vue';
import SeparationDockContent from '../separation/SeparationDockContent.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  active: { type: Boolean, default: false },
  activePreparationTab: { type: String, default: 'import' },
  separationController: { type: Object, required: true },
});

const emit = defineEmits(['collapse', 'update:activePreparationTab']);
const preparationTabs = [
  { id: 'import', label: t('prep.panel.import') },
  { id: 'separation', label: t('prep.panel.separation') },
];

const dockPanel = useTemplateRef('dockPanel');

function selectTab(tabId) {
  emit('update:activePreparationTab', tabId);
}

watch(
  () => props.activePreparationTab,
  () => {
    dockPanel.value?.scrollTo({ top: 0 });
  },
  { flush: 'post' },
);
</script>

<template>
  <AppRightDockPanel
    ref="dockPanel"
    :title="t('prep.panel.title')"
    :collapse-label="t('prep.panel.collapse')"
    :aria-label="t('prep.panel.title')"
    @collapse="emit('collapse')"
  >
    <template #identity>
      <UiTabs
        :items="preparationTabs"
        :active-id="activePreparationTab"
        :aria-label="t('prep.panel.tools')"
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
        :active="active && activePreparationTab === 'separation'"
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
  outline-offset: var(--ui-focus-offset-inset);
}
</style>

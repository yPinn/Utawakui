<script setup>
import { shallowRef } from 'vue';
import UiTabs from '../ui/UiTabs.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});

const panelTab = shallowRef('library');
const barTab = shallowRef('appearance');

const PANEL_TABS = [
  { id: 'library', label: '曲庫' },
  { id: 'queue', label: '佇列' },
  { id: 'history', label: '歷史' },
  { id: 'locked', label: '未開放', disabled: true },
];

const BAR_TABS = [
  { id: 'setlist', label: '歌單' },
  { id: 'appearance', label: '外觀' },
  { id: 'lyrics', label: '歌詞' },
  { id: 'import', label: '匯入' },
];
</script>

<template>
  <div class="demo-navigation">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <div v-if="section.key === 'tabs'" class="demo-sample-stack">
        <div class="demo-sample-state">
          <p class="demo-sample-state__label">Panel／區域內切換</p>
          <UiTabs
            v-model:active-id="panelTab"
            :items="PANEL_TABS"
            aria-label="元件目錄區域"
            tab-id-prefix="demo-panel"
            panel-id-prefix="demo-panel"
          />
          <p
            v-for="item in PANEL_TABS"
            v-show="panelTab === item.id"
            :id="`demo-panel-${item.id}-panel`"
            :key="item.id"
            class="demo-tab-panel"
            role="tabpanel"
            :aria-labelledby="`demo-panel-${item.id}-tab`"
          >
            目前選取：{{ item.label }}
          </p>
        </div>
        <div class="demo-sample-state">
          <p class="demo-sample-state__label">Bar／主要區段切換</p>
          <UiTabs
            v-model:active-id="barTab"
            :items="BAR_TABS"
            aria-label="工作區區段"
            tab-id-prefix="demo-bar"
            variant="bar"
          />
          <p class="demo-sample-caption">
            點擊或使用左右方向鍵、Home、End 切換；停用分頁會被略過。
          </p>
        </div>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-tab-panel {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>

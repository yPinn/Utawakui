<script setup>
import { reactive } from 'vue';
import UiTabs from '../ui/UiTabs.vue';
import DemoCandidateTabs from './DemoCandidateTabs.vue';
import DemoProposalSpecimen from './DemoProposalSpecimen.vue';
import '../../styles/demoSpecimens.css';

const BASE_ITEMS = [
  { id: 'workspace', label: '工作區', count: 12 },
  { id: 'appearance', label: '外觀', count: 4 },
  { id: 'history', label: '歷史' },
  { id: 'locked', label: '未開放', disabled: true },
];

const OVERFLOW_ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'queue', label: '佇列' },
  { id: 'appearance', label: '外觀設定' },
  { id: 'lyrics', label: '歌詞校對' },
  { id: 'history', label: '處理歷史' },
  { id: 'settings', label: '輸出設定' },
];

const CONTENT_ITEMS = [
  { id: 'short-cjk', label: '曲庫' },
  { id: 'long-cjk', label: '東京事変／椎名林檎／非常に長い日本語の作業區段' },
  {
    id: 'long-latin',
    label:
      'A deliberately long Latin workspace section for overflow inspection',
  },
  { id: 'multilingual', label: '繁體中文／日本語／한국어／English' },
  { id: 'disabled', label: '尚未開放', disabled: true },
];

const KEYBOARD_ITEMS = [
  { id: 'library', label: '曲庫' },
  { id: 'locked', label: '未開放', disabled: true },
  { id: 'queue', label: '佇列' },
  { id: 'history', label: '歷史' },
];

// Each set is one real tablist with its own tabpanels.
const SETS = [
  {
    key: 'variant-panel',
    title: 'Panel · 選取底塊',
    variant: 'panel',
    items: BASE_ITEMS,
  },
  {
    key: 'variant-bar',
    title: 'Bar · 與 Panel 相同選取底塊',
    variant: 'bar',
    items: BASE_ITEMS,
  },
  {
    key: 'narrow-scroll',
    title: '窄寬度 · 水平捲動',
    variant: 'bar',
    items: OVERFLOW_ITEMS,
    narrow: true,
  },
  {
    key: 'content',
    title: '多語與長標籤',
    variant: 'bar',
    items: CONTENT_ITEMS,
  },
  {
    key: 'keyboard',
    title: '鍵盤：方向鍵、Home／End，略過停用項目',
    variant: 'panel',
    items: KEYBOARD_ITEMS,
  },
];

const CONTRACT = [
  'items · { id, label, disabled? }',
  'activeId · controlled selection',
  'variant · panel／bar · presentation only',
  'aria-controls ↔ aria-labelledby',
  'No route／href · No closeable · No vertical',
];

const selection = reactive({
  ...Object.fromEntries(SETS.map((set) => [set.key, set.items[0].id])),
  proposalPanel: 'workspace',
  proposalBar: 'workspace',
});

const prefix = (key) => `demo-tabs-${key}`;
</script>

<template>
  <div class="demo-specimens" data-tabs-source="production">
    <p class="demo-specimens__copy">
      切換同一區域的內容頁，每個分頁都對應真實 tabpanel；模式選擇改用分段控制。
    </p>

    <section
      v-for="set in SETS"
      :key="set.key"
      class="demo-specimens__section"
      :data-tabs-set="set.key"
    >
      <h4>{{ set.title }}</h4>
      <div :class="{ 'demo-tabs__narrow': set.narrow }">
        <UiTabs
          v-model:active-id="selection[set.key]"
          :items="set.items"
          :aria-label="set.title"
          :tab-id-prefix="prefix(set.key)"
          :panel-id-prefix="prefix(set.key)"
          :variant="set.variant"
        >
          <template #after="{ item }">
            <span v-if="item.count" class="demo-specimens__copy">
              {{ item.count }}
            </span>
          </template>
        </UiTabs>
      </div>
      <section
        v-for="item in set.items"
        v-show="selection[set.key] === item.id"
        :id="`${prefix(set.key)}-${item.id}-panel`"
        :key="item.id"
        class="demo-specimens__case"
        role="tabpanel"
        tabindex="0"
        :aria-labelledby="`${prefix(set.key)}-${item.id}-tab`"
      >
        目前內容：{{ item.label }}
      </section>
    </section>

    <DemoProposalSpecimen
      note="Indigo 選取色、Bar 改用 2px 底線指示、按下使用 active surface 與內縮焦點框；owner 保留現行 30px 青綠選取底塊。"
    >
      <DemoCandidateTabs
        v-model:active-id="selection.proposalPanel"
        :items="BASE_ITEMS"
        aria-label="提案 Panel"
        tab-id-prefix="demo-tabs-proposal-panel"
      />
      <DemoCandidateTabs
        v-model:active-id="selection.proposalBar"
        :items="BASE_ITEMS"
        aria-label="提案 Bar"
        tab-id-prefix="demo-tabs-proposal-bar"
        variant="bar"
      />
    </DemoProposalSpecimen>

    <ul class="demo-specimens__contract" aria-label="UiTabs public contract">
      <li v-for="rule in CONTRACT" :key="rule">{{ rule }}</li>
    </ul>
  </div>
</template>

<style scoped>
.demo-tabs__narrow {
  max-width: 16rem;
}
</style>

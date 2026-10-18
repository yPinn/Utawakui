<script setup>
import { shallowRef } from 'vue';
import { Check } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

defineProps({ kind: { type: String, required: true } });

const selected = shallowRef(1);
const activeTab = shallowRef('first');
const retried = shallowRef(false);
const rowSelected = shallowRef(false);
const options = [
  { value: 1, label: '第一項' },
  { value: 2, label: '第二項' },
  { value: 3, label: '不可選', disabled: true },
];
const tabs = [
  { id: 'first', label: '第一頁' },
  { id: 'second', label: '第二頁' },
  { id: 'disabled', label: '不可選', disabled: true },
];
const track = {
  id: 'demo-production-row',
  title: '夜に駆ける',
  artist: 'YOASOBI',
  duration: 261,
};
</script>

<template>
  <section class="demo-production-sample" :data-demo-production="kind">
    <h4>正式元件</h4>
    <template v-if="kind === 'select'">
      <UiSelect
        id="demo-production-select"
        v-model="selected"
        label="選擇項目"
        :options="options"
      />
      <p class="demo-sample-caption">目前值：{{ selected }}（數字）</p>
    </template>
    <template v-else-if="kind === 'tabs'">
      <UiTabs
        v-model:active-id="activeTab"
        :items="tabs"
        aria-label="正式分頁範例"
        tab-id-prefix="demo-production-tabs"
        panel-id-prefix="demo-production-tabs"
      />
      <section
        :id="`demo-production-tabs-${activeTab}-panel`"
        role="tabpanel"
        :aria-labelledby="`demo-production-tabs-${activeTab}-tab`"
      >
        {{ activeTab === 'first' ? '第一頁內容' : '第二頁內容' }}
      </section>
    </template>
    <UiMarqueeText
      v-else-if="kind === 'marquee-text'"
      text="這是一段用來檢查狹窄空間、指向與鍵盤焦點的完整曲目名稱"
      tabindex="0"
    />
    <UiNotice
      v-else-if="kind === 'notices'"
      :tone="retried ? 'success' : 'warning'"
      :title="retried ? '範例已恢復' : '範例尚未準備'"
      :message="retried ? '這是展示互動結果。' : '按下重試以查看操作結果。'"
      :action-label="retried ? '' : '重試'"
      @action="retried = true"
    />
    <UiHint v-else-if="kind === 'hints'">輔助文字會隨可用寬度換行。</UiHint>
    <div v-else-if="kind === 'chips'" class="demo-sample-row">
      <UiChip>一般</UiChip>
      <UiChip tone="success">已完成</UiChip>
      <UiChip tone="danger">失敗</UiChip>
    </div>
    <UiStatusIcon
      v-else-if="kind === 'status-icons'"
      :icon="Check"
      tone="success"
      label="已完成"
    />
    <template v-else-if="kind === 'track-rows'">
      <ul class="demo-production-sample__rows">
        <UiTrackRow
          :track="track"
          interactive
          selection-action
          :active="rowSelected"
          @row-click="rowSelected = !rowSelected"
        />
      </ul>
      <p class="demo-sample-caption">點擊或按空白鍵切換選取。</p>
    </template>
  </section>
</template>

<style scoped>
.demo-production-sample {
  min-inline-size: 0;
  max-inline-size: 100%;
  display: grid;
  gap: var(--ui-space-3);
  margin-block-end: var(--ui-space-5);
}

.demo-production-sample h4 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}

.demo-production-sample__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

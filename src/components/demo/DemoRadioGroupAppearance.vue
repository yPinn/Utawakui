<script setup>
import { reactive, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import '../../styles/demoInputStates.css';

const ITEMS = [
  { id: '中文', label: '繁體中文' },
  { id: '日本語', label: '日本語' },
  { id: 'a b', label: '空白 a b' },
  { id: 'a/b', label: '斜線 a/b' },
  { id: 'locked', label: '尚未提供', disabled: true },
];
const TILES = [
  {
    id: '中文',
    label: '繁體中文',
    description: '顯示本機曲目的標題、歌詞與完整來源說明，長內容自然換行。',
  },
  {
    id: '日本語',
    label: '日本語',
    description: '日本語の曲名と歌詞を表示します。',
  },
  { id: 'locked', label: '尚未提供', disabled: true },
];
const CASES = [
  { key: 'list', title: 'List · vertical' },
  { key: 'horizontal', title: 'List · horizontal', orientation: 'horizontal' },
  {
    key: 'tiles',
    title: 'Tiles · 多行說明',
    appearance: 'tiles',
    items: TILES,
  },
  { key: 'disabled', title: '整組停用', disabled: true },
  { key: 'hidden-legend', title: '隱藏可見 legend', legendHidden: true },
  { key: 'empty', title: '空選項', items: [] },
  {
    key: 'numeric',
    title: '數字／字串選值',
    value: 1,
    items: [
      { id: 1, label: '數字 1' },
      { id: '1', label: '字串 1' },
    ],
  },
];
const values = reactive(
  Object.fromEntries(CASES.map(({ key, value }) => [key, value ?? '中文'])),
);
const unlocked = shallowRef(false);
const selection = shallowRef('中文');
function reset() {
  unlocked.value = false;
  selection.value = '中文';
}
</script>

<template>
  <div
    class="demo-input-states"
    data-input-source="production"
    data-input-component="radio-group"
  >
    <section class="demo-input-states__section">
      <h4>排列、內容與停用</h4>
      <p class="demo-input-states__copy">
        方向鍵切換並略過停用項目；無 invalid／readonly 狀態。
      </p>
      <div class="demo-input-states__grid">
        <article
          v-for="entry in CASES"
          :key="entry.key"
          class="demo-input-states__case"
          :data-radio-state="entry.key"
        >
          <h5>{{ entry.title }}</h5>
          <UiRadioGroup
            v-model="values[entry.key]"
            :name="`demo-radio-${entry.key}`"
            legend="偏好語言"
            :items="entry.items ?? ITEMS"
            :orientation="entry.orientation ?? 'vertical'"
            :appearance="entry.appearance ?? 'list'"
            :disabled="entry.disabled"
            :legend-hidden="entry.legendHidden"
          />
          <p v-if="entry.key === 'empty'" class="demo-input-states__copy">
            目前沒有可選項目。
          </p>
        </article>
      </div>
    </section>
    <section class="demo-input-states__section" data-radio-recovery>
      <h4>解除鎖定與恢復</h4>
      <p class="demo-input-states__copy">
        解除鎖定可變更選值；再次鎖定保留值。
      </p>
      <UiSwitch
        id="demo-radio-unlock"
        v-model="unlocked"
        label="允許變更語言"
      />
      <UiRadioGroup
        id="demo-radio-recovery"
        v-model="selection"
        name="demo-radio-recovery"
        legend="偏好語言"
        :items="ITEMS"
        :disabled="!unlocked"
      />
      <div class="demo-input-states__actions">
        <output data-radio-value>目前值：{{ selection }}</output>
        <UiButton data-radio-reset variant="secondary" @click="reset"
          >重設範例</UiButton
        >
      </div>
    </section>
  </div>
</template>

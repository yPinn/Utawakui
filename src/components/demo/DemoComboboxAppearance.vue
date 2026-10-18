<script setup>
import { reactive, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import '../../styles/demoInputStates.css';

const FLAT_ITEMS = [
  { value: 'local', label: '本機曲庫' },
  { value: 'locked', label: '尚未提供', disabled: true },
  { value: 'archive', label: '已封存曲目' },
];
const GROUPED_ITEMS = [
  { value: 'playback-order', label: '目前播放順序' },
  {
    label: '播放清單',
    options: [
      { value: 'playlist-show', label: '演出歌單' },
      { value: 'playlist-locked', label: '尚未提供', disabled: true },
    ],
  },
  {
    label: '專輯',
    options: [
      {
        value: 'album-after-dark',
        label: 'After Dark · Aimer',
        searchText: 'After Dark Aimer',
      },
      {
        value: 'album-flower-skin',
        label: '花皮 · Sabrina 胡恂舞',
        searchText: '花皮 Sabrina 胡恂舞',
      },
    ],
  },
  {
    label: '尚未開放',
    disabled: true,
    options: [{ value: 'group-locked', label: '鎖定來源' }],
  },
];
const CASES = [
  { key: 'editable-flat', title: 'Editable · flat' },
  { key: 'select-only-flat', title: 'Select-only · flat', editable: false },
  { key: 'editable-grouped', title: 'Editable · grouped', grouped: true },
  {
    key: 'select-only-grouped',
    title: 'Select-only · grouped',
    grouped: true,
    editable: false,
  },
  { key: 'disabled-editable', title: 'Disabled · editable', disabled: true },
  {
    key: 'disabled-select-only',
    title: 'Disabled · select-only',
    disabled: true,
    editable: false,
  },
  {
    key: 'invalid-editable',
    title: 'Invalid · editable',
    invalid: true,
    error: '請重新確認來源。',
  },
  {
    key: 'invalid-select-only',
    title: 'Error only · select-only',
    editable: false,
    error: '請重新確認來源。',
  },
  {
    key: 'disabled-invalid-editable',
    title: 'Disabled × Invalid · editable',
    disabled: true,
    error: '解除鎖定後確認來源。',
  },
  {
    key: 'disabled-invalid-select-only',
    title: 'Disabled × Invalid · select-only',
    editable: false,
    disabled: true,
    invalid: true,
    error: '解除鎖定後確認來源。',
  },
  {
    key: 'required-pristine',
    title: 'Required · pristine',
    value: '',
    required: true,
  },
  { key: 'hidden-label', title: '隱藏可見 label', labelHidden: true },
  { key: 'empty', title: '空選項／無結果', value: '', items: [] },
  {
    key: 'numeric',
    title: '數字選值',
    value: 1,
    items: [
      { value: 1, label: '第一組' },
      { value: 2, label: '第二組' },
    ],
  },
];
const values = reactive(
  Object.fromEntries(
    CASES.map((entry) => [
      entry.key,
      entry.value ?? (entry.grouped ? 'album-after-dark' : 'local'),
    ]),
  ),
);
const recovery = reactive({ editable: '', selectOnly: '' });
const locked = shallowRef(false);
const revision = shallowRef(0);
function reset() {
  recovery.editable = '';
  recovery.selectOnly = '';
  locked.value = false;
  revision.value += 1;
}
</script>

<template>
  <div
    class="demo-input-states"
    data-input-source="production"
    data-input-component="combobox"
  >
    <section class="demo-input-states__section">
      <h4>模式、選項與驗證</h4>
      <p class="demo-input-states__copy">
        可輸入模式可搜尋現有選項；Select-only
        不接受文字輸入。試著輸入沒有結果的內容，再按 Escape
        還原。輸入法確認字詞不會提交選項。
      </p>
      <p class="demo-input-states__copy">
        這組錯誤標本固定驗證條件，下方恢復範例會隨選值更新錯誤。
      </p>
      <div class="demo-input-states__grid">
        <article
          v-for="entry in CASES"
          :key="entry.key"
          class="demo-input-states__case"
          :data-combobox-state="entry.key"
        >
          <h5>{{ entry.title }}</h5>
          <UiCombobox
            :id="`demo-combobox-${entry.key}`"
            v-model="values[entry.key]"
            label="曲目來源"
            placeholder="選擇或搜尋來源"
            :items="entry.items ?? (entry.grouped ? GROUPED_ITEMS : FLAT_ITEMS)"
            :editable="entry.editable !== false"
            :label-hidden="entry.labelHidden"
            :required="entry.required"
            :disabled="entry.disabled"
            :invalid="entry.invalid"
            :error="entry.error"
            hint="停用選項不能選取。"
            no-results-text="沒有符合的來源"
          />
        </article>
      </div>
    </section>
    <section class="demo-input-states__section" data-combobox-recovery>
      <h4>錯誤恢復與暫停選擇</h4>
      <p class="demo-input-states__copy">
        兩個欄位都要求選擇既有來源。選取後清除錯誤；暫停時關閉選單並保留值，重設會再次顯示錯誤。
      </p>
      <div :key="revision" class="demo-input-states__case">
        <UiSwitch id="demo-combobox-lock" v-model="locked" label="暫停選擇" />
        <div class="demo-input-states__grid">
          <UiCombobox
            id="demo-combobox-recovery-editable"
            v-model="recovery.editable"
            label="可搜尋來源"
            :items="GROUPED_ITEMS"
            :disabled="locked"
            required
            placeholder="輸入專輯或藝人"
            :error="recovery.editable ? '' : '請選擇曲目來源。'"
            hint="目前選擇已符合範例要求。"
          />
          <UiCombobox
            id="demo-combobox-recovery-select-only"
            v-model="recovery.selectOnly"
            label="只選擇來源"
            :items="GROUPED_ITEMS"
            :editable="false"
            :disabled="locked"
            required
            placeholder="請選擇來源"
            :error="recovery.selectOnly ? '' : '請選擇曲目來源。'"
            hint="目前選擇已符合範例要求。"
          />
        </div>
        <div class="demo-input-states__actions">
          <output data-combobox-values
            >可搜尋：{{ recovery.editable || '未選擇' }}；只選擇：{{
              recovery.selectOnly || '未選擇'
            }}</output
          >
          <UiButton data-combobox-reset variant="secondary" @click="reset"
            >重設範例</UiButton
          >
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, useId } from 'vue';
import UiColorField from '../ui/UiColorField.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const id = useId();
const choices = [
  { value: 'first', label: '第一首' },
  { value: 'second', label: '第二首' },
];
const values = reactive({
  text: '週末演出',
  search: '歌曲',
  select: 'first',
  combo: 'second',
  color: '#8296d0',
});
</script>

<template>
  <div class="demo-field-surface-sample">
    <UiTextField :id="`${id}-text`" v-model="values.text" label="文字欄位" />
    <UiTextarea
      :id="`${id}-readonly`"
      label="唯讀文字"
      model-value="演出曲目可選取與複製"
      :rows="2"
      readonly
    />
    <UiSearchBox v-model="values.search" label="搜尋" />
    <UiSelect
      :id="`${id}-select`"
      v-model="values.select"
      label="原生下拉"
      :options="choices"
    />
    <UiCombobox
      :id="`${id}-combo`"
      v-model="values.combo"
      label="可搜尋下拉"
      :items="choices"
    />
    <UiColorField :id="`${id}-color`" v-model="values.color" label="顏色" />
    <UiTextField
      :id="`${id}-invalid`"
      label="驗證錯誤"
      error="請輸入歌曲名稱"
    />
    <UiSearchBox model-value="已停用" label="已停用的搜尋" disabled />
  </div>
</template>

<style scoped>
.demo-field-surface-sample {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
  overflow-wrap: anywhere;
}
</style>

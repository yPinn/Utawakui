<script setup>
import { shallowRef } from 'vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

defineProps({
  versionInfo: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update']);
const detailsOpen = shallowRef(false);
const fields = [
  {
    key: 'performance',
    label: '錄製形式',
    options: [
      ['unspecified', '未設定'],
      ['studio', '錄音室'],
      ['live', '現場'],
      ['demo', 'Demo'],
    ],
  },
  {
    key: 'arrangement',
    label: '編曲',
    options: [
      ['unspecified', '未設定'],
      ['acoustic', 'Acoustic'],
      ['remix', 'Remix'],
      ['other', '其他'],
    ],
  },
  {
    key: 'vocal',
    label: '人聲',
    options: [
      ['unspecified', '未設定'],
      ['vocal', '有人聲'],
      ['instrumental', '純伴奏'],
    ],
  },
].map((field) => ({
  ...field,
  options: field.options.map(([value, label]) => ({ value, label })),
}));
</script>

<template>
  <section class="work-version-fields" aria-labelledby="work-version-heading">
    <h3 id="work-version-heading" class="work-version-fields__title">
      版本設定
    </h3>
    <UiTextField
      id="work-version-label"
      label="版本名稱（選填）"
      :model-value="versionInfo.label"
      :maxlength="120"
      :disabled="disabled"
      placeholder="例：合作錄音版、台北場 Live"
      @update:model-value="emit('update', 'label', $event)"
    />
    <slot name="relationship" />
    <UiDisclosure v-model:open="detailsOpen" label="更多設定">
      <div class="work-version-fields__details">
        <div class="work-version-fields__dimensions">
          <UiSelect
            v-for="field in fields"
            :id="`work-version-${field.key}`"
            :key="field.key"
            :label="field.label"
            :options="field.options"
            :model-value="versionInfo[field.key]"
            :disabled="disabled"
            @update:model-value="emit('update', field.key, $event)"
          />
        </div>
        <UiTextarea
          id="work-version-note"
          label="備註（選填）"
          :model-value="versionInfo.note"
          :maxlength="500"
          :rows="3"
          :disabled="disabled"
          @update:model-value="emit('update', 'note', $event)"
        />
      </div>
    </UiDisclosure>
  </section>
</template>

<style scoped>
.work-version-fields {
  display: grid;
  gap: var(--ui-space-3);
}
.work-version-fields__title {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}
.work-version-fields__details {
  display: grid;
  gap: var(--ui-space-3);
}
.work-version-fields__dimensions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-3);
}
</style>

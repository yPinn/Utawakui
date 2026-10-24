<script setup>
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
const props = defineProps({
  release: { type: Object, required: true },
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update']);
const fields = [
  { key: 'type', label: '發行類型' },
  { key: 'date', label: '發行日期' },
  { key: 'totalTrackCount', label: '總曲數' },
];
const typeOptions = ['unknown', 'single', 'ep', 'album'].map((value) => ({
  value,
  label:
    value === 'ep'
      ? `${releaseTypeLabel(value)}（EP）`
      : releaseTypeLabel(value),
}));
const precisionOptions = [
  { value: 'year', label: '年' },
  { value: 'month', label: '年月' },
  { value: 'day', label: '年月日' },
];
const modes = (field) => [
  { value: 'source', label: `沿用來源：${sourceValue(field) || '無資料'}` },
  { value: 'manual', label: '手動設定' },
  ...(field !== 'type' ? [{ value: 'clear', label: '設為未知' }] : []),
];
function sourceValue(field) {
  const value = props.release.sourceValues?.[field];
  if (value === undefined || value === null) return '';
  const text =
    field === 'type'
      ? releaseTypeLabel(value)
      : field === 'date'
        ? value?.value
        : value;
  return text === undefined || text === null || text === '' ? '' : String(text);
}
</script>
<template>
  <section class="release-info-fields" aria-label="發行資料">
    <div
      v-for="field in fields"
      :key="field.key"
      class="release-info-fields__group"
    >
      <UiSelect
        :id="`release-${field.key === 'totalTrackCount' ? 'count' : field.key}-mode`"
        :label="field.label"
        :model-value="draft[field.key].mode"
        :options="modes(field.key)"
        :disabled="disabled"
        @update:model-value="emit('update', field.key, 'mode', $event)"
      />
      <template v-if="draft[field.key].mode === 'manual'">
        <UiSelect
          v-if="field.key === 'type'"
          id="release-type-value"
          label="類型"
          :model-value="draft.type.value"
          :options="typeOptions"
          :disabled="disabled"
          @update:model-value="emit('update', 'type', 'value', $event)"
        />
        <div v-else-if="field.key === 'date'" class="release-info-fields__date">
          <UiSelect
            id="release-date-precision"
            label="日期格式"
            :model-value="draft.date.precision"
            :options="precisionOptions"
            :disabled="disabled"
            @update:model-value="emit('update', 'date', 'precision', $event)"
          />
          <UiTextField
            id="release-date-value"
            label="日期"
            :model-value="draft.date.value"
            :placeholder="
              draft.date.precision === 'year'
                ? '2026'
                : draft.date.precision === 'month'
                  ? '2026-07'
                  : '2026-07-25'
            "
            :maxlength="10"
            :disabled="disabled"
            @update:model-value="emit('update', 'date', 'value', $event)"
          />
        </div>
        <UiTextField
          v-else
          id="release-count-value"
          label="曲數"
          type="number"
          :min="release.memberCount || 1"
          :model-value="draft.totalTrackCount.value"
          :disabled="disabled"
          :hint="`至少 ${Math.max(1, release.memberCount || 0)} 首。`"
          @update:model-value="
            emit('update', 'totalTrackCount', 'value', $event)
          "
        />
      </template>
    </div>
  </section>
</template>
<style scoped>
.release-info-fields {
  display: grid;
  gap: var(--ui-space-5);
}
.release-info-fields__group {
  display: grid;
  gap: var(--ui-space-3);
}
.release-info-fields__date {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--ui-space-3);
}
@media (max-width: 40rem) {
  .release-info-fields__date {
    grid-template-columns: 1fr;
  }
}
</style>

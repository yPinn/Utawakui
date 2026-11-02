<script setup>
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  release: { type: Object, required: true },
  draft: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update']);
const fields = [
  { key: 'type', label: t('release.fields.type') },
  { key: 'date', label: t('release.fields.date') },
  { key: 'totalTrackCount', label: t('release.fields.totalTrackCount') },
];
const typeOptions = ['unknown', 'single', 'ep', 'album'].map((value) => ({
  value,
  label:
    value === 'ep' ? t('release.fields.epOption') : releaseTypeLabel(value),
}));
const precisionOptions = [
  { value: 'year', label: t('release.fields.year') },
  { value: 'month', label: t('release.fields.month') },
  { value: 'day', label: t('release.fields.day') },
];
const modes = (field) => [
  {
    value: 'source',
    label: t('release.fields.useSource', {
      value: sourceValue(field) || t('release.fields.noSourceData'),
    }),
  },
  { value: 'manual', label: t('release.fields.manual') },
  ...(field !== 'type'
    ? [{ value: 'clear', label: t('release.fields.clear') }]
    : []),
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
  <section
    class="release-info-fields"
    :aria-label="t('release.editor.dataLabel')"
  >
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
          :label="t('release.fields.typeLabel')"
          :model-value="draft.type.value"
          :options="typeOptions"
          :disabled="disabled"
          @update:model-value="emit('update', 'type', 'value', $event)"
        />
        <div v-else-if="field.key === 'date'" class="release-info-fields__date">
          <UiSelect
            id="release-date-precision"
            :label="t('release.fields.precision')"
            :model-value="draft.date.precision"
            :options="precisionOptions"
            :disabled="disabled"
            @update:model-value="emit('update', 'date', 'precision', $event)"
          />
          <UiTextField
            id="release-date-value"
            :label="t('release.fields.dateLabel')"
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
          :label="t('release.fields.countLabel')"
          type="number"
          :min="release.memberCount || 1"
          :model-value="draft.totalTrackCount.value"
          :disabled="disabled"
          :hint="
            t('release.fields.countMin', {
              min: Math.max(1, release.memberCount || 0),
            })
          "
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

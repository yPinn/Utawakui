<script setup>
import { useId } from 'vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import {
  MERGE_LABELS,
  displayMetadata,
  reconciliationReason,
} from '../../utils/libraryReconciliation.js';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
const props = defineProps({
  preview: { type: Object, required: true },
  choices: { type: Object, default: () => ({}) },
  disabled: Boolean,
});
const emit = defineEmits(['update:choices']);
const prefix = useId();
const options = [
  { value: 'suggested', label: '建議值（保留人工資料）' },
  { value: 'keep', label: '保留原值' },
  { value: 'other', label: '採用另一張' },
];
const display = (field, value) =>
  field === 'type' ? releaseTypeLabel(value) : displayMetadata(value);
function choose(field, value) {
  const choices = { ...props.choices };
  if (value === 'suggested') delete choices[field];
  else choices[field] = value;
  emit('update:choices', choices);
}
</script>

<template>
  <div class="reconciliation-merge">
    <p class="reconciliation-merge__summary">
      保留「{{ preview.kept.name }}」，接入「{{
        preview.retired.name
      }}」的曲序。
    </p>
    <UiHint v-if="!preview.mergeable">{{
      reconciliationReason(preview.reason)
    }}</UiHint>
    <UiHint v-if="preview.mergeable"
      >保留原發行與封面，便條及照片一併保留；可復原。</UiHint
    >
    <fieldset
      v-for="field in preview.fields"
      :key="field.field"
      class="reconciliation-merge__field"
      :disabled="disabled"
    >
      <legend>{{ MERGE_LABELS[field.field] }}</legend>
      <p class="reconciliation-merge__comparison">
        原值：{{ display(field.field, field.kept) }}<br />另一張：{{
          display(field.field, field.other)
        }}
      </p>
      <UiSelect
        :id="`${prefix}-${field.field}`"
        :label="`${MERGE_LABELS[field.field]}的合併方式`"
        label-hidden
        :model-value="choices[field.field] ?? 'suggested'"
        :options="options"
        :disabled="disabled || !preview.mergeable"
        @update:model-value="choose(field.field, $event)"
      />
      <p class="reconciliation-merge__comparison">
        合併後：{{
          display(
            field.field,
            choices[field.field] === 'other'
              ? field.other
              : choices[field.field] === 'keep'
                ? field.kept
                : field.proposed,
          )
        }}
      </p>
    </fieldset>
    <UiHint v-if="preview.movedObjects"
      >保留另一頁的 {{ preview.movedObjects }} 個物件。</UiHint
    >
    <p class="reconciliation-merge__comparison">
      {{ preview.tracks.length }} 首本地曲目，音檔不變。
    </p>
  </div>
</template>

<style scoped>
.reconciliation-merge {
  display: grid;
  gap: var(--ui-space-3);
}
.reconciliation-merge__summary {
  margin: 0;
  font-weight: var(--ui-font-weight-semibold);
  overflow-wrap: anywhere;
}
.reconciliation-merge__field {
  min-inline-size: 0;
  margin: 0;
  padding: var(--ui-space-3) 0 0;
  border: 0;
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.reconciliation-merge__comparison {
  margin: var(--ui-space-2) 0;
  overflow-wrap: anywhere;
}
</style>

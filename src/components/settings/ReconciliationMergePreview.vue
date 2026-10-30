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
import { t } from '../../utils/i18n.js';
const props = defineProps({
  preview: { type: Object, required: true },
  choices: { type: Object, default: () => ({}) },
  disabled: Boolean,
});
const emit = defineEmits(['update:choices']);
const prefix = useId();
const options = [
  { value: 'suggested', label: t('reconciliation.mergePreview.suggested') },
  { value: 'keep', label: t('reconciliation.mergePreview.keep') },
  { value: 'other', label: t('reconciliation.mergePreview.other') },
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
      {{
        t('reconciliation.mergePreview.summary', {
          kept: preview.kept.name,
          retired: preview.retired.name,
        })
      }}
    </p>
    <UiHint v-if="!preview.mergeable">{{
      reconciliationReason(preview.reason)
    }}</UiHint>
    <UiHint v-if="preview.mergeable">{{
      t('reconciliation.mergePreview.keptHint')
    }}</UiHint>
    <fieldset
      v-for="field in preview.fields"
      :key="field.field"
      class="reconciliation-merge__field"
      :disabled="disabled"
    >
      <legend>{{ MERGE_LABELS[field.field] }}</legend>
      <p class="reconciliation-merge__comparison">
        {{
          t('reconciliation.mergePreview.kept', {
            value: display(field.field, field.kept),
          })
        }}<br />{{
          t('reconciliation.mergePreview.otherValue', {
            value: display(field.field, field.other),
          })
        }}
      </p>
      <UiSelect
        :id="`${prefix}-${field.field}`"
        :label="
          t('reconciliation.mergePreview.methodNamed', {
            field: MERGE_LABELS[field.field],
          })
        "
        label-hidden
        :model-value="choices[field.field] ?? 'suggested'"
        :options="options"
        :disabled="disabled || !preview.mergeable"
        @update:model-value="choose(field.field, $event)"
      />
      <p class="reconciliation-merge__comparison">
        {{
          t('reconciliation.mergePreview.after', {
            value: display(
              field.field,
              choices[field.field] === 'other'
                ? field.other
                : choices[field.field] === 'keep'
                  ? field.kept
                  : field.proposed,
            ),
          })
        }}
      </p>
    </fieldset>
    <UiHint v-if="preview.movedObjects">{{
      t(
        'reconciliation.mergePreview.movedObjects',
        { count: preview.movedObjects },
        preview.movedObjects,
      )
    }}</UiHint>
    <p class="reconciliation-merge__comparison">
      {{
        t(
          'reconciliation.mergePreview.tracks',
          { count: preview.tracks.length },
          preview.tracks.length,
        )
      }}
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

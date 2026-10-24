<script setup>
import { computed, useId } from 'vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiHint from '../ui/UiHint.vue';
import {
  METADATA_LABELS,
  displayMetadata,
} from '../../utils/libraryReconciliation.js';

const props = defineProps({
  preview: { type: Object, required: true },
  decisions: { type: Object, default: () => ({}) },
  disabled: Boolean,
});
const emit = defineEmits(['update:decisions']);
const prefix = useId();
const fields = computed(() =>
  Object.entries(props.preview.fields).map(([field, data]) => ({
    field,
    ...data,
    label: METADATA_LABELS[field],
    options: [
      { value: 'keep', label: '保留目前值' },
      ...(data.observed !== null && data.observed !== undefined
        ? [
            {
              value: 'source',
              label:
                data.observedKind === 'provider'
                  ? '採用本次來源'
                  : '採用音檔標籤',
            },
            ...(data.canFollow
              ? [{ value: 'follow', label: '恢復跟隨來源' }]
              : []),
          ]
        : []),
      { value: 'manual', label: '手動輸入' },
      ...(field !== 'title' ? [{ value: 'clear', label: '清空' }] : []),
    ],
  })),
);
const numeric = (field) =>
  [
    'releaseYear',
    'trackNumber',
    'trackTotal',
    'discNumber',
    'discTotal',
  ].includes(field);
function decide(field, action) {
  emit('update:decisions', {
    ...props.decisions,
    [field]:
      action === 'manual'
        ? {
            action,
            value:
              props.preview.fields[field].value ?? (numeric(field) ? null : ''),
          }
        : { action },
  });
}
function edit(field, value) {
  emit('update:decisions', {
    ...props.decisions,
    [field]: {
      action: 'manual',
      value: numeric(field) ? (value === '' ? null : Number(value)) : value,
    },
  });
}
function finalValue(field) {
  const decision = props.decisions[field.field];
  if (!decision || decision.action === 'keep') return field.value;
  if (decision.action === 'clear') return '';
  if (decision.action === 'manual') return decision.value;
  return field.observed;
}
</script>

<template>
  <div class="reconciliation-fields">
    <fieldset
      v-for="field in fields"
      :key="field.field"
      class="reconciliation-fields__row"
      :disabled="disabled"
    >
      <legend class="reconciliation-fields__legend">{{ field.label }}</legend>
      <dl class="reconciliation-fields__values">
        <div>
          <dt>
            曲庫{{
              field.origin === 'manual'
                ? ' · 人工'
                : field.origin === 'source'
                  ? ' · 跟隨來源'
                  : ''
            }}
          </dt>
          <dd>{{ displayMetadata(field.value) }}</dd>
        </div>
        <div>
          <dt>音檔標籤</dt>
          <dd>{{ displayMetadata(preview.fileTags[field.field]) }}</dd>
        </div>
        <div>
          <dt>來源資料</dt>
          <dd>{{ displayMetadata(preview.providerValues?.[field.field]) }}</dd>
        </div>
      </dl>
      <div class="reconciliation-fields__edit">
        <UiSelect
          :id="`${prefix}-${field.field}-action`"
          :label="`${field.label}的處理方式`"
          label-hidden
          :options="field.options"
          :model-value="decisions[field.field]?.action ?? 'keep'"
          :disabled="disabled"
          @update:model-value="decide(field.field, $event)"
        />
        <UiTextField
          v-if="decisions[field.field]?.action === 'manual'"
          :id="`${prefix}-${field.field}-value`"
          label="新值"
          :aria-label="`${field.label}的新值`"
          :type="numeric(field.field) ? 'number' : 'text'"
          :model-value="decisions[field.field].value ?? ''"
          :maxlength="200"
          :disabled="disabled"
          :required="field.field === 'title'"
          :min="numeric(field.field) ? 1 : undefined"
          :hint="field.field === 'releaseDate' ? '年份、年-月或年-月-日。' : ''"
          @update:model-value="edit(field.field, $event)"
        />
      </div>
      <UiHint
        v-if="
          decisions[field.field] && decisions[field.field].action !== 'keep'
        "
        tone="text"
        class="reconciliation-fields__result"
      >
        儲存後：{{ displayMetadata(finalValue(field)) }}
      </UiHint>
    </fieldset>
  </div>
</template>

<style scoped>
.reconciliation-fields {
  display: grid;
  gap: var(--ui-space-4);
}
.reconciliation-fields__row {
  min-inline-size: 0;
  margin: 0;
  padding: var(--ui-space-3) 0;
  border: 0;
  border-block-start: 1px solid var(--ui-color-border);
}
.reconciliation-fields__legend {
  padding-inline-end: var(--ui-space-2);
  font-weight: var(--ui-font-weight-semibold);
}
.reconciliation-fields__values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
  margin: 0 0 var(--ui-space-3);
}
.reconciliation-fields__values dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
.reconciliation-fields__values dd {
  margin: var(--ui-space-1) 0 0;
  overflow-wrap: anywhere;
}
.reconciliation-fields__edit {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
}
.reconciliation-fields__result {
  margin: var(--ui-space-2) 0 0;
  overflow-wrap: anywhere;
}
@media (max-width: 42rem) {
  .reconciliation-fields__values,
  .reconciliation-fields__edit {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

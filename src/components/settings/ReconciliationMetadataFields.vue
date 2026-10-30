<script setup>
import { computed, useId } from 'vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiHint from '../ui/UiHint.vue';
import {
  METADATA_LABELS,
  displayMetadata,
} from '../../utils/libraryReconciliation.js';
import { t } from '../../utils/i18n.js';

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
      { value: 'keep', label: t('reconciliation.fields.keep') },
      ...(data.observed !== null && data.observed !== undefined
        ? [
            {
              value: 'source',
              label:
                data.observedKind === 'provider'
                  ? t('reconciliation.fields.useSource')
                  : t('reconciliation.fields.useTags'),
            },
            ...(data.canFollow
              ? [{ value: 'follow', label: t('reconciliation.fields.follow') }]
              : []),
          ]
        : []),
      { value: 'manual', label: t('reconciliation.fields.manual') },
      ...(field !== 'title'
        ? [{ value: 'clear', label: t('reconciliation.fields.clear') }]
        : []),
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
            {{
              t(
                field.origin === 'manual'
                  ? 'reconciliation.fields.libraryManual'
                  : field.origin === 'source'
                    ? 'reconciliation.fields.librarySource'
                    : 'reconciliation.fields.library',
              )
            }}
          </dt>
          <dd>{{ displayMetadata(field.value) }}</dd>
        </div>
        <div>
          <dt>{{ t('reconciliation.fields.tags') }}</dt>
          <dd>{{ displayMetadata(preview.fileTags[field.field]) }}</dd>
        </div>
        <div>
          <dt>{{ t('reconciliation.fields.sourceData') }}</dt>
          <dd>{{ displayMetadata(preview.providerValues?.[field.field]) }}</dd>
        </div>
      </dl>
      <div class="reconciliation-fields__edit">
        <UiSelect
          :id="`${prefix}-${field.field}-action`"
          :label="
            t('reconciliation.fields.actionNamed', { field: field.label })
          "
          label-hidden
          :options="field.options"
          :model-value="decisions[field.field]?.action ?? 'keep'"
          :disabled="disabled"
          @update:model-value="decide(field.field, $event)"
        />
        <UiTextField
          v-if="decisions[field.field]?.action === 'manual'"
          :id="`${prefix}-${field.field}-value`"
          :label="t('reconciliation.fields.newValue')"
          :aria-label="
            t('reconciliation.fields.newValueNamed', { field: field.label })
          "
          :type="numeric(field.field) ? 'number' : 'text'"
          :model-value="decisions[field.field].value ?? ''"
          :maxlength="200"
          :disabled="disabled"
          :required="field.field === 'title'"
          :min="numeric(field.field) ? 1 : undefined"
          :hint="
            field.field === 'releaseDate'
              ? t('reconciliation.fields.dateHint')
              : ''
          "
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
        {{
          t('reconciliation.fields.afterSave', {
            value: displayMetadata(finalValue(field)),
          })
        }}
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
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
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
  font-size: var(--ui-type-caption-size);
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

<script setup>
import { shallowRef } from 'vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  versionInfo: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update']);
const detailsOpen = shallowRef(false);
const fields = [
  {
    key: 'performance',
    label: t('work.fields.performance'),
    options: [
      ['unspecified', t('work.fields.unspecified')],
      ['studio', t('work.fields.studio')],
      ['live', t('work.fields.live')],
      ['demo', 'Demo'],
    ],
  },
  {
    key: 'arrangement',
    label: t('work.fields.arrangement'),
    options: [
      ['unspecified', t('work.fields.unspecified')],
      ['acoustic', 'Acoustic'],
      ['remix', 'Remix'],
      ['other', t('work.fields.other')],
    ],
  },
  {
    key: 'vocal',
    label: t('work.fields.vocal'),
    options: [
      ['unspecified', t('work.fields.unspecified')],
      ['vocal', t('work.fields.hasVocal')],
      ['instrumental', t('work.fields.instrumental')],
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
      {{ t('work.fields.heading') }}
    </h3>
    <UiTextField
      id="work-version-label"
      :label="t('work.fields.name')"
      :model-value="versionInfo.label"
      :maxlength="120"
      :disabled="disabled"
      :placeholder="t('work.fields.namePlaceholder')"
      @update:model-value="emit('update', 'label', $event)"
    />
    <slot name="relationship" />
    <UiDisclosure v-model:open="detailsOpen" :label="t('work.fields.more')">
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
          :label="t('work.fields.note')"
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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
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

<script setup>
import { computed, onMounted, useId } from 'vue';
import { OUTPUT_TRANSLATION_FONT_SCALE } from '../../../shared/outputAppearance.mjs';
import { useOutputTranslationSettings } from '../../composables/useOutputTranslationSettings.js';
import { t } from '../../utils/i18n.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';

defineProps({ fontScale: { type: Number, required: true } });
const emit = defineEmits(['update:fontScale', 'commit']);
const id = useId();
const {
  preference,
  loaded,
  reading,
  busy,
  readError,
  saveError,
  items,
  refresh,
  setPreference,
} = useOutputTranslationSettings();
const disabled = computed(() => !loaded.value || reading.value || busy.value);
const visibilityLabel = t('outputPanel.translation.show');
const sizeField = {
  ...OUTPUT_TRANSLATION_FONT_SCALE,
  key: 'translationFontScale',
  label: t('outputPanel.translation.fontScale'),
  control: 'range',
  unit: '%',
};

onMounted(refresh);
</script>

<template>
  <ObsPropertySection>
    <ObsAppearanceControlRow
      control-id="output-translation-preference"
      :label="visibilityLabel"
      :labels-control="false"
      stacked
    >
      <UiSelect
        id="output-translation-preference"
        :label="visibilityLabel"
        :options="items"
        :model-value="loaded ? preference : ''"
        :placeholder="loaded ? '' : t('settings.notLoaded')"
        :disabled="disabled"
        :error="saveError"
        label-hidden
        @update:model-value="setPreference"
      />
    </ObsAppearanceControlRow>
    <template v-if="readError">
      <UiHint tone="danger" role="status">{{ readError }}</UiHint>
      <UiButton variant="secondary" :loading="reading" @click="refresh">
        {{ t('settings.reload') }}
      </UiButton>
    </template>
    <ObsAppearanceField
      :id-prefix="`output-translation-${id}`"
      :field="sizeField"
      :model-value="fontScale"
      :modified="fontScale !== sizeField.defaultValue"
      stacked
      @update:model-value="emit('update:fontScale', $event)"
      @commit="emit('commit')"
    />
  </ObsPropertySection>
</template>

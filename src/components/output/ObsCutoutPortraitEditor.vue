<script setup>
import { computed, onMounted, reactive, shallowRef, useTemplateRef } from 'vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsCutoutPortraitPhotoField from './ObsCutoutPortraitPhotoField.vue';
import ObsOutputColorPalette from './ObsOutputColorPalette.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import UiButton from '../ui/UiButton.vue';
import UiStack from '../ui/UiStack.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  fields: { type: Array, required: true },
  values: { type: Object, required: true },
  trackId: { type: String, default: '' },
  isNew: { type: Boolean, default: false },
  recentColors: { type: Array, default: () => [] },
  savedColors: { type: Array, default: () => [] },
});
const emit = defineEmits(['save', 'cancel', 'toggleSavedColor']);

const form = useTemplateRef('form');
const draft = reactive(
  Object.fromEntries(props.fields.map(({ key }) => [key, props.values[key]])),
);
const showPalette = shallowRef(false);
const photoBusy = shallowRef(false);
const photoField = computed(() =>
  props.fields.find(({ control }) => control === 'portrait-photo'),
);
const colorField = computed(() =>
  props.fields.find(({ control }) => control === 'color'),
);
const appearanceFields = computed(() =>
  [
    props.fields.find(({ control }) => control === 'text'),
    colorField.value,
  ].filter(Boolean),
);
const title = computed(() =>
  t(
    props.isNew
      ? 'outputPanel.portrait.addSet'
      : 'outputPanel.portrait.editSet',
  ),
);

function save() {
  if (!photoBusy.value) emit('save', { ...draft });
}

onMounted(() =>
  form.value?.querySelector('button')?.focus({ preventScroll: true }),
);
</script>

<template>
  <form ref="form" :aria-label="title" @submit.prevent="save">
    <ObsPropertySection :title="title">
      <ObsCutoutPortraitPhotoField
        v-if="photoField"
        :id="`output-appearance-${photoField.key}`"
        v-model="draft[photoField.key]"
        :label="photoField.label"
        :track-id="trackId"
        :background="
          draft[colorField?.key] || 'var(--ui-output-portrait-indigo)'
        "
        @update:busy="photoBusy = $event"
      />
      <ObsAppearanceField
        v-for="field in appearanceFields"
        :key="field.key"
        :field="field"
        :model-value="draft[field.key]"
        :palette-target="showPalette && field === colorField"
        stacked
        @activate-color="showPalette = true"
        @update:model-value="draft[field.key] = $event"
      />
      <ObsOutputColorPalette
        v-if="showPalette && colorField"
        :label="colorField.label"
        :model-value="draft[colorField.key]"
        :recent-colors="recentColors"
        :saved-colors="savedColors"
        @select="draft[colorField.key] = $event"
        @toggle-saved-color="emit('toggleSavedColor', $event)"
      />
      <UiStack class="obs-portrait-editor__actions" justify="end" wrap :gap="2">
        <UiButton @click="emit('cancel')">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" variant="accent" :disabled="photoBusy">{{
          t('common.save')
        }}</UiButton>
      </UiStack>
    </ObsPropertySection>
  </form>
</template>

<style scoped>
.obs-portrait-editor__actions {
  margin-block-start: var(--ui-space-2);
}
</style>

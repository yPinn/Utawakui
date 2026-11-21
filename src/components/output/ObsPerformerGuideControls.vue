<script setup>
import { computed, shallowRef, useId } from 'vue';
import { ImagePlus, RotateCcw } from '../../icons/index.js';
import { useOutputPhotoDraft } from '../../composables/output/useOutputPhotoDraft.js';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import {
  DEFAULT_PERFORMER_GUIDE,
  PERFORMER_GUIDE_MIN_SIZE,
  PERFORMER_GUIDE_SHAPES,
  applyPerformerGuideShape,
  normalizePerformerGuide,
  performerGuideCrop,
} from '../../utils/outputPerformerGuide.js';
import { t } from '../../utils/i18n.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsPhantomPortraitImageModal from './ObsPhantomPortraitImageModal.vue';
import ObsPropertySection from './ObsPropertySection.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStack from '../ui/UiStack.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  guide: { type: Object, required: true },
  available: { type: Boolean, required: true },
  customImage: { type: Boolean, default: false },
  imageBusy: { type: Boolean, default: false },
  imageError: { type: String, default: '' },
  saveImage: { type: Function, required: true },
});
const emit = defineEmits(['commit', 'show']);
const id = useId();
const { draft, busy, choosing, error, choose, close } =
  useOutputPhotoDraft('performer-guide');
const { isFeatureEnabled } = useFeatureGates();
const crop = shallowRef(null);
const shapes = Object.entries(PERFORMER_GUIDE_SHAPES).map(
  ([value, { ratio }]) => ({
    value,
    label: t('outputPanel.performerGuide.shapeOption', {
      shape: t(`outputPanel.performerGuide.shapes.${value}`),
      ratio: ratio.join(':'),
    }),
  }),
);
const shapeLabel = t('outputPanel.performerGuide.shape');
const fields = [
  { key: 'x', min: 0 },
  { key: 'y', min: 0 },
  { key: 'width', min: PERFORMER_GUIDE_MIN_SIZE * 100 },
  { key: 'height', min: PERFORMER_GUIDE_MIN_SIZE * 100 },
].map((field) => ({
  ...field,
  label: t(`outputPanel.performerGuide.${field.key}`),
}));
const atDefault = computed(
  () =>
    props.guide.shape === DEFAULT_PERFORMER_GUIDE.shape &&
    fields.every(
      ({ key }) => props.guide[key] === DEFAULT_PERFORMER_GUIDE[key],
    ),
);

function percent(value) {
  return Math.round(value * 1000) / 10;
}

function chooseImage() {
  crop.value = performerGuideCrop(props.guide);
  void choose();
}

function restoreImage() {
  error.value = '';
  void props.saveImage(null);
}

function change(key, event) {
  const field = event.currentTarget;
  const value = field.valueAsNumber;
  const next = Number.isFinite(value)
    ? normalizePerformerGuide({ ...props.guide, [key]: value / 100 }, key)
    : props.guide;
  if (next !== props.guide) emit('commit', next);
  field.value = String(percent(next[key]));
}
</script>

<template>
  <section
    class="obs-performer-guide-controls"
    :aria-label="t('outputPanel.performerGuide.label')"
  >
    <ObsPropertySection :title="t('outputPanel.performerGuide.imageSection')">
      <template v-if="available">
        <UiStack align="center" :gap="1" wrap>
          <UiButton
            :icon="ImagePlus"
            :loading="choosing"
            :disabled="imageBusy || busy"
            @click="chooseImage"
          >
            {{ t('outputPanel.performerGuide.replaceImage') }}
          </UiButton>
          <UiIconButton
            v-if="customImage"
            :icon="RotateCcw"
            :label="t('outputPanel.performerGuide.defaultImage')"
            :disabled="imageBusy || busy"
            @click="restoreImage"
          />
        </UiStack>
        <UiHint v-if="error || imageError" role="alert" tone="danger">{{
          t(error || imageError)
        }}</UiHint>
      </template>
      <UiStack v-else>
        <UiButton @click="emit('show')">
          {{ t('outputPanel.overlay.showPreviewPerformer') }}
        </UiButton>
      </UiStack>
    </ObsPropertySection>

    <ObsPropertySection
      v-if="available"
      :title="t('outputPanel.performerGuide.placementSection')"
      :modified="!atDefault"
      @reset="emit('commit', DEFAULT_PERFORMER_GUIDE)"
    >
      <ObsAppearanceControlRow
        :control-id="`${id}-shape`"
        :label="shapeLabel"
        :labels-control="false"
        stacked
      >
        <UiSelect
          :id="`${id}-shape`"
          :label="shapeLabel"
          :model-value="guide.shape"
          :options="shapes"
          label-hidden
          @update:model-value="
            emit('commit', applyPerformerGuideShape(guide, $event))
          "
        />
      </ObsAppearanceControlRow>
      <div class="obs-performer-guide-controls__fields">
        <ObsAppearanceControlRow
          v-for="{ key, min, label } in fields"
          :key="key"
          :control-id="`${id}-${key}`"
          :label="label"
          :labels-control="false"
          stacked
        >
          <UiTextField
            :id="`${id}-${key}`"
            :label="label"
            :model-value="percent(guide[key])"
            type="number"
            :min="min"
            :max="100"
            :step="0.1"
            label-hidden
            @change="change(key, $event)"
          />
        </ObsAppearanceControlRow>
      </div>
    </ObsPropertySection>

    <ObsPhantomPortraitImageModal
      v-if="draft"
      :photo="draft"
      :preview-crop="crop"
      :save-photo="saveImage"
      :allow-cutout="isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW)"
      @close="close"
      @apply="close"
    />
  </section>
</template>

<style scoped>
.obs-performer-guide-controls__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
}
</style>

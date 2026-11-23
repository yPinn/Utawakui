<script setup>
import { computed, shallowRef } from 'vue';
import { useOutputPreviewMotion } from '../../composables/output/useOutputPreviewMotion.js';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import UiHint from '../ui/UiHint.vue';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
  active: { type: Boolean, default: true },
});

const captureSize = computed(() =>
  captureSizeForKind(props.preset?.kind, null, props.preset?.id),
);

const previewFailed = shallowRef(false);
const loadedPreview = shallowRef(null);
const livePreview = computed(() => {
  const preview = loadedPreview.value;
  return props.active && preview && preview.presetId === props.preset?.id
    ? preview.component
    : null;
});

useOutputPreviewMotion({
  scene: () => props.preset?.id,
  animated: () => props.active && Boolean(props.preset),
  start() {
    const presetId = props.preset?.id;
    let current = true;
    import('./ObsTemplateMockup.vue').then(
      ({ default: component }) => {
        if (current) loadedPreview.value = { component, presetId };
      },
      () => {
        if (current) previewFailed.value = true;
      },
    );
    return () => {
      current = false;
    };
  },
  stop() {
    loadedPreview.value = null;
    previewFailed.value = false;
  },
});
</script>

<template>
  <section
    class="obs-template-preview-stage"
    :aria-label="t('outputPanel.stage.label')"
  >
    <header data-output-preview-info>
      <ObsPreviewCaption
        :label="
          preset?.kind === 'lyrics'
            ? t('outputPanel.stage.fixed')
            : captureSize.label
        "
        :width="captureSize.width"
        :height="captureSize.height"
      />
    </header>

    <div class="obs-template-preview-stage__frame">
      <ObsTemplateThumbnail
        v-if="!livePreview"
        :key="preset?.id"
        :preset="preset"
        loading="eager"
      />
      <component
        :is="livePreview"
        v-else
        :key="preset?.id"
        :preset="preset"
        :scene="scene"
        size="thumbnail"
        :animated="true"
      />
    </div>
    <UiHint v-if="previewFailed" role="status">
      {{ t('outputPanel.stage.motionFailed') }}
    </UiHint>
  </section>
</template>

<style scoped>
.obs-template-preview-stage {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__frame {
  --obs-template-preview-frame-border-width: 0px;
  --obs-template-preview-frame-radius: 0;

  inline-size: 100%;
  max-inline-size: var(--ui-output-gallery-preview-max-width);
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  margin-inline: auto;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-output-preview-canvas);
}
</style>

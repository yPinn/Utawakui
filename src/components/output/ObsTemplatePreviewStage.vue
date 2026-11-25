<script setup>
import { computed, onErrorCaptured, shallowRef } from 'vue';
import { useOutputPreviewMotion } from '../../composables/output/useOutputPreviewMotion.js';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import { outputTemplatePreviewFor } from './previews/outputTemplatePreviews.js';
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
    ? preview
    : null;
});

onErrorCaptured(() => {
  if (!loadedPreview.value) return;
  loadedPreview.value = null;
  previewFailed.value = true;
  return false;
});

useOutputPreviewMotion({
  scene: () => props.preset?.id,
  animated: () => props.active && Boolean(props.preset),
  start() {
    const preset = props.preset;
    let current = true;
    async function loadPreview() {
      try {
        // Load shared canvas CSS before the selected template's styles.
        const { default: component } = await import('./ObsTemplateMockup.vue');
        if (!current) return;
        const { default: templatePreview } =
          await outputTemplatePreviewFor(preset)();
        if (current)
          loadedPreview.value = {
            component,
            templatePreview,
            presetId: preset.id,
          };
      } catch {
        if (current) previewFailed.value = true;
      }
    }
    void loadPreview();
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
        :is="livePreview.component"
        v-else
        :key="preset?.id"
        :preset="preset"
        :template-preview="livePreview.templatePreview"
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

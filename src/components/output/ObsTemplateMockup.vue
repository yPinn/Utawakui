<script setup>
import { computed, defineAsyncComponent, toRaw } from 'vue';
import {
  normalizeOutputAppearance,
  normalizeOutputElementAppearance,
  outputAuthoredFontRem,
  outputDefaultFontId,
  outputFontScaleRatio,
  outputHangulFontCssValue,
  outputSetlistBackgroundColor,
  ornateSectionAccentColor,
} from '../../../shared/outputAppearance.mjs';
import { createOutputPreviewScene } from '../../../shared/presentation/outputPreviewScene.mjs';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';
import { outputTemplatePreviewFor } from './previews/outputTemplatePreviews.js';

const props = defineProps({
  preset: { type: Object, default: null },
  templatePreview: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
  settings: { type: Object, default: null },
  size: {
    type: String,
    default: 'detail',
    validator: (value) => ['thumbnail', 'detail'].includes(value),
  },
  animated: { type: Boolean, default: false },
  backdrop: {
    type: String,
    default: 'dark',
    validator: (value) => ['dark', 'light', 'checker'].includes(value),
  },
});

const previewComponent = computed(
  () =>
    props.templatePreview ??
    defineAsyncComponent(outputTemplatePreviewFor(props.preset)),
);
const effectiveSettings = computed(
  () =>
    props.settings ??
    (props.scene?.templateId === props.preset?.id
      ? {
          ...props.scene?.appearance,
          lyricsPresentationPolicyId: props.scene?.lyricsPresentationPolicyId,
        }
      : {}),
);
const previewScene = computed(() => {
  const options = {
    kind: props.preset?.kind ?? 'lyrics',
    templateId: props.preset?.id,
    settings: effectiveSettings.value,
  };
  // An explicit snapshot/clock can be supplied for parity inspection. Normal Gallery uses the shared example.
  if (props.scene?.snapshot)
    return createOutputPreviewScene({
      ...options,
      snapshot: toRaw(props.scene.snapshot),
      nowMs: props.scene.frameTimeMs,
      scenarioId: props.scene.scenarioId,
    });
  const base = createOutputPreviewScene(options);
  return Object.keys(props.scene ?? {}).length
    ? { ...base, ...props.scene, frame: undefined }
    : base;
});
// Previews show the template as applied: its own default font, weight, surface.
const appearance = computed(() =>
  normalizeOutputAppearance(effectiveSettings.value, {
    templateId: props.preset?.id,
  }),
);
const hangulFont = computed(() =>
  outputHangulFontCssValue(appearance.value.fontFamily),
);
const baseFont = computed(() =>
  hangulFont.value
    ? outputDefaultFontId(props.preset?.id)
    : appearance.value.fontFamily,
);
// Widgets preview at their own capture size; lyrics use the 1920×1080 canvas.
const canvasStyle = computed(() => {
  const { width, height } = captureSizeForKind(
    props.preset?.kind,
    effectiveSettings.value.captureSize,
    props.preset?.id,
  );
  const templateId = props.preset?.id;
  const elements = normalizeOutputElementAppearance(effectiveSettings.value, {
    templateId,
  });
  return {
    '--obs-canvas-width': String(width),
    '--obs-canvas-aspect': `${width} / ${height}`,
    '--obs-canvas-ratio': String(width / height),
    '--ovl-authored-font-rem': outputAuthoredFontRem(
      templateId,
      appearance.value,
    ),
    '--ovl-user-font-scale-ratio': outputFontScaleRatio(appearance.value),
    '--ovl-user-font-fine': appearance.value.fontScaleAdjustment / 100,
    '--ovl-setlist-background':
      templateId === 'queue-board'
        ? outputSetlistBackgroundColor(appearance.value)
        : undefined,
    '--ovl-el-title-size-scale':
      (elements['element.title.fontSizeScale'] ?? 100) / 100,
    '--ovl-el-artist-size-scale':
      (elements['element.artist.fontSizeScale'] ?? 100) / 100,
    '--ovl-hangul-font-prefix': hangulFont.value
      ? `${hangulFont.value},`
      : undefined,
    ...(props.preset?.id === 'ornate-vertical'
      ? {
          '--obs-ornate-section-accent': ornateSectionAccentColor(
            appearance.value,
          ),
        }
      : {}),
  };
});
</script>

<template>
  <div
    class="obs-template-mockup"
    :data-kind="preset?.kind ?? 'generic'"
    :data-size="size"
    :data-template-id="preset?.id ?? 'generic'"
    :data-motion="animated ? 'playing' : 'paused'"
    :data-backdrop="backdrop"
    :data-scenario-id="previewScene.scenarioId"
    :data-frame-time="previewScene.frameTimeMs"
    :data-appearance-font="baseFont"
    :data-appearance-weight="appearance.fontWeight"
    :data-appearance-surface="appearance.surface"
    :data-appearance-text-shadow="appearance.textShadow"
    :data-appearance-section-accent="appearance.sectionAccent"
    :style="canvasStyle"
    aria-hidden="true"
  >
    <div class="obs-template-mockup__canvas">
      <component
        :is="previewComponent"
        v-if="!previewScene.frame || previewScene.frame.visible"
        :scene="previewScene"
        :size="size"
        :animated="animated"
      />
    </div>
  </div>
</template>

<style src="./ObsTemplateMockup.base.css"></style>
<style src="./hangulFonts.css"></style>
<style src="./ObsTemplateMockup.reduced-motion.css"></style>

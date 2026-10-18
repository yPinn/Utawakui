<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { Pause, Play } from '../../icons/index.js';
import UiStack from '../ui/UiStack.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import ObsPreviewBackdropToggle from './ObsPreviewBackdropToggle.vue';
import ObsTemplateThumbnail from './ObsTemplateThumbnail.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
});

const captureSize = computed(() =>
  captureSizeForKind(props.preset?.kind, null, props.preset?.id),
);

const previewMode = shallowRef('static');
const previewFailed = shallowRef(false);
const isMotionPlaying = computed(() => previewMode.value !== 'static');
const backdrop = shallowRef('dark');
let hoverTimer;
let previewRequest = 0;
const livePreview = shallowRef(null);
const motionIcon = computed(() => (isMotionPlaying.value ? Pause : Play));
const motionLabel = computed(() =>
  isMotionPlaying.value ? '暫停動態預覽' : '播放動態預覽',
);

watch(
  () => props.preset?.id,
  () => {
    stopPreview();
    previewFailed.value = false;
  },
  { flush: 'sync' },
);

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverTimer = undefined;
}

function stopPreview() {
  cancelHover();
  previewRequest += 1;
  livePreview.value = null;
  previewMode.value = 'static';
}

async function startPreview(mode) {
  cancelHover();
  const request = ++previewRequest;
  previewMode.value = mode;
  previewFailed.value = false;
  try {
    const { default: component } = await import('./ObsTemplateMockup.vue');
    if (request === previewRequest) livePreview.value = component;
  } catch {
    if (request !== previewRequest) return;
    stopPreview();
    previewFailed.value = true;
  }
}

function startHover(event) {
  if (
    event.pointerType === 'touch' ||
    isMotionPlaying.value ||
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return;
  cancelHover();
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined;
    void startPreview('hover');
  }, 250);
}

function leaveHover() {
  cancelHover();
  if (previewMode.value === 'hover') stopPreview();
}

function toggleMotion() {
  if (isMotionPlaying.value) stopPreview();
  else {
    void startPreview('manual');
  }
}

onBeforeUnmount(stopPreview);
</script>

<template>
  <section class="obs-template-preview-stage" aria-label="選中模板預覽">
    <header
      class="obs-template-preview-stage__toolbar"
      data-output-preview-info
    >
      <ObsPreviewCaption
        :label="preset?.kind === 'lyrics' ? '固定' : captureSize.label"
        :width="captureSize.width"
        :height="captureSize.height"
      />
      <UiStack
        class="obs-template-preview-stage__actions"
        align="center"
        :gap="2"
      >
        <ObsPreviewBackdropToggle
          v-model="backdrop"
          :disabled="!isMotionPlaying"
        />
        <UiIconButton
          :icon="motionIcon"
          :label="motionLabel"
          :active="isMotionPlaying"
          :aria-pressed="isMotionPlaying"
          @click="toggleMotion"
        />
      </UiStack>
      <UiStack
        class="obs-template-preview-stage__labels"
        align="center"
        :gap="2"
      >
        <UiChip tone="muted">{{ scene.label ?? '固定示例' }}</UiChip>
        <span class="obs-template-preview-stage__motion">
          {{ preset?.preview?.motionLabel ?? '靜態' }}
        </span>
      </UiStack>
    </header>

    <div
      class="obs-template-preview-stage__canvas-group"
      @pointerenter="startHover"
      @pointerleave="leaveHover"
      @pointercancel="leaveHover"
    >
      <div class="obs-template-preview-stage__frame">
        <ObsTemplateThumbnail
          :key="preset?.id"
          :preset="preset"
          loading="eager"
        />
        <div v-if="livePreview" class="obs-template-preview-stage__live">
          <component
            :is="livePreview"
            :key="preset?.id"
            :preset="preset"
            :scene="scene"
            size="thumbnail"
            :animated="true"
            :backdrop="backdrop"
          />
        </div>
      </div>
    </div>
    <span
      v-if="previewFailed"
      class="obs-template-preview-stage__motion"
      role="status"
      >動態預覽載入失敗，請重試</span
    >
  </section>
</template>

<style scoped>
.obs-template-preview-stage {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__canvas-group {
  box-sizing: border-box;
  padding: var(--ui-output-preview-inset);
  background: var(--ui-color-canvas);
  min-inline-size: 0;
  /* This wrapper has one canvas. Grid intrinsic sizing repeatedly lays out the
     nested, container-relative preview when switching templates. */
  display: block;
}

.obs-template-preview-stage__frame {
  position: relative;
  max-inline-size: var(--ui-output-gallery-preview-max-width);
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  margin-inline: auto;
}

.obs-template-preview-stage__live {
  position: absolute;
  inset: 0;
  animation: obs-template-preview-reveal var(--ui-motion-duration-standard)
    var(--ui-motion-easing-enter) both;
}

@keyframes obs-template-preview-reveal {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.obs-template-preview-stage__labels,
.obs-template-preview-stage__actions {
  min-width: 0;
}

.obs-template-preview-stage__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__labels {
  grid-column: 1 / -1;
  overflow: hidden;
}

.obs-template-preview-stage__actions {
  flex: 0 0 auto;
}

.obs-template-preview-stage__motion {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

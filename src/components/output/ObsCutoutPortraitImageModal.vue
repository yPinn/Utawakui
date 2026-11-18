<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watchEffect,
} from 'vue';
import { maxEditedEdge } from '../../../shared/outputPortraitImage.json';
import {
  Grid3X3,
  Lasso,
  LassoSelect,
  RotateCcw,
  Undo2,
  ZoomIn,
  ZoomOut,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiRange from '../ui/UiRange.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiStack from '../ui/UiStack.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import { t } from '../../utils/i18n.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import {
  adjustPortraitMask,
  applyPortraitEdits,
  cutoutPortraitPhoto,
  drawPortraitCrop,
  portraitMaskInput,
  sharpenPortraitMask,
} from './cutoutPortraitImage.js';
import { usePortraitRetouch } from './usePortraitRetouch.js';
import { usePortraitFraming } from './usePortraitFraming.js';

const props = defineProps({
  photo: { type: Object, required: true },
});
const emit = defineEmits(['close', 'apply']);
const prefix = useId();
const preview = useTemplateRef('preview');
const original = shallowRef(null);
const cutoutMask = shallowRef(null);
const cutoutRange = shallowRef(0);
const edgeSharpness = shallowRef(0);
const retouchOpen = shallowRef(false);
const guidesEnabled = shallowRef(true);
const refinedMask = computed(() =>
  sharpenPortraitMask(
    adjustPortraitMask(cutoutMask.value, cutoutRange.value),
    edgeSharpness.value,
  ),
);
const percentage = new Intl.NumberFormat(UI_LOCALE, { style: 'percent' });
const signedPercentage = new Intl.NumberFormat(UI_LOCALE, {
  style: 'percent',
  signDisplay: 'exceptZero',
});
const formatPercent = (value) => percentage.format(value / 100);
const formatCutoutPercent = (value) => signedPercentage.format(value / 100);
const useCutout = shallowRef(false);
const saving = shallowRef(false);
const segmenting = shallowRef(false);
const error = shallowRef('');
const {
  frame,
  adjusted: adjustedFrame,
  zoom,
  minZoom,
  maxZoom,
  panning,
  activeGuides,
  reset: resetFrame,
  fitCutout,
  changeZoom,
  wheel: wheelFrame,
  start: startPan,
  move: movePan,
  end: endPan,
  panWithKey,
} = usePortraitFraming({
  photo: original,
  getVisibleMask: () => (useCutout.value ? editedMask.value : null),
  guidesEnabled,
  enabled: () => !saving.value && !lassoSelection.value,
});
const lassoTools = [
  { id: 'erase', icon: Lasso, label: t('outputPanel.portrait.lasso.erase') },
  {
    id: 'restore',
    icon: LassoSelect,
    label: t('outputPanel.portrait.lasso.restore'),
  },
];
const retouchEnabled = computed(
  () => retouchOpen.value && useCutout.value && !saving.value,
);
const {
  mode: lassoMode,
  edits: lassoEdits,
  history: lassoHistory,
  selection: lassoSelection,
  start: startLasso,
  move: moveLasso,
  finish: finishLasso,
  cancelPointer: cancelLassoPointer,
  cancelFromKeyboard: cancelLassoFromKeyboard,
  selectMode: selectLassoMode,
  undo: undoLasso,
  previewSize: lassoPreviewSize,
} = usePortraitRetouch({
  photo: () => original.value,
  frame: () => frame.value,
  alpha: () => refinedMask.value,
  enabled: () => retouchEnabled.value,
});
const lassoActive = computed(
  () => retouchEnabled.value && Boolean(lassoMode.value),
);
const editedMask = computed(() =>
  cutoutMask.value
    ? applyPortraitEdits(refinedMask.value, lassoEdits.value)
    : null,
);
const cutout = computed(() =>
  cutoutPortraitPhoto(original.value, editedMask.value),
);
const activeGuidePath = computed(() => {
  const { vertical, horizontal } = activeGuides.value;
  return [
    vertical && `M${vertical.line * 300} 0v300`,
    horizontal && `M0 ${horizontal.line * 300}h300`,
  ]
    .filter(Boolean)
    .join(' ');
});
let disposed = false;

onMounted(async () => {
  try {
    const source = await createImageBitmap(
      new Blob([props.photo.bytes], { type: props.photo.mimeType }),
    );
    try {
      const factor = Math.min(
        1,
        maxEditedEdge / Math.max(source.width, source.height),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(source.width * factor);
      canvas.height = Math.round(source.height * factor);
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (!disposed) original.value = canvas;
    } finally {
      source.close();
    }
  } catch {
    if (!disposed) error.value = 'outputPanel.portrait.invalidImage';
  }
});

onBeforeUnmount(() => {
  disposed = true;
});

watchEffect(() => {
  const photo = useCutout.value ? cutout.value : original.value;
  if (!preview.value || !photo) return;
  drawPortraitCrop(preview.value, photo, frame.value);
});

function startPointer(event) {
  if (lassoActive.value) startLasso(event);
  else startPan(event);
}

function movePointer(event) {
  movePan(event);
  moveLasso(event);
}

function endPointer(event) {
  endPan(event);
  finishLasso(event);
}

function cancelPointer(event) {
  endPan(event);
  cancelLassoPointer(event);
}

function handleKeydown(event) {
  if (!lassoActive.value) panWithKey(event);
}

async function removeBackground() {
  if (!original.value || saving.value || segmenting.value) return;
  segmenting.value = true;
  error.value = '';
  try {
    const result = await window.Utawakui.segmentOutputPortrait(
      props.photo.id,
      portraitMaskInput(original.value),
    );
    if (disposed) return;
    if (result?.status === 'ok') {
      fitCutout(result.alpha);
      cutoutMask.value = result.alpha;
      useCutout.value = true;
    } else {
      error.value =
        {
          'no-subject': 'outputPanel.portrait.noSubject',
          'model-unavailable': 'outputPanel.portrait.cutoutModelUnavailable',
          busy: 'outputPanel.portrait.cutoutBusy',
        }[result?.status] ?? 'outputPanel.portrait.cutoutFailed';
    }
  } catch {
    if (!disposed) error.value = 'outputPanel.portrait.cutoutFailed';
  } finally {
    segmenting.value = false;
  }
}

async function apply() {
  if (
    !preview.value ||
    !original.value ||
    saving.value ||
    segmenting.value ||
    lassoSelection.value
  )
    return;
  saving.value = true;
  error.value = '';
  try {
    let png = null;
    const { left, top, width, height } = frame.value;
    if (
      useCutout.value ||
      left !== 0 ||
      top !== 0 ||
      width !== original.value.width ||
      height !== original.value.height
    ) {
      const photo = useCutout.value ? cutout.value : original.value;
      drawPortraitCrop(preview.value, photo, frame.value);
      const blob = await new Promise((resolve) =>
        preview.value.toBlob(resolve, 'image/png'),
      );
      if (!blob) throw new Error('portrait encoding unavailable');
      png = new Uint8Array(await blob.arrayBuffer());
    }
    if (disposed) return;
    const result = await window.Utawakui.saveOutputPortrait(
      props.photo.id,
      png,
    );
    if (disposed) return;
    if (result?.status !== 'ok') throw new Error('portrait save failed');
    emit('apply', result.id);
  } catch {
    if (!disposed) error.value = 'outputPanel.portrait.importFailed';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UiModal
    open
    size="wide"
    max-block-size="medium"
    :title="t('outputPanel.portrait.editPhoto')"
    :close-disabled="saving"
    @close="emit('close')"
  >
    <div class="obs-portrait-image-editor">
      <UiStack
        class="obs-portrait-image-editor__photo"
        direction="column"
        :gap="2"
      >
        <div class="obs-portrait-image-editor__preview">
          <canvas
            ref="preview"
            :hidden="!original"
            :class="{
              'obs-portrait-image-editor__lasso-target': lassoActive,
              'obs-portrait-image-editor__pan-target': original && !lassoActive,
              'obs-portrait-image-editor__panning': panning,
            }"
            :tabindex="original ? 0 : undefined"
            role="img"
            :aria-label="t('outputPanel.portrait.photoPreview')"
            :aria-describedby="
              original
                ? `${prefix}-${lassoActive ? 'lasso-hint' : 'framing-hint'}`
                : undefined
            "
            @pointerdown="startPointer"
            @pointermove="movePointer"
            @pointerup="endPointer"
            @pointercancel="cancelPointer"
            @lostpointercapture="cancelPointer"
            @wheel="wheelFrame"
            @keydown="handleKeydown"
            @keydown.esc="cancelLassoFromKeyboard"
          />
          <svg
            v-if="original && guidesEnabled && !lassoActive"
            class="obs-portrait-image-editor__guides"
            viewBox="0 0 300 300"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              class="obs-portrait-image-editor__guide-shadow"
              d="M100 0v300 M200 0v300 M0 100h300 M0 200h300"
              vector-effect="non-scaling-stroke"
            />
            <path
              class="obs-portrait-image-editor__guide-grid"
              d="M100 0v300 M200 0v300 M0 100h300 M0 200h300"
              vector-effect="non-scaling-stroke"
            />
            <template v-if="activeGuidePath">
              <path
                :d="activeGuidePath"
                class="obs-portrait-image-editor__guide-outline"
                vector-effect="non-scaling-stroke"
              />
              <path
                :d="activeGuidePath"
                class="obs-portrait-image-editor__guide-active"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </svg>
          <svg
            v-if="lassoSelection"
            class="obs-portrait-image-editor__lasso-outline"
            :style="lassoSelection.style"
            :viewBox="`0 0 ${lassoPreviewSize} ${lassoPreviewSize}`"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon
              :points="lassoSelection.points"
              vector-effect="non-scaling-stroke"
            />
            <polygon
              :points="lassoSelection.points"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
        <UiStack align="center" justify="end" :gap="2">
          <UiHint
            v-if="original && !lassoActive"
            :id="`${prefix}-framing-hint`"
            class="ui-visually-hidden"
            >{{ t('outputPanel.portrait.framing.hint') }}</UiHint
          >
          <UiStack
            align="center"
            :gap="1"
            role="group"
            :aria-label="t('outputPanel.portrait.framing.label')"
          >
            <UiIconButton
              v-if="original"
              :icon="Grid3X3"
              :label="t('outputPanel.portrait.framing.guides')"
              :tooltip-detail="t('outputPanel.portrait.framing.guidesHint')"
              :active="guidesEnabled"
              :aria-pressed="guidesEnabled"
              :disabled="saving || panning || Boolean(lassoSelection)"
              @click="guidesEnabled = !guidesEnabled"
            />
            <UiIconButton
              :icon="ZoomOut"
              :label="t('outputPanel.portrait.framing.zoomOut')"
              :disabled="
                !original ||
                zoom <= minZoom ||
                saving ||
                panning ||
                Boolean(lassoSelection)
              "
              @click="changeZoom(-1)"
            />
            <UiIconButton
              :icon="ZoomIn"
              :label="t('outputPanel.portrait.framing.zoomIn')"
              :disabled="
                !original ||
                zoom >= maxZoom ||
                saving ||
                panning ||
                Boolean(lassoSelection)
              "
              @click="changeZoom(1)"
            />
            <UiIconButton
              :icon="RotateCcw"
              :label="t('outputPanel.portrait.framing.reset')"
              :disabled="
                !adjustedFrame || saving || panning || Boolean(lassoSelection)
              "
              @click="resetFrame"
            />
          </UiStack>
        </UiStack>
      </UiStack>
      <UiStack
        class="obs-portrait-image-editor__tools"
        direction="column"
        :gap="3"
      >
        <UiStack v-if="!cutoutMask" align="start" direction="column" :gap="2">
          <UiButton
            variant="secondary"
            :disabled="!original || saving"
            :loading="segmenting"
            :loading-label="t('outputPanel.portrait.separatingSubject')"
            @click="removeBackground"
          >
            {{ t('outputPanel.portrait.removeBackground') }}
          </UiButton>
          <UiHint v-if="segmenting" class="ui-visually-hidden" role="status">{{
            t('outputPanel.portrait.separatingSubject')
          }}</UiHint>
        </UiStack>
        <UiSwitch
          v-else
          :id="`${prefix}-cutout`"
          v-model="useCutout"
          :label="t('outputPanel.portrait.useCutout')"
          :disabled="saving"
        />
        <template v-if="useCutout">
          <UiSeparator />
          <UiStack direction="column" :gap="2">
            <UiRange
              :id="`${prefix}-cutout-range`"
              v-model="cutoutRange"
              :label="t('outputPanel.portrait.cutoutRange')"
              :hint="t('outputPanel.portrait.cutoutRangeHint')"
              :min="-100"
              :max="100"
              :step="5"
              :default-value="0"
              :reference-mark="0"
              :value-text="formatCutoutPercent(cutoutRange)"
              :format-value="formatCutoutPercent"
              :disabled="saving"
              value-in-label
            />
            <UiRange
              :id="`${prefix}-edge-sharpness`"
              v-model="edgeSharpness"
              :label="t('outputPanel.portrait.edgeSharpness')"
              :step="5"
              :default-value="0"
              :value-text="formatPercent(edgeSharpness)"
              :format-value="formatPercent"
              :disabled="saving"
              value-in-label
            />
          </UiStack>
          <UiDisclosure
            v-model:open="retouchOpen"
            :label="t('outputPanel.portrait.retouch')"
          >
            <UiStack direction="column" :gap="2">
              <UiStack
                align="center"
                :gap="1"
                role="group"
                :aria-label="t('outputPanel.portrait.retouch')"
              >
                <UiIconButton
                  v-for="tool in lassoTools"
                  :key="tool.id"
                  :icon="tool.icon"
                  :label="tool.label"
                  :active="lassoMode === tool.id"
                  :aria-pressed="lassoMode === tool.id"
                  :disabled="!retouchEnabled"
                  @click="selectLassoMode(tool.id)"
                />
                <UiIconButton
                  :icon="Undo2"
                  :label="t('outputPanel.portrait.lasso.undo')"
                  :disabled="
                    !retouchEnabled ||
                    !lassoHistory.length ||
                    Boolean(lassoSelection)
                  "
                  @click="undoLasso"
                />
              </UiStack>
              <UiHint v-if="lassoActive" :id="`${prefix}-lasso-hint`">{{
                t(
                  lassoMode === 'erase'
                    ? 'outputPanel.portrait.lasso.eraseHint'
                    : 'outputPanel.portrait.lasso.restoreHint',
                )
              }}</UiHint>
            </UiStack>
          </UiDisclosure>
        </template>
        <UiHint v-if="error" tone="danger" role="alert">{{ t(error) }}</UiHint>
      </UiStack>
    </div>
    <template #footer>
      <UiButton :disabled="saving" @click="emit('close')">
        {{ t('common.cancel') }}
      </UiButton>
      <UiButton
        variant="accent"
        :disabled="!original || saving || segmenting || Boolean(lassoSelection)"
        @click="apply"
      >
        {{ t('outputPanel.portrait.applyPhoto') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.obs-portrait-image-editor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--ui-modal-section-gap);
  align-items: start;
}

.obs-portrait-image-editor__preview {
  position: relative;
  aspect-ratio: 1;
  min-inline-size: 0;
  overflow: hidden;
  background: var(--ui-photo-frame-background);
  border: var(--ui-border-width) solid var(--ui-photo-frame-border-color);
  border-radius: var(--ui-radius-md);
}

.obs-portrait-image-editor__photo {
  inline-size: min(100%, 54dvh);
  min-inline-size: 0;
  justify-self: center;
}

.obs-portrait-image-editor__tools {
  min-inline-size: 0;
}

.obs-portrait-image-editor__pan-target {
  cursor: grab;
  touch-action: none;
}

.obs-portrait-image-editor__panning {
  cursor: grabbing;
}

.obs-portrait-image-editor__preview canvas {
  position: absolute;
  inset: 0;
  margin: auto;
  inline-size: 100%;
  block-size: 100%;
  background: repeating-conic-gradient(
      var(--ui-output-preview-backdrop-checker-a) 0% 25%,
      var(--ui-output-preview-backdrop-checker-b) 0% 50%
    )
    0 0 / var(--ui-output-preview-checker-tile)
    var(--ui-output-preview-checker-tile);
}

.obs-portrait-image-editor__guides {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
}

.obs-portrait-image-editor__guide-shadow,
.obs-portrait-image-editor__guide-outline {
  stroke: var(--ui-output-preview-backdrop-dark);
}

.obs-portrait-image-editor__guide-shadow {
  stroke-width: calc(var(--ui-border-width) * 2);
  opacity: 0.42;
}

.obs-portrait-image-editor__guide-outline {
  stroke-width: calc(var(--ui-border-width) * 4);
}

.obs-portrait-image-editor__guide-grid {
  stroke: var(--ui-output-preview-backdrop-light);
  stroke-width: var(--ui-border-width);
  opacity: 0.6;
}

.obs-portrait-image-editor__guide-active {
  stroke: var(--ui-output-preview-accent);
  stroke-width: calc(var(--ui-border-width) * 2);
}

.obs-portrait-image-editor__lasso-target {
  cursor: crosshair;
  touch-action: none;
}

.obs-portrait-image-editor__lasso-outline {
  position: absolute;
  pointer-events: none;
}

.obs-portrait-image-editor__lasso-outline polygon:first-child {
  fill: color-mix(in srgb, var(--ui-color-accent) 18%, transparent);
  fill-rule: evenodd;
  stroke: var(--ui-output-preview-backdrop-dark);
  stroke-width: calc(var(--ui-border-width) * 2);
}

.obs-portrait-image-editor__lasso-outline polygon:last-child {
  fill: none;
  stroke: var(--ui-output-preview-backdrop-light);
  stroke-dasharray: var(--ui-space-1);
  stroke-width: var(--ui-border-width);
}
</style>

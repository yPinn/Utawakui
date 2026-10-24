<script setup>
import ObsElementSelectionLayer from './ObsElementSelectionLayer.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import UiButton from '../ui/UiButton.vue';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import {
  calculateWidgetPreviewScale,
  OUTPUT_WIDGET_CAPTURE_SIZES,
} from '../../constants/outputCaptureSizes.js';
import { useOutputElementBoxes } from '../../composables/output/useOutputElementBoxes.js';

const props = defineProps({
  metadataTarget: { type: Object, default: null },
  inspectionUrl: { type: String, default: null },
  selectedSize: { type: String, required: true },
  supportedSizes: {
    type: Array,
    default: () => OUTPUT_WIDGET_CAPTURE_SIZES.map((size) => size.id),
  },
  preset: { type: Object, default: null },
  backdrop: { type: String, default: 'checker' },
  templateId: { type: String, default: null },
  elementIds: { type: Array, default: () => [] },
  selectedElementId: { type: String, default: 'template' },
});

const emit = defineEmits(['selectSize', 'selectElement']);
const previewGrid = useTemplateRef('previewGrid');
const previewOptions = useTemplateRef('previewOptions');
const previewCaptions = useTemplateRef('previewCaptions');
const previewFrames = useTemplateRef('previewFrames');
const previewScale = shallowRef(0.25);
let resizeObserver = null;

const previewOrigin = computed(() => {
  try {
    return props.inspectionUrl ? new URL(props.inspectionUrl).origin : null;
  } catch {
    return null;
  }
});
const { boxesBySize } = useOutputElementBoxes({
  frameWindows: () =>
    new Map(
      [previewFrames.value ?? []]
        .flat()
        .map((frame) => [frame.dataset.sizeId, frame.contentWindow]),
    ),
  expectedOrigin: () => previewOrigin.value,
  templateId: () => props.templateId,
  allowedIds: () => props.elementIds,
});

function selectionLayerFor(option) {
  const boxes = boxesBySize.value[option.id];
  if (!props.elementIds.length || option.id !== props.selectedSize || !boxes) {
    return null;
  }
  return {
    boxes,
    scale: (previewScale.value * option.width) / boxes.viewport.width,
  };
}

const supportedCaptureSizes = computed(() => {
  const allowlist = new Set(
    props.supportedSizes.filter((id) => typeof id === 'string'),
  );
  const sizes = OUTPUT_WIDGET_CAPTURE_SIZES.filter((size) =>
    allowlist.has(size.id),
  );
  return sizes.length ? sizes : [OUTPUT_WIDGET_CAPTURE_SIZES[0]];
});

const captureOptions = computed(() =>
  supportedCaptureSizes.value.map((size) => ({
    ...size,
    frameStyle: {
      width: `${size.width * previewScale.value}px`,
      height: `${size.height * previewScale.value}px`,
    },
    canvasStyle: {
      width: `${size.width}px`,
      height: `${size.height}px`,
      transform: `scale(${previewScale.value})`,
    },
  })),
);
const previewGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${supportedCaptureSizes.value.length}, minmax(0, 1fr))`,
}));

const canvasAreaStyle = computed(() => ({
  height: `${Math.max(...supportedCaptureSizes.value.map((size) => size.height)) * previewScale.value}px`,
}));

function measurePreview() {
  const availableWidth = previewGrid.value?.clientWidth ?? 0;
  const availableHeight = previewGrid.value?.clientHeight ?? 0;
  if (availableWidth <= 0 || availableHeight <= 0) return;
  const styles = getComputedStyle(previewGrid.value);
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const optionElements = Array.isArray(previewOptions.value)
    ? previewOptions.value
    : previewOptions.value
      ? [previewOptions.value]
      : [];
  const captionElements = Array.isArray(previewCaptions.value)
    ? previewCaptions.value
    : previewCaptions.value
      ? [previewCaptions.value]
      : [];
  const optionStyles = optionElements[0]
    ? getComputedStyle(optionElements[0])
    : null;
  const rowGap = props.metadataTarget
    ? 0
    : Number.parseFloat(optionStyles?.rowGap) || 0;
  const captionHeight = props.metadataTarget
    ? 0
    : Math.max(
        0,
        ...captionElements.map(
          (caption) => caption.getBoundingClientRect().height,
        ),
      );
  previewScale.value = calculateWidgetPreviewScale({
    availableWidth,
    availableHeight,
    captureSizes: supportedCaptureSizes.value,
    columnGap,
    captionHeight,
    rowGap,
  });
}

watch(
  () => [props.supportedSizes, props.metadataTarget],
  async () => {
    await nextTick();
    measurePreview();
  },
  { deep: true },
);

onMounted(() => {
  measurePreview();
  if (typeof ResizeObserver === 'function' && previewGrid.value) {
    resizeObserver = new ResizeObserver(measurePreview);
    resizeObserver.observe(previewGrid.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div
    ref="previewGrid"
    class="obs-widget-capture-preview"
    :class="{ 'obs-widget-capture-preview--external-info': metadataTarget }"
    :style="previewGridStyle"
    aria-label="Widget 擷取尺寸"
  >
    <button
      v-for="option in captureOptions"
      ref="previewOptions"
      :key="option.id"
      type="button"
      class="obs-widget-capture-preview__option"
      :class="{
        'obs-widget-capture-preview__option--selected':
          selectedSize === option.id,
      }"
      :aria-label="`${option.label}型，${option.width} × ${option.height}`"
      :aria-pressed="selectedSize === option.id"
      @click="emit('selectSize', option.id)"
    >
      <Teleport :to="metadataTarget || 'body'" :disabled="!metadataTarget">
        <component
          :is="metadataTarget && captureOptions.length > 1 ? UiButton : 'span'"
          ref="previewCaptions"
          class="obs-widget-capture-preview__caption"
          :active="
            metadataTarget && captureOptions.length > 1
              ? selectedSize === option.id
              : undefined
          "
          :aria-pressed="
            metadataTarget && captureOptions.length > 1
              ? selectedSize === option.id
              : undefined
          "
          @click="
            metadataTarget &&
            captureOptions.length > 1 &&
            emit('selectSize', option.id)
          "
        >
          <ObsPreviewCaption
            :label="option.label"
            :width="option.width"
            :height="option.height"
            :selected="selectedSize === option.id"
          />
        </component>
      </Teleport>
      <span
        class="obs-widget-capture-preview__canvas-area"
        :style="canvasAreaStyle"
      >
        <span
          class="obs-widget-capture-preview__frame"
          :data-backdrop="backdrop"
          :style="option.frameStyle"
        >
          <iframe
            v-if="inspectionUrl"
            ref="previewFrames"
            class="obs-widget-capture-preview__iframe"
            :data-size-id="option.id"
            :src="inspectionUrl"
            :style="option.canvasStyle"
            :width="option.width"
            :height="option.height"
            :title="`${option.label}型 Browser Source 即時預覽`"
            tabindex="-1"
            aria-hidden="true"
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="no-referrer"
          />
          <ObsElementSelectionLayer
            v-if="inspectionUrl && selectionLayerFor(option)"
            :boxes="selectionLayerFor(option).boxes"
            :scale="selectionLayerFor(option).scale"
            :selected-id="selectedElementId"
            @select="emit('selectElement', $event)"
          />
          <span
            v-if="!inspectionUrl"
            class="obs-widget-capture-preview__fallback"
          >
            {{ preset?.preview?.title ?? 'Preview' }}
          </span>
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.obs-widget-capture-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  align-items: stretch;
  gap: var(--ui-space-3);
}

.obs-widget-capture-preview__option {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-items: end;
  justify-items: center;
  gap: var(--ui-space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  cursor: pointer;
}

.obs-widget-capture-preview__option:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-widget-capture-preview--external-info .obs-widget-capture-preview__option {
  grid-template-rows: minmax(0, 1fr);
  row-gap: 0;
}

.obs-widget-capture-preview__frame {
  position: relative;
  min-width: 0;
  overflow: hidden;
  display: block;
  align-self: end;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: conic-gradient(
      var(--ui-output-preview-canvas) 25%,
      var(--ui-output-preview-backdrop-dark) 0 50%,
      var(--ui-output-preview-canvas) 0 75%,
      var(--ui-output-preview-backdrop-dark) 0
    )
    0 0 / var(--ui-output-preview-checker-tile)
    var(--ui-output-preview-checker-tile);
  transition:
    border-color var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    box-shadow var(--ui-motion-duration-fast) var(--ui-motion-easing-standard);
}

.obs-widget-capture-preview__frame[data-backdrop='dark'] {
  background: var(--ui-color-canvas);
}

.obs-widget-capture-preview__frame[data-backdrop='light'] {
  background: var(--ui-color-overlay-contrast);
}

.obs-widget-capture-preview__option:hover .obs-widget-capture-preview__frame {
  border-color: var(--ui-color-border-strong);
}

.obs-widget-capture-preview__option--selected
  .obs-widget-capture-preview__frame {
  border-color: var(--ui-color-accent);
  box-shadow: 0 0 0 var(--ui-focus-width) var(--ui-color-accent-soft);
}

.obs-widget-capture-preview__iframe {
  /* Match the Overlay document, preserving transparency in dark app chrome. */
  color-scheme: normal;
  position: absolute;
  inset: 0;
  display: block;
  border: 0;
  background: transparent;
  pointer-events: none;
  transform-origin: left top;
}

.obs-widget-capture-preview__fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--ui-space-2);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  text-align: center;
}

.obs-widget-capture-preview__caption {
  min-width: 0;
  justify-self: stretch;
}

.obs-widget-capture-preview__canvas-area {
  width: 100%;
  min-width: 0;
  display: grid;
  place-items: end center;
  align-self: center;
}

@media (prefers-reduced-motion: reduce) {
  .obs-widget-capture-preview__frame {
    transition: none;
  }
}
</style>

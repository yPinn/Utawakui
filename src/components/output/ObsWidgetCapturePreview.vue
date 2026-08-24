<script setup>
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

const props = defineProps({
  inspectionUrl: { type: String, default: null },
  selectedSize: { type: String, required: true },
  supportedSizes: {
    type: Array,
    default: () => OUTPUT_WIDGET_CAPTURE_SIZES.map((size) => size.id),
  },
  preset: { type: Object, default: null },
  backdrop: { type: String, default: 'checker' },
});

const emit = defineEmits(['selectSize']);
const previewGrid = useTemplateRef('previewGrid');
const previewOptions = useTemplateRef('previewOptions');
const previewCaptions = useTemplateRef('previewCaptions');
const previewScale = shallowRef(0.25);
let resizeObserver = null;

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
  const rowGap = Number.parseFloat(optionStyles?.rowGap) || 0;
  const captionHeight = Math.max(
    0,
    ...captionElements.map((caption) => caption.getBoundingClientRect().height),
  );
  previewScale.value = calculateWidgetPreviewScale({
    availableWidth,
    availableHeight,
    optionCount: supportedCaptureSizes.value.length,
    columnGap,
    captionHeight,
    rowGap,
  });
}

watch(
  () => props.supportedSizes,
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
      <span
        class="obs-widget-capture-preview__frame"
        :data-backdrop="backdrop"
        :style="option.frameStyle"
      >
        <iframe
          v-if="inspectionUrl"
          class="obs-widget-capture-preview__iframe"
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
        <span v-else class="obs-widget-capture-preview__fallback">
          {{ preset?.preview?.title ?? 'Preview' }}
        </span>
      </span>
      <span ref="previewCaptions" class="obs-widget-capture-preview__caption">
        <strong>{{ option.label }}</strong>
        <span>{{ option.width }} × {{ option.height }}</span>
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
  align-items: end;
  gap: var(--ui-space-3);
}

.obs-widget-capture-preview__option {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
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

.obs-widget-capture-preview__frame {
  position: relative;
  min-width: 0;
  overflow: hidden;
  display: block;
  align-self: end;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: conic-gradient(
      var(--ui-color-surface) 25%,
      var(--ui-color-surface-raised) 0 50%,
      var(--ui-color-surface) 0 75%,
      var(--ui-color-surface-raised) 0
    )
    0 0 / var(--ui-space-6) var(--ui-space-6);
  transition:
    border-color var(--ui-motion-fast) var(--ui-motion-ease),
    box-shadow var(--ui-motion-fast) var(--ui-motion-ease);
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
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  text-align: center;
}

.obs-widget-capture-preview__caption {
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-1);
  color: inherit;
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  font-variant-numeric: tabular-nums;
}

.obs-widget-capture-preview__caption strong {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
}

.obs-widget-capture-preview__option--selected
  .obs-widget-capture-preview__caption,
.obs-widget-capture-preview__option--selected
  .obs-widget-capture-preview__caption
  strong {
  color: var(--ui-color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .obs-widget-capture-preview__frame {
    transition: none;
  }
}
</style>

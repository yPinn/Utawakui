<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { useResizeDrag } from '../../composables/useResizeDrag.js';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiButton from '../ui/UiButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';

const props = defineProps({
  sideWidth: { type: Number, default: null },
  sideCollapsed: { type: Boolean, default: false },
  compactSideOpen: { type: Boolean, default: false },
  ariaLabel: { type: String, required: true },
  mainVariant: {
    type: String,
    default: 'fluid',
    validator: (value) => ['fluid', 'gallery'].includes(value),
  },
  sideLabel: { type: String, required: true },
  sideVariant: {
    type: String,
    default: 'inspector',
    validator: (value) => ['detail', 'inspector'].includes(value),
  },
  sideVisible: { type: Boolean, default: true },
});
const emit = defineEmits([
  'update:sideWidth',
  'update:sideCollapsed',
  'update:compactSideOpen',
]);
const root = useTemplateRef('root');
const toggleHost = useTemplateRef('toggleHost');
const mainPane = useTemplateRef('mainPane');
const sidePane = useTemplateRef('sidePane');
const sideId = `output-side-${useId()}`;
const geometry = shallowRef(null);
let observer;
let dragTarget;
let dragWidth;
let dragPreference;
const compact = computed(
  () =>
    geometry.value &&
    geometry.value.width <
      geometry.value.min + geometry.value.gap + geometry.value.main,
);
const sideOpen = computed(
  () =>
    props.sideVisible &&
    (compact.value ? props.compactSideOpen : !props.sideCollapsed),
);
const maximum = computed(() =>
  geometry.value
    ? Math.max(
        geometry.value.min,
        Math.min(
          geometry.value.max,
          geometry.value.width - geometry.value.gap - geometry.value.main,
        ),
      )
    : 0,
);
const effectiveWidth = computed(() =>
  geometry.value
    ? Math.max(
        geometry.value.min,
        Math.min(maximum.value, props.sideWidth ?? geometry.value.default),
      )
    : null,
);
function measure() {
  const node = root.value;
  if (!node?.clientWidth) return;
  const style = getComputedStyle(node);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const length = (name) => {
    const value = style.getPropertyValue(name).trim();
    return parseFloat(value) * (value.endsWith('rem') ? rem : 1);
  };
  const values = {
    width: node.clientWidth,
    min: length('--ui-output-side-width-min'),
    default: length('--ui-output-side-width-default'),
    max: length('--ui-output-side-width-max'),
    main: length('--ui-output-main-width-min'),
    gap: length('--ui-output-split-gap'),
  };
  if (Object.values(values).every(Number.isFinite)) geometry.value = values;
}
const { isResizing, startResize } = useResizeDrag({
  invert: true,
  onMove: (delta) =>
    emit(
      'update:sideWidth',
      Math.max(geometry.value.min, Math.min(maximum.value, dragWidth + delta)),
    ),
  onCancel: () => emit('update:sideWidth', dragPreference),
});
function resize(event) {
  if (event.button !== 0 || !geometry.value) return;
  dragTarget = event.currentTarget;
  dragWidth = effectiveWidth.value;
  dragPreference = props.sideWidth;
  startResize(event);
}
async function toggleSide() {
  if (compact.value) emit('update:compactSideOpen', !props.compactSideOpen);
  else emit('update:sideCollapsed', !props.sideCollapsed);
  await nextTick();
  toggleHost.value?.querySelector('[data-output-side-toggle]')?.focus();
}
function keyResize(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void toggleSide();
    return;
  }
  if (!geometry.value) return;
  const widths = {
    ArrowLeft: effectiveWidth.value + 8,
    ArrowRight: effectiveWidth.value - 8,
    Home: geometry.value.min,
    End: maximum.value,
  };
  if (!(event.key in widths)) return;
  event.preventDefault();
  emit(
    'update:sideWidth',
    Math.max(geometry.value.min, Math.min(maximum.value, widths[event.key])),
  );
}
watch([compact, sideOpen], async ([isCompact, open]) => {
  const focused = document.activeElement;
  if (
    (!open && sidePane.value?.contains(focused)) ||
    (isCompact && open && mainPane.value?.contains(focused))
  ) {
    await nextTick();
    toggleHost.value?.querySelector('[data-output-side-toggle]')?.focus();
  }
});
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(root.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  dragTarget?.dispatchEvent?.(new Event('pointercancel'));
});
</script>

<template>
  <section
    ref="root"
    class="obs-output-split-layout"
    :data-resizing="isResizing"
    :class="[
      `obs-output-split-layout--main-${mainVariant}`,
      `obs-output-split-layout--side-${sideVariant}`,
      {
        'obs-output-split-layout--no-side': !sideOpen,
        'obs-output-split-layout--compact': compact,
      },
    ]"
    :style="
      sideWidth === null
        ? undefined
        : { '--ui-output-side-width': `${sideWidth}px` }
    "
    :aria-label="ariaLabel"
  >
    <div ref="toggleHost" class="obs-output-split-layout__toolbar">
      <slot name="tools" />
      <UiButton
        v-if="sideVisible"
        data-output-side-toggle
        :aria-controls="sideId"
        :aria-expanded="sideOpen"
        @click="toggleSide"
      >
        {{ sideOpen ? (compact ? '返回主區' : '收合副區') : '展開副區' }}
      </UiButton>
    </div>
    <div
      v-show="!compact || !sideOpen"
      ref="mainPane"
      class="obs-output-split-layout__main"
    >
      <slot name="main" />
    </div>

    <div
      v-if="sideOpen && !compact && geometry"
      class="obs-output-split-layout__separator"
      role="separator"
      tabindex="0"
      aria-label="調整副區寬度"
      aria-orientation="vertical"
      :aria-controls="sideId"
      :aria-valuemin="geometry?.min"
      :aria-valuemax="maximum"
      :aria-valuenow="effectiveWidth"
      @pointerdown="resize"
      @keydown="keyResize"
      @dblclick="toggleSide"
    >
      <UiSeparator orientation="vertical" />
    </div>
    <aside
      v-if="sideVisible"
      v-show="sideOpen"
      :id="sideId"
      ref="sidePane"
      class="obs-output-split-layout__side"
      :aria-label="sideLabel"
    >
      <div class="obs-output-split-layout__side-header">
        <slot name="side-header" />
      </div>
      <UiScrollLayout
        class="obs-output-split-layout__side-scroll"
        axis="vertical"
        viewport-class="obs-output-split-layout__side-viewport"
        content-class="obs-output-split-layout__side-content"
        tabindex="0"
        :aria-label="sideLabel"
      >
        <slot name="side" />
      </UiScrollLayout>
      <div class="obs-output-split-layout__side-footer">
        <slot name="side-footer" />
      </div>
    </aside>
  </section>
</template>

<style scoped>
.obs-output-split-layout {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    var(--ui-output-split-gap)
    clamp(
      var(--ui-output-side-width-min),
      var(--ui-output-side-width, var(--ui-output-side-width-default)),
      min(
        var(--ui-output-side-width-max),
        calc(
          100cqw - var(--ui-output-split-gap) - var(--ui-output-main-width-min)
        )
      )
    );
  grid-template-rows: var(--ui-output-toolbar-height) minmax(0, 1fr);
}

.obs-output-split-layout--no-side {
  grid-template-columns: minmax(0, 1fr);
}

.obs-output-split-layout__main,
.obs-output-split-layout__side {
  min-height: 0;
  min-width: 0;
}

.obs-output-split-layout__main {
  display: grid;
  grid-row: 2;
  grid-column: 1;
}

.obs-output-split-layout__toolbar {
  grid-row: 1;
  grid-column: 1 / -1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
}

.obs-output-split-layout__separator {
  grid-row: 2;
  grid-column: 2;
  display: grid;
  justify-items: center;
  cursor: col-resize;
  touch-action: none;
}

.obs-output-split-layout__separator:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.obs-output-split-layout__side {
  grid-row: 2;
  grid-column: 3;
  --ui-output-side-visual-inset-start: var(--ui-space-4);
  --ui-output-side-visual-inset-end: var(--ui-space-3);
  --ui-output-side-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  --ui-output-side-content-inset-start: max(
    var(--ui-output-side-visual-inset-start),
    var(--ui-output-side-focus-safe-inset)
  );
  --ui-output-side-content-inset-end: calc(
    max(
        var(--ui-output-side-visual-inset-end),
        var(--ui-scrollbar-visual-reserve)
      ) +
      var(--ui-output-side-focus-safe-inset)
  );

  display: grid;
  grid-template-rows:
    calc(var(--ui-control-height) + var(--ui-space-5)) minmax(0, 1fr)
    calc(var(--ui-control-height) + var(--ui-space-3));
  padding-inline: 0;
}

.obs-output-split-layout__side-header,
.obs-output-split-layout__side-footer {
  min-inline-size: 0;
  padding-inline: var(--ui-output-side-content-inset-start)
    var(--ui-output-side-content-inset-end);
}

.obs-output-split-layout__side-header {
  overflow: hidden;
}

.obs-output-split-layout__side-scroll {
  --ui-scroll-layout-padding-inline-start: var(
    --ui-output-side-content-inset-start
  );
  /* UiScrollLayout adds its axis-aware reserve once; retain only our inset. */
  --ui-scroll-layout-padding-inline-end: calc(
    var(--ui-output-side-content-inset-end) -
      var(--ui-scroll-layout-reserve-inline-end)
  );
  --ui-scroll-layout-padding-block-end: var(--ui-output-side-focus-safe-inset);
  min-height: 0;
}

.obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-viewport) {
  scroll-padding: var(--ui-output-side-focus-safe-inset)
    var(--ui-output-side-content-inset-end)
    var(--ui-output-side-focus-safe-inset)
    var(--ui-output-side-content-inset-start);
}

.obs-output-split-layout--side-detail
  .obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-content) {
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.obs-output-split-layout--side-inspector
  .obs-output-split-layout__side-scroll
  :deep(.obs-output-split-layout__side-content) {
  display: grid;
  align-content: start;
  gap: 0;
}

.obs-output-split-layout--compact {
  grid-template-columns: minmax(0, 1fr);
}

.obs-output-split-layout--compact .obs-output-split-layout__side {
  grid-column: 1;
}
</style>

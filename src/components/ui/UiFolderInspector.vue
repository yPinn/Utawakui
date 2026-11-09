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
import { ICON_SIZE } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import UiFolderTabShape from './UiFolderTabShape.vue';
import UiScrollLayout from './UiScrollLayout.vue';
import UiTabs from './UiTabs.vue';

const props = defineProps({
  items: { type: Array, required: true },
  ariaLabel: { type: String, required: true },
  sideLabel: { type: String, required: true },
  tabsLabel: { type: String, required: true },
  side: { type: String, default: 'right' },
  labelMode: { type: String, default: 'icon' },
  idPrefix: { type: String, default: '' },
});
const sideWidth = defineModel('sideWidth', { type: Number, default: null });
const sideCollapsed = defineModel('sideCollapsed', {
  type: Boolean,
  default: false,
});
const compactSideOpen = defineModel('compactSideOpen', {
  type: Boolean,
  default: false,
});
const workspace = useTemplateRef('workspace');
const rail = useTemplateRef('rail');
const inspector = useTemplateRef('inspector');
const resizeHandle = useTemplateRef('resizeHandle');
const scroll = useTemplateRef('scroll');
const uniqueId = useId();
const ids = props.idPrefix || `folder-inspector-${uniqueId}`;
const shapeId = `${ids}-shape`;
const shapeStyle = { '--_folder-tab-shape': `url("#${shapeId}")` };
const selectedId = shallowRef(null);
const activeItem = computed(
  () => props.items.find(({ id }) => id === selectedId.value) ?? props.items[0],
);
const tabs = computed(() =>
  props.items.map((item) => ({
    ...item,
    tooltipPlacement:
      props.labelMode === 'icon' && item.icon
        ? props.side === 'left'
          ? 'right'
          : 'left'
        : undefined,
  })),
);
const limits = shallowRef(null);
const dragWidth = shallowRef(null);
const heldClosedWidth = shallowRef(null);
const compact = computed(() => limits.value?.compact ?? false);
const open = computed(() =>
  compact.value ? compactSideOpen.value : !sideCollapsed.value,
);
const expandedWidth = computed(() => {
  const geometry = limits.value;
  if (!geometry) return null;
  return clamp(sideWidth.value ?? geometry.default, geometry.min, geometry.max);
});
const liveWidth = computed(() => {
  if (dragWidth.value === null || !open.value) return null;
  const { min, max } = limits.value;
  return clamp(dragWidth.value, min, max);
});
const effectiveWidth = computed(
  () => liveWidth.value ?? (open.value ? (expandedWidth.value ?? 0) : 0),
);
const pendingWidth = computed(() => {
  if (dragWidth.value === null) return null;
  const { min, max } = limits.value;
  return dragWidth.value < min / 2 ? 0 : clamp(dragWidth.value, min, max);
});
const resizeReady = computed(
  () => pendingWidth.value !== null && pendingWidth.value > 0 !== open.value,
);
const widthStyle = computed(() => ({
  '--_expanded-width':
    expandedWidth.value === null ? undefined : `${expandedWidth.value}px`,
  '--_live-width':
    liveWidth.value === null ? undefined : `${liveWidth.value}px`,
  '--_held-closed-width':
    heldClosedWidth.value === null ? undefined : `${heldClosedWidth.value}px`,
}));
let observer;
let dragStart;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function measure() {
  const node = workspace.value;
  if (!node?.clientWidth) return;
  const style = getComputedStyle(node);
  const rem = parseFloat(
    getComputedStyle(node.ownerDocument.documentElement).fontSize,
  );
  const length = (token) => {
    const value = style.getPropertyValue(token).trim();
    return parseFloat(value) * (value.endsWith('rem') ? rem : 1);
  };
  const available = Math.max(
    0,
    node.clientWidth - rail.value.getBoundingClientRect().width,
  );
  const previewMin = length('--_preview-min');
  const min = length('--_panel-min');
  const wasCompact = compact.value;
  const recovery = wasCompact
    ? length('--ui-shell-layout-recovery-inline-size')
    : 0;
  const isCompact = available < min + previewMin + recovery;
  if (isCompact && !wasCompact && limits.value) compactSideOpen.value = false;
  const max = Math.min(
    isCompact ? available : available - previewMin,
    length('--_panel-max'),
  );
  limits.value = {
    compact: isCompact,
    min: Math.min(max, min),
    max,
    default: length('--_panel-default'),
    step: length('--ui-space-2'),
  };
}

function setOpen(value) {
  if (compact.value) compactSideOpen.value = value;
  else sideCollapsed.value = !value;
}

const { isResizing, startResize } = useResizeDrag({
  onMove(delta) {
    if (!open.value)
      heldClosedWidth.value ??= inspector.value.getBoundingClientRect().width;
    dragWidth.value = dragStart + (props.side === 'left' ? delta : -delta);
  },
  onCommit() {
    const width = pendingWidth.value;
    if (width > 0 && open.value) sideWidth.value = width;
    setOpen(width > 0);
    dragWidth.value = null;
    heldClosedWidth.value = null;
  },
  onCancel() {
    dragWidth.value = null;
    heldClosedWidth.value = null;
  },
});

function resize(event) {
  if (event.button !== 0 || !limits.value) return;
  dragStart = inspector.value.getBoundingClientRect().width;
  resizeHandle.value?.focus({ preventScroll: true });
  startResize(event);
}

function resizeWithKeys(event) {
  const geometry = limits.value;
  if (!geometry) return;
  const { key } = event;
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    setOpen(!open.value);
    return;
  }
  const inward = props.side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  const outward = props.side === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (![inward, outward, 'Home', 'End'].includes(key)) return;
  event.preventDefault();
  if (
    key === 'Home' ||
    (key === outward && effectiveWidth.value <= geometry.min)
  ) {
    setOpen(false);
    return;
  }
  if (open.value) {
    const width =
      key === 'End'
        ? geometry.max
        : effectiveWidth.value +
          (key === inward ? geometry.step : -geometry.step);
    sideWidth.value = clamp(width, geometry.min, geometry.max);
  }
  setOpen(true);
}

function activate(id) {
  selectedId.value = id;
  setOpen(true);
}

function dismissCompact(event) {
  if (!compact.value || !open.value || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  setOpen(false);
  resizeHandle.value?.focus({ preventScroll: true });
}

watch(
  activeItem,
  () => {
    scroll.value?.scrollTo({ top: 0 });
  },
  { flush: 'post' },
);
watch(open, async (isOpen) => {
  // Keep the previous sheet width through the compact closing transition.
  if (isOpen) {
    sideWidth.value = null;
    return;
  }
  const focused = workspace.value?.ownerDocument.activeElement;
  if (inspector.value?.contains(focused)) {
    await nextTick();
    resizeHandle.value?.focus({ preventScroll: true });
  }
});
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(workspace.value);
  observer.observe(rail.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  resizeHandle.value?.dispatchEvent(new Event('pointercancel'));
});
</script>

<template>
  <section class="ui-folder-inspector" :aria-label="ariaLabel">
    <div v-if="$slots.tools" class="ui-folder-inspector__tools">
      <slot name="tools" />
    </div>
    <div
      ref="workspace"
      class="ui-folder-inspector__workspace"
      :data-side="side"
      :data-labels="labelMode"
      :data-open="open"
      :data-resizing="isResizing"
      :data-compact="compact"
      :style="widthStyle"
      @keydown.esc="dismissCompact"
    >
      <div class="ui-folder-inspector__main">
        <slot name="main" />
      </div>
      <button
        v-if="compact && open && !isResizing"
        class="ui-folder-inspector__preview-dismiss"
        type="button"
        :aria-label="t('ui.folderInspector.dismiss')"
        @click="dismissCompact"
      />
      <div class="ui-folder-inspector__drawer">
        <div ref="rail" class="ui-folder-inspector__rail">
          <UiFolderTabShape :shape-id="shapeId" />
          <UiTabs
            class="ui-folder-inspector__tabs"
            :style="shapeStyle"
            :items="tabs"
            :active-id="open ? activeItem?.id : ''"
            :inactive-focus-id="activeItem?.id"
            :aria-label="tabsLabel"
            :tab-id-prefix="ids"
            :panel-id-prefix="ids"
            variant="folder"
            @update:active-id="activate"
          >
            <template #label="{ item }">
              <component
                :is="item.icon"
                v-if="item.tooltipPlacement"
                :size="ICON_SIZE"
                aria-hidden="true"
              />
              <template v-else>{{ item.label }}</template>
            </template>
          </UiTabs>
          <div
            ref="resizeHandle"
            class="ui-folder-inspector__resize"
            :data-resize-ready="resizeReady"
            role="separator"
            tabindex="0"
            :aria-label="t('ui.folderInspector.resize')"
            aria-orientation="vertical"
            :aria-controls="`${ids}-inspector`"
            aria-valuemin="0"
            :aria-valuemax="Math.round(limits?.max ?? 0)"
            :aria-valuenow="Math.round(effectiveWidth)"
            :aria-valuetext="
              effectiveWidth
                ? t('ui.folderInspector.width', {
                    width: Math.round(effectiveWidth),
                  })
                : t('ui.folderInspector.collapsed')
            "
            @pointerdown="resize"
            @keydown="resizeWithKeys"
            @dblclick="setOpen(!open)"
          />
        </div>
        <aside
          :id="`${ids}-inspector`"
          ref="inspector"
          class="ui-folder-inspector__inspector"
          :aria-label="sideLabel"
          :inert="!open"
        >
          <div class="ui-folder-inspector__inspector-sheet">
            <header
              v-if="$slots['side-header']"
              class="ui-folder-inspector__header"
            >
              <slot name="side-header" :item="activeItem" />
            </header>
            <UiScrollLayout
              ref="scroll"
              class="ui-folder-inspector__scroll"
              axis="vertical"
              tabindex="0"
              :aria-label="sideLabel"
            >
              <slot name="side-top" />
              <section
                v-for="item in items"
                v-show="activeItem?.id === item.id"
                :id="`${ids}-${item.id}-panel`"
                :key="item.id"
                role="tabpanel"
                :aria-labelledby="`${ids}-${item.id}-tab`"
              >
                <slot name="side" :item="item" />
              </section>
            </UiScrollLayout>
            <footer
              v-if="$slots['side-footer']"
              class="ui-folder-inspector__footer"
            >
              <slot name="side-footer" />
            </footer>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ui-folder-inspector {
  --_panel-min: var(--ui-folder-inspector-min, 14rem);
  --_panel-default: var(--ui-folder-inspector-default, 18rem);
  --_panel-max: var(--ui-folder-inspector-max, 24rem);
  --_preview-min: var(--ui-folder-inspector-preview-min, 16rem);

  min-block-size: 0;
  min-inline-size: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.ui-folder-inspector__tools {
  min-inline-size: 0;
  min-block-size: var(
    --ui-folder-inspector-toolbar-height,
    calc(var(--ui-control-height) + var(--ui-space-5))
  );
  display: flex;
  align-items: center;
}

.ui-folder-inspector__workspace {
  --tab-tip-gap: var(--ui-side-panel-content-inset);
  --tab-depth: var(--ui-folder-tool-tab-length);
  --rail-width: calc(var(--tab-depth) + var(--tab-tip-gap));
  --tab-height: var(--ui-folder-tool-tab-length);
  --_expanded-width: var(--_panel-default);
  --_inspector-width: var(--_expanded-width);
  --inspector-paper: var(--ui-color-surface-raised);
  --inspector-seam: var(--ui-color-border);
  --tab-rotation: -90deg;

  display: grid;
  position: relative;
  isolation: isolate;
  grid-row: 2;
  grid-template-areas: 'stage rail inspector';
  grid-template-columns: minmax(0, 1fr) var(--rail-width) auto;
  grid-template-rows: minmax(0, 1fr);
  min-block-size: 0;
  min-inline-size: 0;
  background: var(--ui-color-canvas);
}

.ui-folder-inspector__workspace[data-labels='icon'] {
  --tab-depth: var(--ui-folder-tool-tab-depth);
}

.ui-folder-inspector__workspace[data-open='false'] {
  --_inspector-width: 0;
}

.ui-folder-inspector__workspace[data-side='left'] {
  --tab-rotation: 90deg;

  grid-template-areas: 'inspector rail stage';
  grid-template-columns: auto var(--rail-width) minmax(0, 1fr);
}

.ui-folder-inspector__drawer {
  display: contents;
}

.ui-folder-inspector__workspace[data-compact='true'] {
  grid-template-areas: 'stage .';
  grid-template-columns: minmax(0, 1fr) var(--rail-width);
}

.ui-folder-inspector__workspace[data-compact='true'][data-side='left'] {
  grid-template-areas: '. stage';
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
}

.ui-folder-inspector__workspace[data-compact='true']
  .ui-folder-inspector__drawer {
  position: absolute;
  z-index: var(--ui-layer-overlay);
  inset-block: 0;
  inset-inline-end: 0;
  display: flex;
}

.ui-folder-inspector__workspace[data-compact='true'][data-side='left']
  .ui-folder-inspector__drawer {
  inset-inline: 0 auto;
  flex-direction: row-reverse;
}

.ui-folder-inspector__workspace[data-compact='true']
  .ui-folder-inspector__rail {
  flex: 0 0 var(--rail-width);
}

.ui-folder-inspector__workspace[data-compact='true']
  .ui-folder-inspector__inspector {
  box-shadow: var(--ui-shadow-overlay);
}

.ui-folder-inspector__rail {
  grid-area: rail;
  position: relative;
  z-index: var(--ui-layer-raised);
  display: grid;
  grid-template-rows: 0 minmax(0, 1fr);
  padding-block: var(--ui-side-panel-content-inset);
}

.ui-folder-inspector__resize {
  position: absolute;
  inset-block: 0;
  inset-inline-end: calc(var(--ui-resize-handle-hit-size) / -2);
  inline-size: var(--ui-resize-handle-hit-size);
  display: grid;
  justify-items: center;
  cursor: ew-resize;
  touch-action: none;
}

.ui-folder-inspector__workspace[data-side='left'] .ui-folder-inspector__resize {
  inset-inline: calc(var(--ui-resize-handle-hit-size) / -2) auto;
}

.ui-folder-inspector__resize::before {
  inline-size: var(--ui-drag-indicator-width);
  background: var(--inspector-seam);
  content: '';
}

.ui-folder-inspector__workspace[data-open='true']
  .ui-folder-inspector__resize::before,
.ui-folder-inspector__workspace[data-resizing='true']
  .ui-folder-inspector__resize::before {
  background: var(--ui-color-folder-primary);
}

.ui-folder-inspector__workspace[data-resizing='false']
  .ui-folder-inspector__resize:hover::before,
.ui-folder-inspector__workspace
  .ui-folder-inspector__resize[data-resize-ready='true']::before {
  background: var(--ui-color-accent);
}

.ui-folder-inspector__resize:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-folder-inspector__tabs {
  padding-inline-start: var(--tab-tip-gap);
}

.ui-folder-inspector__workspace[data-side='left'] .ui-folder-inspector__tabs {
  padding-inline: 0 var(--tab-tip-gap);
}

.ui-folder-inspector__inspector {
  grid-area: inspector;
  position: relative;
  inline-size: var(
    --_live-width,
    var(--_held-closed-width, var(--_inspector-width))
  );
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  justify-items: start;
  overflow: clip;
}

.ui-folder-inspector__workspace[data-compact='true'][data-resizing='false']
  .ui-folder-inspector__inspector {
  transition: inline-size var(--ui-motion-duration-standard)
    var(--ui-motion-easing-standard);
}

.ui-folder-inspector__inspector-sheet {
  inline-size: var(--_live-width, var(--_expanded-width));
  min-block-size: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--inspector-paper);
  container: ui-folder-inspector-sheet / inline-size;
}

.ui-folder-inspector__workspace[data-side='left']
  .ui-folder-inspector__inspector {
  justify-items: end;
}

.ui-folder-inspector__main {
  grid-area: stage;
  isolation: isolate;
  min-block-size: 0;
  min-inline-size: 0;
  display: grid;
}

.ui-folder-inspector__preview-dismiss {
  grid-area: stage;
  z-index: var(--ui-layer-raised);
  min-block-size: 0;
  min-inline-size: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.ui-folder-inspector__preview-dismiss:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-folder-inspector__header,
.ui-folder-inspector__footer {
  min-inline-size: 0;
  padding-inline: var(--ui-space-3);
}

.ui-folder-inspector__scroll {
  --ui-scroll-layout-padding-inline-start: var(--ui-space-3);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-3);

  grid-row: 2;
  min-block-size: 0;
}

.ui-folder-inspector__footer {
  grid-row: 3;
}
</style>

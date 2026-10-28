<script setup>
import { computed } from 'vue';
import { PanelRightOpen } from '../../icons/index.js';
import {
  RIGHT_DOCK_WIDTH_KEYBOARD_STEP,
  RIGHT_DOCK_WIDTH_MIN,
  useAppRightDockWidth,
} from '../../composables/useAppRightDockWidth.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSurface from '../ui/UiSurface.vue';

const props = defineProps({
  expanded: { type: Boolean, required: true },
  maximized: { type: Boolean, default: false },
  performance: { type: Boolean, default: false },
  label: { type: String, default: '右側區塊' },
  expandLabel: { type: String, default: '展開右側區塊' },
  contentId: { type: String, required: true },
  motionOrigin: {
    type: String,
    default: 'end',
    validator: (value) => ['end', 'bottom'].includes(value),
  },
});

const emit = defineEmits(['expand', 'toggleExpanded']);
const dockWidth = useAppRightDockWidth();
const rootStyle = computed(() => ({
  width: props.maximized ? '100%' : undefined,
  '--ui-right-dock-width': props.maximized
    ? '100%'
    : `${dockWidth.width.value}px`,
}));

function handleResizeKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('toggleExpanded');
    return;
  }
  if (!props.expanded) return;

  const handlers = {
    ArrowLeft: () => dockWidth.resizeBy(RIGHT_DOCK_WIDTH_KEYBOARD_STEP),
    ArrowRight: () => dockWidth.resizeBy(-RIGHT_DOCK_WIDTH_KEYBOARD_STEP),
    Home: () => dockWidth.setWidth(RIGHT_DOCK_WIDTH_MIN),
    End: () => dockWidth.setWidth(dockWidth.maximum.value),
  };
  const handler = handlers[event.key];
  if (!handler) return;
  event.preventDefault();
  handler();
}
</script>

<template>
  <UiSurface
    :data-ui-region="performance && expanded ? 'receipt' : 'chrome'"
    tag="aside"
    class="app-right-dock"
    :class="{
      'app-right-dock--expanded': expanded,
      'app-right-dock--collapsed': !expanded,
      'app-right-dock--bottom': motionOrigin === 'bottom',
      'app-right-dock--performance': performance,
    }"
    tone="surface"
    radius="lg"
    stroke="inset"
    :style="rootStyle"
    :aria-label="expanded ? label : `${label}（已摺疊）`"
  >
    <div
      :id="contentId"
      class="app-right-dock__content"
      :aria-hidden="!expanded"
      :inert="!expanded"
    >
      <slot />
    </div>

    <UiIconButton
      v-if="!expanded"
      class="app-right-dock__expand"
      :icon="PanelRightOpen"
      :label="expandLabel"
      :aria-expanded="false"
      :aria-controls="contentId"
      variant="command"
      size="md"
      tooltip-placement="start"
      @click="emit('expand')"
    />

    <div
      v-if="expanded"
      v-show="!props.maximized"
      class="app-right-dock__handle"
      :class="{
        'app-right-dock__handle--active': dockWidth.isResizing.value,
      }"
      role="separator"
      :inert="props.maximized"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="RIGHT_DOCK_WIDTH_MIN"
      :aria-valuemax="dockWidth.maximum.value"
      :aria-valuenow="dockWidth.width.value"
      :aria-valuetext="`${dockWidth.width.value} 像素`"
      :aria-controls="contentId"
      :aria-expanded="true"
      aria-label="調整右側區塊寬度；方向鍵調整，Enter、空白鍵或雙擊收合"
      @pointerdown="dockWidth.startResize($event)"
      @dblclick="emit('toggleExpanded')"
      @keydown="handleResizeKeydown"
    ></div>
  </UiSurface>
</template>

<style scoped>
.app-right-dock {
  /* These aliases are first composed at the renderer root. Re-compose them
     inside the regional owner so Chrome foregrounds never sit on a Light
     section or sticky surface inherited from that root. */
  --ui-right-dock-background: var(--ui-color-surface);
  --ui-right-dock-state-background: var(--ui-right-dock-background);
  --ui-right-dock-section-surface-background: var(--ui-right-dock-background);
  --ui-right-dock-sticky-background: var(--ui-right-dock-state-background);
  --ui-right-dock-footer-background: var(--ui-right-dock-state-background);

  /* The Dock is a fixed-density content boundary. Keep the generic Track
     Row mapping available everywhere else while Queue, Recent, and Metadata
     share 52/40 geometry plus the Sidebar-aligned 4px row inset/state plate. */
  --ui-track-row-min-height: var(--ui-right-dock-track-row-min-height);
  --ui-track-row-thumb-size: var(--ui-right-dock-track-artwork-size);
  --ui-track-row-padding-inline: var(--ui-right-dock-track-row-padding-inline);
  --ui-track-row-state-surface-outset-inline: var(
    --ui-right-dock-track-row-state-surface-outset-inline
  );
  --ui-track-row-radius: var(--ui-right-dock-track-row-radius);

  position: relative;
  display: flex;
  width: var(--ui-right-dock-rail-width);
  min-width: 0;
  min-height: 0;
  color: var(--ui-color-text);
  flex-direction: column;
  pointer-events: auto;
}

.app-right-dock--expanded {
  width: var(--ui-right-dock-width);
  height: 100%;
  overflow: hidden;
}

.app-right-dock.app-right-dock--expanded {
  background: var(--ui-right-dock-background);
}

/* Paper is a local receipt boundary, never a global theme switch. */
.app-right-dock--performance {
  --ui-right-dock-state-background: var(--ui-color-surface);
  --ui-right-dock-footer-background: var(--ui-color-surface-raised);
}
.app-right-dock--performance.app-right-dock--expanded {
  background: transparent;
}
.app-right-dock--performance.app-right-dock--expanded::after {
  border-color: transparent;
}
.app-right-dock--performance .app-right-dock__content {
  background: var(--ui-color-surface);
  padding-block: var(--ui-space-1);
  clip-path: polygon(
    0% var(--ui-space-1),
    2% 0%,
    4% var(--ui-space-1),
    6% 0%,
    8% var(--ui-space-1),
    10% 0%,
    12% var(--ui-space-1),
    14% 0%,
    16% var(--ui-space-1),
    18% 0%,
    20% var(--ui-space-1),
    22% 0%,
    24% var(--ui-space-1),
    26% 0%,
    28% var(--ui-space-1),
    30% 0%,
    32% var(--ui-space-1),
    34% 0%,
    36% var(--ui-space-1),
    38% 0%,
    40% var(--ui-space-1),
    42% 0%,
    44% var(--ui-space-1),
    46% 0%,
    48% var(--ui-space-1),
    50% 0%,
    52% var(--ui-space-1),
    54% 0%,
    56% var(--ui-space-1),
    58% 0%,
    60% var(--ui-space-1),
    62% 0%,
    64% var(--ui-space-1),
    66% 0%,
    68% var(--ui-space-1),
    70% 0%,
    72% var(--ui-space-1),
    74% 0%,
    76% var(--ui-space-1),
    78% 0%,
    80% var(--ui-space-1),
    82% 0%,
    84% var(--ui-space-1),
    86% 0%,
    88% var(--ui-space-1),
    90% 0%,
    92% var(--ui-space-1),
    94% 0%,
    96% var(--ui-space-1),
    98% 0%,
    100% var(--ui-space-1),
    100% calc(100% - var(--ui-space-1)),
    98% 100%,
    96% calc(100% - var(--ui-space-1)),
    94% 100%,
    92% calc(100% - var(--ui-space-1)),
    90% 100%,
    88% calc(100% - var(--ui-space-1)),
    86% 100%,
    84% calc(100% - var(--ui-space-1)),
    82% 100%,
    80% calc(100% - var(--ui-space-1)),
    78% 100%,
    76% calc(100% - var(--ui-space-1)),
    74% 100%,
    72% calc(100% - var(--ui-space-1)),
    70% 100%,
    68% calc(100% - var(--ui-space-1)),
    66% 100%,
    64% calc(100% - var(--ui-space-1)),
    62% 100%,
    60% calc(100% - var(--ui-space-1)),
    58% 100%,
    56% calc(100% - var(--ui-space-1)),
    54% 100%,
    52% calc(100% - var(--ui-space-1)),
    50% 100%,
    48% calc(100% - var(--ui-space-1)),
    46% 100%,
    44% calc(100% - var(--ui-space-1)),
    42% 100%,
    40% calc(100% - var(--ui-space-1)),
    38% 100%,
    36% calc(100% - var(--ui-space-1)),
    34% 100%,
    32% calc(100% - var(--ui-space-1)),
    30% 100%,
    28% calc(100% - var(--ui-space-1)),
    26% 100%,
    24% calc(100% - var(--ui-space-1)),
    22% 100%,
    20% calc(100% - var(--ui-space-1)),
    18% 100%,
    16% calc(100% - var(--ui-space-1)),
    14% 100%,
    12% calc(100% - var(--ui-space-1)),
    10% 100%,
    8% calc(100% - var(--ui-space-1)),
    6% 100%,
    4% calc(100% - var(--ui-space-1)),
    2% 100%,
    0% calc(100% - var(--ui-space-1))
  );
}
.app-right-dock--performance
  :deep(.app-right-dock-panel__footer > .ui-separator) {
  background: transparent;
  border-block-start: var(--ui-border-width) dashed var(--ui-color-border);
}
.app-right-dock--performance :deep(.performance-session-current) {
  padding-block-end: var(--ui-space-3);
  border-block-end: var(--ui-border-width) dashed var(--ui-color-border);
}

.app-right-dock--collapsed {
  width: var(--ui-right-dock-rail-width);
  height: calc(var(--ui-right-dock-rail-width) + var(--ui-space-1));
}

.app-right-dock.app-right-dock--collapsed {
  overflow: clip;
  overflow-clip-margin: var(--ui-space-2);
  background: transparent;
}

.app-right-dock.app-right-dock--collapsed::after {
  border-color: transparent;
}

.app-right-dock__expand {
  --ui-icon-button-size-override: var(--ui-right-dock-rail-width);

  position: absolute;
  z-index: var(--ui-layer-overlay);
  inset-inline-end: 0;
  inset-block-end: var(--ui-space-1);
}

.app-right-dock__content {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
  width: var(--ui-right-dock-width);
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    transform var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    visibility 0s linear 0s;
}

.app-right-dock--collapsed .app-right-dock__content {
  opacity: 0;
  visibility: hidden;
  transform: translateX(var(--ui-space-3));
  pointer-events: none;
  transition:
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    visibility 0s linear var(--ui-motion-duration-fast);
}

/* Queue owns its vertical motion at the surface layer, including physical
   Dock collapse. Keep the full clipping box until that exit finishes, then
   snap to the restore control; never animate layout geometry. */
.app-right-dock--bottom {
  transition:
    width 0s linear var(--ui-motion-duration-fast),
    height 0s linear var(--ui-motion-duration-fast);
}

.app-right-dock--bottom.app-right-dock--expanded {
  transition: none;
}

.app-right-dock--bottom .app-right-dock__content {
  opacity: 1;
  transform: none;
  transition: visibility 0s linear 0s;
}

.app-right-dock--bottom.app-right-dock--collapsed .app-right-dock__content {
  transition: visibility 0s linear var(--ui-motion-duration-fast);
}

.app-right-dock__handle {
  position: absolute;
  z-index: var(--ui-layer-raised);
  inset-block: 0;
  inset-inline-start: calc(var(--ui-resize-handle-hit-size) / -2);
  inline-size: var(--ui-resize-handle-hit-size);
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.app-right-dock__handle::after {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 50%;
  inline-size: var(--ui-drag-indicator-width);
  background: transparent;
  transform: translateX(-50%);
  transition: background-color var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.app-right-dock__handle:hover::after,
.app-right-dock__handle--active::after {
  background: var(--ui-color-accent);
}

.app-right-dock__handle:focus-visible {
  outline: none;
}

.app-right-dock__handle:focus-visible::after {
  background: var(--ui-color-focus);
}

:global(:root[data-ui-motion='reduced'] .app-right-dock--bottom),
:global(:root[data-ui-motion='reduced'] .app-right-dock__content),
:global(:root[data-ui-motion='reduced'] .app-right-dock__handle::after) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-right-dock--bottom,
  .app-right-dock__content,
  .app-right-dock__handle::after {
    transition: none;
  }
}
</style>

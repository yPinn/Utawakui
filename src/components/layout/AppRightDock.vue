<script setup>
import { computed } from 'vue';
import { PanelRightOpen } from '../../icons/index.js';
import {
  RIGHT_DOCK_WIDTH_KEYBOARD_STEP,
  RIGHT_DOCK_WIDTH_MAX,
  RIGHT_DOCK_WIDTH_MIN,
  useAppRightDockWidth,
} from '../../composables/useAppRightDockWidth.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSurface from '../ui/UiSurface.vue';

const props = defineProps({
  expanded: { type: Boolean, required: true },
  label: { type: String, default: '右側區塊' },
  expandLabel: { type: String, default: '展開右側區塊' },
  contentId: { type: String, required: true },
});

const emit = defineEmits(['expand', 'toggleExpanded']);
const dockWidth = useAppRightDockWidth();
const rootStyle = computed(() => ({
  '--ui-right-dock-width': `${dockWidth.width.value}px`,
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
    End: () => dockWidth.setWidth(RIGHT_DOCK_WIDTH_MAX),
  };
  const handler = handlers[event.key];
  if (!handler) return;
  event.preventDefault();
  handler();
}
</script>

<template>
  <UiSurface
    tag="aside"
    class="app-right-dock"
    :class="{
      'app-right-dock--expanded': expanded,
      'app-right-dock--collapsed': !expanded,
    }"
    tone="surface"
    radius="sm"
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
      shape="inherit"
      stretch
      @click="emit('expand')"
    />

    <div
      class="app-right-dock__handle"
      :class="{
        'app-right-dock__handle--active': dockWidth.isResizing.value,
      }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="RIGHT_DOCK_WIDTH_MIN"
      :aria-valuemax="RIGHT_DOCK_WIDTH_MAX"
      :aria-valuenow="dockWidth.width.value"
      :aria-valuetext="`${dockWidth.width.value} 像素`"
      :aria-controls="contentId"
      :aria-expanded="expanded"
      :aria-label="
        expanded
          ? '調整右側區塊寬度；方向鍵調整，Enter、空白鍵或雙擊切換摺疊'
          : '展開右側區塊；Enter、空白鍵或雙擊'
      "
      @pointerdown="expanded && dockWidth.startResize($event)"
      @dblclick="emit('toggleExpanded')"
      @keydown="handleResizeKeydown"
    ></div>
  </UiSurface>
</template>

<style scoped>
.app-right-dock {
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
  /* Right Dock selection is a quiet disclosure state, not a brand fill. */
  --ui-track-row-selected-surface: color-mix(
    in srgb,
    var(--ui-color-text) 8%,
    transparent
  );
  --ui-track-row-active-shadow: none;

  position: relative;
  display: flex;
  width: var(--ui-right-dock-rail-width);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  color: var(--ui-color-text);
  flex-direction: column;
}

.app-right-dock--expanded {
  width: var(--ui-right-dock-width);
}

.app-right-dock--collapsed {
  width: var(--ui-right-dock-rail-width);
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

.app-right-dock__handle {
  position: absolute;
  z-index: 1;
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

:global(:root[data-ui-motion='reduced']) .app-right-dock__content,
:global(:root[data-ui-motion='reduced']) .app-right-dock__handle::after {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .app-right-dock__content,
  .app-right-dock__handle::after {
    transition: none;
  }
}

@media (max-width: 70rem) {
  .app-right-dock--expanded {
    width: min(
      var(--ui-right-dock-width),
      calc(100vw - var(--ui-right-dock-rail-width))
    );
    box-shadow: var(--ui-shadow-overlay);
  }
}
</style>

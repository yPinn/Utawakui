<script setup>
import { useId } from 'vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  activeDestination: { type: String, required: true },
});

const emit = defineEmits(['navigate']);
const tabShapeId = `app-folder-tab-shape-${useId()}`;
const tabShapeStyle = {
  '--ui-folder-tab-shape': `url("#${tabShapeId}")`,
};
const destinations = Object.freeze([
  Object.freeze({ id: 'setlist', label: 'Setlist' }),
  Object.freeze({ id: 'lyrics', label: 'Lyrics' }),
  Object.freeze({ id: 'output', label: 'Output' }),
  Object.freeze({ id: 'import', label: 'Import' }),
]);

function revealDestination(event) {
  event.currentTarget?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
}

function navigate(destinationId, event) {
  revealDestination(event);
  emit('navigate', destinationId);
}
</script>

<template>
  <div
    class="app-folder-layout"
    :data-active-destination="activeDestination"
    :style="tabShapeStyle"
  >
    <svg
      class="app-folder-layout__shape-definition"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath :id="tabShapeId" clipPathUnits="objectBoundingBox">
          <path
            d="M0.16,0 L0.84,0 C0.9,0 0.92,0.18 0.95,0.42 L1,1 L0,1 L0.05,0.42 C0.08,0.18 0.1,0 0.16,0 Z"
          />
        </clipPath>
      </defs>
    </svg>

    <UiScrollRegion
      class="app-folder-layout__navigation"
      axis="horizontal"
      scrollbar-visibility="hidden"
      viewport-tag="nav"
      viewport-class="app-folder-layout__navigation-viewport"
      aria-label="Folder 頁面"
    >
      <button
        v-for="destination in destinations"
        :key="destination.id"
        type="button"
        class="app-folder-layout__destination"
        :class="{
          'app-folder-layout__destination--active':
            destination.id === activeDestination,
        }"
        :data-folder-destination="destination.id"
        :data-app-workflow-trigger="destination.id"
        :aria-current="
          destination.id === activeDestination ? 'page' : undefined
        "
        @focus="revealDestination"
        @click="navigate(destination.id, $event)"
      >
        <span class="app-folder-layout__destination-label">
          {{ destination.label }}
        </span>
      </button>
    </UiScrollRegion>

    <div class="app-folder-layout__perimeter">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-folder-layout {
  --ui-folder-layout-background: var(--ui-color-folder-primary);
  --ui-folder-page-background: var(--ui-folder-interior-background-setlist);
  --ui-folder-content-background: var(--ui-folder-sheet-background);

  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  container-type: inline-size;
  container-name: app-folder-layout;
  -webkit-user-select: none;
  user-select: none;
}

.app-folder-layout[data-active-destination='lyrics'] {
  --ui-folder-layout-background: var(--ui-color-folder-secondary);
  --ui-folder-page-background: var(--ui-folder-interior-background-lyrics);
}

.app-folder-layout[data-active-destination='output'] {
  --ui-folder-layout-background: var(--ui-color-folder-tertiary);
  --ui-folder-page-background: var(--ui-folder-interior-background-output);
}

.app-folder-layout[data-active-destination='import'] {
  --ui-folder-layout-background: var(--ui-color-folder-neutral);
  --ui-folder-page-background: var(--ui-folder-interior-background-import);
}

.app-folder-layout__shape-definition {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
}

.app-folder-layout__navigation {
  position: relative;
  isolation: isolate;
  z-index: 2;
  min-width: 0;
  block-size: var(--ui-folder-tab-height-active);
  margin-bottom: calc(-1 * var(--ui-folder-tab-cover-size));
}

.app-folder-layout__navigation::after {
  content: '';
  position: absolute;
  z-index: 2;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: var(--ui-folder-tab-cover-size);
  border-radius: var(--ui-radius-lg) var(--ui-radius-lg) 0 0;
  background: var(--ui-folder-layout-background);
  pointer-events: none;
}

.app-folder-layout__navigation :deep(.app-folder-layout__navigation-viewport) {
  box-sizing: border-box;
  block-size: 100%;
  display: flex;
  align-items: start;
  gap: var(--ui-space-2);
  padding-inline: var(--ui-folder-perimeter);
  scroll-padding-inline: var(--ui-folder-perimeter);
}

.app-folder-layout__destination[data-folder-destination='setlist'] {
  --ui-folder-tab-material: var(--ui-color-folder-primary);
  --ui-folder-tab-foreground: var(--ui-color-folder-primary-foreground);
}

.app-folder-layout__destination[data-folder-destination='lyrics'] {
  --ui-folder-tab-material: var(--ui-color-folder-secondary);
  --ui-folder-tab-foreground: var(--ui-color-folder-secondary-foreground);
}

.app-folder-layout__destination[data-folder-destination='output'] {
  --ui-folder-tab-material: var(--ui-color-folder-tertiary);
  --ui-folder-tab-foreground: var(--ui-color-folder-tertiary-foreground);
}

.app-folder-layout__destination[data-folder-destination='import'] {
  --ui-folder-tab-material: var(--ui-color-folder-neutral);
  --ui-folder-tab-foreground: var(--ui-color-folder-neutral-foreground);
}

.app-folder-layout__destination {
  position: relative;
  isolation: isolate;
  z-index: 1;
  min-width: var(--ui-folder-tab-min-inline-size);
  block-size: var(--ui-folder-tab-height-active);
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  margin: 0;
  padding: 0 var(--ui-space-4);
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--ui-folder-tab-foreground);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
  transition: color var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.app-folder-layout__destination::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  clip-path: var(--ui-folder-tab-shape);
  background: var(--ui-folder-tab-material);
  transform: translateY(var(--ui-folder-tab-rest-offset));
  transition:
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.app-folder-layout__destination:hover {
  color: var(--ui-folder-tab-foreground);
}

.app-folder-layout__destination:hover::before {
  background: color-mix(
    in srgb,
    var(--ui-folder-tab-material) 88%,
    var(--ui-folder-tab-foreground)
  );
}

.app-folder-layout__destination--active {
  z-index: 3;
  color: var(--ui-folder-tab-foreground);
}

.app-folder-layout__destination--active::before,
.app-folder-layout__destination--active:hover::before {
  background: var(--ui-folder-layout-background);
  transform: translateY(0);
}

.app-folder-layout__destination-label {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 100%;
  block-size: var(--ui-folder-tab-label-block-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateY(var(--ui-folder-tab-label-rest-offset));
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.app-folder-layout__destination--active .app-folder-layout__destination-label {
  transform: translateY(var(--ui-folder-tab-label-optical-offset));
}

.app-folder-layout__destination:focus-visible {
  z-index: 4;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.app-folder-layout__perimeter {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: var(--ui-folder-perimeter);
  overflow: hidden;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-folder-layout-background);
}

@container app-folder-layout (max-width: 36rem) {
  .app-folder-layout__navigation
    :deep(.app-folder-layout__navigation-viewport) {
    gap: var(--ui-space-1);
  }

  .app-folder-layout__destination {
    min-width: var(--ui-folder-tab-min-inline-size-narrow);
    flex: 1 1 var(--ui-folder-tab-min-inline-size-narrow);
    padding-inline: var(--ui-space-2);
  }
}

@media (forced-colors: active) {
  .app-folder-layout__navigation::after,
  .app-folder-layout__perimeter {
    background: Canvas;
  }

  .app-folder-layout__destination--active {
    color: HighlightText;
  }

  .app-folder-layout__destination--active::before {
    box-sizing: border-box;
    border: var(--ui-border-width) solid Highlight;
    background: Highlight;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-folder-layout__destination,
  .app-folder-layout__destination::before,
  .app-folder-layout__destination-label {
    transition: none;
  }
}
</style>

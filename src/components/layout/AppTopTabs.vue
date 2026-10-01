<script setup>
import { useId } from 'vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';

defineProps({
  activeView: { type: String, required: true },
});

const emit = defineEmits(['update:activeView']);
const tabShapeId = `app-tab-shape-${useId()}`;
const tabShapeStyle = {
  '--ui-app-tab-shape': `url("#${tabShapeId}")`,
};

// Flat list — every tab shares one resting look and one active look (see
// .app-tabs__folder / --active below). No per-tab color data: distinct
// per-tab hues read as competing accents on an operational tool meant to
// stay calm and low-noise (see DESIGN.md), and this app's
// color identity isn't decided yet besides.
const workflowItems = [
  { key: 'setlist', label: 'Setlist' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'output', label: 'Output' },
  { key: 'import', label: 'Import' },
];

function revealTab(event) {
  event.currentTarget?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
}
</script>

<template>
  <nav class="app-tabs" aria-label="主要功能" :style="tabShapeStyle">
    <!-- Shared curve, referenced by every tab's clip-path below.
         clipPathUnits="objectBoundingBox" makes the 0-1 coordinates
         fractions of each button's own box, so one definition scales to
         any tab size (including the taller active state). -->
    <svg width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <clipPath :id="tabShapeId" clipPathUnits="objectBoundingBox">
          <path
            d="M0.18,0 L0.82,0 C0.93,0 0.97,1 1,1 L0,1 C0.03,1 0.07,0 0.18,0 Z"
          />
        </clipPath>
      </defs>
    </svg>
    <UiScrollRegion
      class="app-tabs__row"
      axis="horizontal"
      scrollbar-visibility="hidden"
      viewport-class="app-tabs__row-viewport"
    >
      <div class="app-tabs__group app-tabs__group--workflow">
        <button
          v-for="item in workflowItems"
          :key="item.key"
          type="button"
          class="app-tabs__folder"
          :class="{ 'app-tabs__folder--active': item.key === activeView }"
          :data-app-workflow-trigger="item.key"
          :aria-current="item.key === activeView ? 'page' : undefined"
          @focus="revealTab"
          @click="emit('update:activeView', item.key)"
        >
          <span class="app-tabs__content app-tabs__label">
            {{ item.label }}
          </span>
        </button>
      </div>
    </UiScrollRegion>
  </nav>
</template>

<style scoped>
.app-tabs {
  position: relative;
  min-width: 0;
  /* Horizontal padding matches .app-inner-page__content's --ui-space-4 —
     the first tab's left edge lines up with the page panel's content
     edge below it. */
  padding: var(--ui-space-4) var(--ui-space-4) 0;
  background: transparent;
}

.app-tabs__row {
  position: relative;
  z-index: 1;
  min-width: 0;
  width: 100%;
  block-size: var(--ui-archive-tab-active-height);
}

.app-tabs__row :deep(.app-tabs__row-viewport) {
  position: relative;
  block-size: 100%;
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--ui-archive-tab-gap);
}

.app-tabs__row :deep(.app-tabs__row-viewport)::after {
  content: '';
  position: absolute;
  /* The rail is the Folder's front lip: it covers resting tab bottoms while
     the current destination rises above it and joins the page perimeter. */
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--ui-archive-rail-size);
  background: var(--ui-color-accent);
  pointer-events: none;
}

.app-tabs__group {
  display: flex;
  align-items: end;
  gap: var(--ui-archive-tab-gap);
  min-width: 0;
}

.app-tabs__group--workflow {
  flex: 0 1 auto;
}

/* One shape on one element via clip-path, not a multi-piece
   cap/middle/cap composition — a single element has no seam to have. */
.app-tabs__folder {
  position: relative;
  isolation: isolate;
  /* Resting tabs sit behind the cover rail; current and focus rise above it. */
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  height: var(--ui-archive-tab-active-height);
  min-width: var(--ui-archive-tab-min-width);
  max-width: 28vw;
  margin: 0;
  padding: 0 var(--ui-space-5);
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  cursor: pointer;
  transition: color var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.app-tabs__folder::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  clip-path: var(--ui-app-tab-shape);
  background: var(--ui-color-surface-raised);
  transform: translateY(var(--ui-archive-tab-rest-offset));
  transition:
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.app-tabs__folder--active {
  z-index: 3;
  color: var(--ui-color-accent-contrast);
}

.app-tabs__folder--active::before {
  background: var(--ui-color-accent);
  transform: translateY(0);
}

.app-tabs__content {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 100%;
  block-size: var(--ui-archive-tab-label-block-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: translateY(var(--ui-archive-tab-label-rest-offset));
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.app-tabs__folder--active .app-tabs__content {
  transform: translateY(var(--ui-archive-tab-label-optical-offset));
}

/* The development-only Studio Library Candidate supplies the root marker.
   Folder material remains authored here by the global-navigation owner,
   instead of a child View reaching through this component's internals. */
:global(:root[data-ui-system='v2'][data-ui-candidate-view='studio-library'])
  .app-tabs__row::after,
:global(:root[data-ui-system='v2'][data-ui-candidate-view='studio-library'])
  .app-tabs__folder--active::before {
  background: var(--ui-color-folder-primary);
}

:global(:root[data-ui-system='v2'][data-ui-candidate-view='studio-library'])
  .app-tabs__folder--active {
  color: var(--ui-color-text);
}

:global(:root[data-ui-system='v2'][data-ui-candidate-view='studio-library'])
  .app-tabs {
  -webkit-user-select: none;
  user-select: none;
}

.app-tabs__folder:focus-visible {
  z-index: 4;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

/* Title tier, not DESIGN.md's literal Label-tier "tabs" wording — these
   render as large, top-of-app section identity tabs (56-68px tall), not
   compact controls, so they carry more weight than a plain control label
   (section-header territory), one step below UiPageHeader's own in-page
   Headline title. Fixed Scale Rule still applies: no viewport-fluid size,
   narrow width uses layout, not shrinking. */
.app-tabs__label {
  overflow: hidden;
  max-width: 100%;
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .app-tabs {
    padding: var(--ui-space-3) var(--ui-space-3) 0;
  }

  .app-tabs__folder {
    min-width: 6rem;
    padding: 0 var(--ui-space-3);
  }
}

@media (forced-colors: active) {
  .app-tabs__row :deep(.app-tabs__row-viewport)::after {
    background: Highlight;
  }

  .app-tabs__folder--active {
    color: HighlightText;
    forced-color-adjust: none;
  }

  .app-tabs__folder--active::before {
    box-sizing: border-box;
    border: var(--ui-border-width) solid Highlight;
    background: Highlight;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-tabs__folder,
  .app-tabs__folder::before,
  .app-tabs__content {
    transition: none;
  }
}
</style>

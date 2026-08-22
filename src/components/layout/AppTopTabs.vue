<script setup>
import { ICON_SIZE, Settings } from '../../icons/index.js';

defineProps({
  activeView: { type: String, required: true },
});

const emit = defineEmits(['update:activeView']);

// Flat list — every tab shares one resting look and one active look (see
// .app-tabs__folder / --active below). No per-tab color data: distinct
// per-tab hues read as competing accents on an operational tool meant to
// stay calm and low-noise (CLAUDE.md's Design Principles), and this app's
// color identity isn't decided yet besides.
const workflowItems = [
  { key: 'setlist', label: 'Setlist' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'output', label: 'Output' },
  { key: 'import', label: 'Import' },
];

const utilityItems = [{ key: 'settings', ariaLabel: '設定' }];
</script>

<template>
  <nav class="app-tabs" aria-label="主要功能">
    <!-- Shared curve, referenced by every tab's clip-path below.
         clipPathUnits="objectBoundingBox" makes the 0-1 coordinates
         fractions of each button's own box, so one definition scales to
         any tab size (including the taller active state). -->
    <svg width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="app-tab-shape" clipPathUnits="objectBoundingBox">
          <path
            d="M0.18,0 L0.82,0 C0.93,0 0.97,1 1,1 L0,1 C0.03,1 0.07,0 0.18,0 Z"
          />
        </clipPath>
      </defs>
    </svg>
    <div class="app-tabs__row">
      <div class="app-tabs__group app-tabs__group--workflow">
        <button
          v-for="item in workflowItems"
          :key="item.key"
          type="button"
          class="app-tabs__folder"
          :class="{ 'app-tabs__folder--active': item.key === activeView }"
          :aria-current="item.key === activeView ? 'page' : undefined"
          @click="emit('update:activeView', item.key)"
        >
          <span class="app-tabs__label">{{ item.label }}</span>
        </button>
      </div>
      <div class="app-tabs__group app-tabs__group--utility">
        <button
          v-for="item in utilityItems"
          :key="item.key"
          type="button"
          class="app-tabs__folder app-tabs__folder--utility"
          :class="{ 'app-tabs__folder--active': item.key === activeView }"
          :aria-current="item.key === activeView ? 'page' : undefined"
          :aria-label="item.ariaLabel"
          :title="item.ariaLabel"
          @click="emit('update:activeView', item.key)"
        >
          <Settings
            class="app-tabs__icon"
            :size="ICON_SIZE"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
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
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--ui-archive-tab-gap);
  min-width: 0;
  width: 100%;
  overflow-x: auto;
}

.app-tabs__row::after {
  content: '';
  position: absolute;
  /* z-index:auto would paint on top of the folder buttons — ::after is
     ordered last in tree order, which is what decides paint order among
     equal-context positioned siblings. .app-tabs__folder sets an explicit
     z-index below specifically to win regardless of DOM order. */
  z-index: 0;
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

.app-tabs__group--utility {
  flex: 0 0 auto;
  margin-left: auto;
}

/* One shape on one element via clip-path, not a multi-piece
   cap/middle/cap composition — a single element has no seam to have. */
.app-tabs__folder {
  position: relative;
  isolation: isolate;
  /* Beats .app-tabs__list::after's z-index: 0 — see that rule's comment.
     --active goes higher still (5) to clear its resting neighbors. */
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--ui-archive-tab-height);
  min-width: var(--ui-archive-tab-min-width);
  max-width: 28vw;
  margin: 0;
  padding: 0 var(--ui-space-5);
  border: 0;
  clip-path: url(#app-tab-shape);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  cursor: pointer;
  transition: height var(--ui-motion-fast) var(--ui-motion-ease);
  animation: app-tabs-reveal var(--ui-motion-slow) var(--ui-motion-ease) both;
}

.app-tabs__folder--utility {
  min-width: var(--ui-archive-tab-active-height);
  padding: 0 var(--ui-space-4);
}

.app-tabs__group--workflow .app-tabs__folder:nth-child(2) {
  animation-delay: 40ms;
}

.app-tabs__group--workflow .app-tabs__folder:nth-child(3) {
  animation-delay: 80ms;
}

.app-tabs__group--workflow .app-tabs__folder:nth-child(4) {
  animation-delay: 120ms;
}

.app-tabs__group--utility .app-tabs__folder {
  animation-delay: 120ms;
}

@keyframes app-tabs-reveal {
  from {
    opacity: 0;
    transform: translateY(0.4rem);
  }
}

.app-tabs__folder--active {
  z-index: 5;
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
  height: var(--ui-archive-tab-active-height);
}

.app-tabs__folder:focus-visible {
  z-index: 6;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
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

.app-tabs__icon {
  flex: 0 0 auto;
}

@media (max-width: 760px) {
  .app-tabs {
    padding: var(--ui-space-3) var(--ui-space-3) 0;
  }

  .app-tabs__folder {
    min-width: 6rem;
    padding: 0 var(--ui-space-3);
  }

  .app-tabs__folder--utility {
    min-width: var(--ui-archive-tab-active-height);
    padding: 0 var(--ui-space-3);
  }

  .app-tabs__group--utility {
    margin-left: var(--ui-archive-tab-gap);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-tabs__folder {
    transition: none;
    animation: none;
  }
}
</style>

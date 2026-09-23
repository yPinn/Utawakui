<script setup>
import { computed, onMounted } from 'vue';
import UiIconButton from '../ui/UiIconButton.vue';
import {
  Cpu,
  ICON_SIZE,
  MemoryStick,
  MonitorUp,
  Moon,
  Sun,
} from '../../icons/index.js';
import { usePerformerSelfView } from '../../composables/usePerformerSelfView.js';
import { useSystemUsage } from '../../composables/useSystemUsage.js';
import { useTheme } from '../../composables/useTheme.js';

const { theme, toggleTheme } = useTheme();
const { state: performerState, open: openPerformerView } =
  usePerformerSelfView();
const { state: systemUsageState, refreshSystemUsage } = useSystemUsage();
onMounted(refreshSystemUsage);

const isLight = computed(() => theme.value === 'light');
const label = computed(() =>
  isLight.value ? '切換為深色主題' : '切換為淺色主題',
);
const performerLabel = computed(() =>
  performerState.open ? '切換到表演者畫面' : '開啟表演者畫面',
);

function formatResourcePercent(value) {
  return Number.isFinite(value) ? `${value}%` : '--%';
}

// This reads the whole machine's CPU/RAM, not just Utawakui's own — by the
// time it's actually red, the whole system is already stuttering, so these
// stay well below "the computer is on fire" to give an early, actionable
// signal instead of just confirming what the user can already feel.
const RESOURCE_WARNING_PERCENT = 60;
const RESOURCE_DANGER_PERCENT = 80;
function resourceToneClass(value) {
  if (!Number.isFinite(value)) return '';
  if (value >= RESOURCE_DANGER_PERCENT) {
    return 'app-title-bar__resource-value--danger';
  }
  if (value >= RESOURCE_WARNING_PERCENT) {
    return 'app-title-bar__resource-value--warning';
  }
  return '';
}
</script>

<template>
  <header class="app-title-bar">
    <!-- CPU/RAM come from useSystemUsage.js (electron/main/systemUsageService.js
         samples the OS-wide reading every few seconds). No GPU field — GPU
         usage is only meaningful while a specific engine is actively being
         written to (Windows' own GPU perf counters only populate engines
         touched since boot), so outside of active separation/encoding it
         would mostly just read near-zero; not worth a permanent row slot
         until there's a real, worthwhile reading to show. See spec.md §7.2
         item 1 for the presentation-location decision this row implements
         — PlayerBar had no room left, so this moved to the titlebar
         instead. -->
    <div
      class="app-title-bar__resources"
      role="group"
      aria-label="系統資源使用率"
    >
      <span class="app-title-bar__resource">
        <Cpu
          class="app-title-bar__resource-icon"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
        <span class="app-title-bar__resource-label">CPU</span>
        <span
          class="app-title-bar__resource-value"
          :class="resourceToneClass(systemUsageState.cpuPercent)"
          >{{ formatResourcePercent(systemUsageState.cpuPercent) }}</span
        >
      </span>
      <span class="app-title-bar__resource">
        <MemoryStick
          class="app-title-bar__resource-icon"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
        <span class="app-title-bar__resource-label">RAM</span>
        <span
          class="app-title-bar__resource-value"
          :class="resourceToneClass(systemUsageState.ramPercent)"
          >{{ formatResourcePercent(systemUsageState.ramPercent) }}</span
        >
      </span>
    </div>
    <div class="app-title-bar__controls">
      <UiIconButton
        :icon="MonitorUp"
        :label="performerLabel"
        variant="overlay"
        size="md"
        :active="performerState.open"
        :disabled="performerState.isOpening"
        @click="openPerformerView"
      />
      <UiIconButton
        :icon="isLight ? Moon : Sun"
        :label="label"
        variant="overlay"
        size="md"
        @click="toggleTheme"
      />
    </div>
  </header>
</template>

<style scoped>
.app-title-bar {
  position: relative;
  height: var(--ui-titlebar-height);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--ui-color-canvas) 84%, black),
      var(--ui-color-canvas)
    ),
    var(--ui-color-canvas);
  user-select: none;
  app-region: drag;
  -webkit-app-region: drag;
}

.app-title-bar__resources {
  position: absolute;
  top: 0;
  left: var(--ui-space-3);
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

.app-title-bar__resource {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.app-title-bar__resource-icon {
  flex-shrink: 0;
}

.app-title-bar__resource-value {
  /* Fixed width, right-aligned — CPU/RAM cycle through 1-3 digits (spec.md
     §7.2 item 1 frames both as a "使用率" percentage, not RAM as an
     absolute GB reading) and must not reflow the icon/label before them or
     the next metric after them. tabular-nums above already keeps each
     digit's own width constant; this covers the digit *count* changing
     too. */
  display: inline-block;
  width: 4ch; /* "100%" */
  text-align: right;
}

.app-title-bar__resource-value--warning {
  color: var(--ui-color-warning);
}

.app-title-bar__resource-value--danger {
  color: var(--ui-color-danger);
}

.app-title-bar__controls {
  /* Shrink-to-fit (right set, no left/width) — a *sized* no-drag div
     here (tried first, via width: env(titlebar-area-width, 100%)) silently
     grows to the full bar on a bad env() read and kills window dragging.
     Only the position depends on env() now; the box stays button-sized. */
  position: absolute;
  top: 0;
  right: calc(100% - env(titlebar-area-width, 100%));
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding-right: var(--ui-space-2);
  app-region: no-drag;
  -webkit-app-region: no-drag;
}
</style>

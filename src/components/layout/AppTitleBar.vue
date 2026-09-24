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
import { useAppUsage } from '../../composables/useAppUsage.js';
import { useTheme } from '../../composables/useTheme.js';

const { theme, toggleTheme } = useTheme();
const { state: performerState, open: openPerformerView } =
  usePerformerSelfView();
const { state: appUsageState, refreshAppUsage } = useAppUsage();
onMounted(refreshAppUsage);

const isLight = computed(() => theme.value === 'light');
const label = computed(() =>
  isLight.value ? '切換為深色主題' : '切換為淺色主題',
);
const performerLabel = computed(() =>
  performerState.open ? '切換到表演者畫面' : '開啟表演者畫面',
);

function formatResourcePercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '--%';
}

// This reads only Utawakui's own processes (Electron browser/renderer/GPU/
// utility, plus Python/FFmpeg while a heavy job is running) — Task Manager
// already shows whole-machine numbers, so this row answers "is Utawakui
// itself the problem?" instead of duplicating that. Because it's scoped to
// one app rather than the whole machine, the useful range sits far below the
// system-wide 60/80 thresholds this used to share.
const CPU_WARNING_PERCENT = 25;
const CPU_DANGER_PERCENT = 50;
// RAM stays a percent-of-total (not an absolute MB figure) on purpose: the
// same footprint matters more on a smaller machine, and that's exactly the
// headroom question this row exists to answer. Calibrated against 16GB as
// the representative consumer tier (8GB is enough of an edge case now that
// it isn't worth designing the thresholds around): idle overhead (Electron's
// browser/renderer/GPU processes with nothing else running) is roughly 2% of
// 16GB, comfortably under warning; an active vocal-separation job pulling
// roughly 2GB (model + audio buffers on top of the Electron baseline) is
// ~12.5% of 16GB — past warning, under danger, which is the right read since
// a single heavy job still leaves real headroom on 16GB. Danger is reserved
// for something past a normal heavy job (e.g. a leak, or piling multiple
// heavy jobs at once). These same numbers still behave sanely on 8GB (idle
// stays under warning, one heavy job now crosses into danger, which is
// accurate — 8GB has real paging risk at that point) without being the
// machine they were tuned for.
const RAM_WARNING_PERCENT = 8;
const RAM_DANGER_PERCENT = 16;
function resourceToneClass(value, warningPercent, dangerPercent) {
  if (!Number.isFinite(value)) return '';
  if (value >= dangerPercent) return 'app-title-bar__resource-value--danger';
  if (value >= warningPercent) return 'app-title-bar__resource-value--warning';
  return '';
}
</script>

<template>
  <header class="app-title-bar">
    <!-- CPU/RAM come from useAppUsage.js (electron/main/appUsageService.js
         samples app.getAppMetrics() every few seconds, plus Python/FFmpeg's
         own process tree while a heavy job like vocal separation is running
         — see childProcessUsageSampler.js). Scoped to Utawakui itself, not
         the whole machine: Task Manager already covers that, so duplicating
         it here added nothing. No GPU field — GPU usage is only meaningful
         while a specific engine is actively being written to (Windows' own
         GPU perf counters only populate engines touched since boot), so
         outside of active separation/encoding it would mostly just read
         near-zero; not worth a permanent row slot until there's a real,
         worthwhile reading to show. See spec.md §7.2 item 1 for the
         presentation-location decision this row implements — PlayerBar had
         no room left, so this moved to the titlebar instead. -->
    <div
      class="app-title-bar__resources"
      role="group"
      aria-label="Utawakui 資源使用率"
      title="僅 Utawakui 自身（人聲分離執行中含子程序），非整台電腦"
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
          :class="
            resourceToneClass(
              appUsageState.cpuPercent,
              CPU_WARNING_PERCENT,
              CPU_DANGER_PERCENT,
            )
          "
          >{{ formatResourcePercent(appUsageState.cpuPercent) }}</span
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
          :class="
            resourceToneClass(
              appUsageState.ramPercent,
              RAM_WARNING_PERCENT,
              RAM_DANGER_PERCENT,
            )
          "
          >{{ formatResourcePercent(appUsageState.ramPercent) }}</span
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
  /* Fixed width, right-aligned — both CPU and RAM show 1 decimal (a whole
     percent has no useful resolution at app scale; a 2nd decimal digit
     would be noise, not signal) and must not reflow the icon/label before
     them or the next metric after them. tabular-nums above already keeps
     each digit's own width constant; this covers the digit *count* and
     decimal point changing too. */
  display: inline-block;
  width: 6ch; /* "100.0%" */
  text-align: right;
}

.app-title-bar__resource-value--warning {
  color: var(--ui-color-warning);
}

.app-title-bar__resource-value--danger {
  color: var(--ui-color-danger);
}

.app-title-bar__resource-value--info {
  color: var(--ui-color-info);
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

<script setup>
import { computed, onMounted } from 'vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import {
  Cpu,
  ICON_SIZE,
  MemoryStick,
  MonitorUp,
  Moon,
  Sun,
} from '../../icons/index.js';
import { useObsIntegration } from '../../composables/useObsIntegration.js';
import { useElapsedClock } from '../../composables/useElapsedClock.js';
import { usePerformerSelfView } from '../../composables/usePerformerSelfView.js';
import { useAppUsage } from '../../composables/useAppUsage.js';
import { useTheme } from '../../composables/useTheme.js';
import { formatElapsedClock } from '../../utils/format.js';

const { theme, toggleTheme } = useTheme();
const { state: performerState, open: openPerformerView } =
  usePerformerSelfView();
const { state: appUsageState, refreshAppUsage } = useAppUsage();
const { state: obsState, refreshObsStatus } = useObsIntegration();
onMounted(refreshAppUsage);
onMounted(refreshObsStatus);

const isObsConnected = computed(() =>
  ['ready', 'degraded'].includes(obsState.observed.lifecycle),
);
const isObsLive = computed(
  () => isObsConnected.value && obsState.observed.streaming.active,
);
const isObsRecording = computed(
  () => isObsConnected.value && obsState.observed.recording.active,
);

// Local wall-clock extrapolation from OBS's own outputDuration reading, not
// a re-poll of OBS — see useElapsedClock.js. obsAdapter.js only refreshes
// the source value at a connect or an on-demand snapshot (never a ticking
// poll, per integration-adapter-contract.md's "reacts to semantic
// boundaries" principle); this interpolates smoothly between those points
// instead of visibly freezing. Called once here, not inside a computed —
// useElapsedClock is itself a composable (onMounted/onUnmounted/watch) and
// must run exactly once at setup, same as any other composable call.
const liveElapsedMs = useElapsedClock(() =>
  isObsLive.value ? obsState.observed.streaming.durationMs : null,
);
const recordElapsedMs = useElapsedClock(() =>
  isObsRecording.value ? obsState.observed.recording.durationMs : null,
);
// formatElapsedClock() returns '' while inactive (its source is null) — the
// badge itself must never be blank at rest, so this falls back to a resting
// "00:00:00". The badge's own CSS already colors it text-muted by default
// and only switches to warning／info once the --live／--rec modifier class
// is active, so this fallback naturally renders gray until then.
const liveElapsedLabel = computed(
  () => formatElapsedClock(liveElapsedMs.value) || '00:00:00',
);
const recordElapsedLabel = computed(
  () => formatElapsedClock(recordElapsedMs.value) || '00:00:00',
);

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
    <div class="app-title-bar__status">
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
    </div>

    <div class="app-title-bar__trailing">
      <!-- Absent only while there's no OBS connection at all this session —
           once connected, both badges stay put (LIVE/REC label + dot turn
           gray at rest instead of disappearing) so neither their own
           content nor the buttons next to them ever shift as state
           changes. -->
      <div
        v-if="isObsConnected"
        class="app-title-bar__obs"
        role="group"
        aria-label="OBS 直播／錄影狀態"
      >
        <span
          class="app-title-bar__obs-badge"
          :class="{ 'app-title-bar__obs-badge--live': isObsLive }"
        >
          <span class="app-title-bar__obs-dot" aria-hidden="true"></span>
          <span class="app-title-bar__obs-label">LIVE</span>
          <span class="app-title-bar__obs-time">{{ liveElapsedLabel }}</span>
        </span>
        <UiSeparator orientation="vertical" />
        <span
          class="app-title-bar__obs-badge"
          :class="{ 'app-title-bar__obs-badge--rec': isObsRecording }"
        >
          <span class="app-title-bar__obs-dot" aria-hidden="true"></span>
          <span class="app-title-bar__obs-label">REC</span>
          <span class="app-title-bar__obs-time">{{ recordElapsedLabel }}</span>
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

.app-title-bar__status {
  position: absolute;
  top: 0;
  left: var(--ui-space-3);
  height: 100%;
  display: flex;
  align-items: center;
}

.app-title-bar__resources {
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

.app-title-bar__trailing {
  /* Shrink-to-fit (right set, no left/width) — a *sized* no-drag div
     here (tried first, via width: env(titlebar-area-width, 100%)) silently
     grows to the full bar on a bad env() read and kills window dragging.
     Only the position depends on env() now; the box stays button-sized.
     Owns the position/no-drag/edge-inset that used to live directly on
     .app-title-bar__controls, now shared with the OBS badge group next to
     it. */
  position: absolute;
  top: 0;
  right: calc(100% - env(titlebar-area-width, 100%));
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding-right: var(--ui-space-2);
  app-region: no-drag;
  -webkit-app-region: no-drag;
}

.app-title-bar__obs {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

.app-title-bar__obs-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.app-title-bar__obs-time {
  /* Fixed width, right-aligned — same numeric convention as CPU/RAM's own
     value span. formatElapsedClock() always returns a constant
     8-character HH:MM:SS (see its own comment), so the width never
     actually needs to grow as hours roll over; still reserved (not just
     relying on the fixed digit count) as a buffer against ch's glyph-width
     assumption not landing pixel-exact for the colons. */
  display: inline-block;
  width: 8ch; /* "00:00:00" */
  text-align: right;
  color: var(--ui-color-text-muted);
}

.app-title-bar__obs-label {
  /* Fixed width covers both "LIVE" and "REC" so the time after it always
     starts at the same x position regardless of which badge it is.
     Centered, not left-aligned, so the shorter "REC" doesn't read as
     flush against the dot while "LIVE" fills the box edge to edge. */
  display: inline-block;
  width: 2.25rem;
  text-align: center;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-semibold);
}

.app-title-bar__obs-dot {
  flex-shrink: 0;
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-text-muted);
}

/* Resting (gray/disabled) is the default above; active state repaints the
   dot／label／time together. Deliberately danger (red), the conventional
   broadcast-software LIVE／REC color, at the owner's explicit call — this
   knowingly departs from DESIGN.md's "Coral must not be used as a
   recording dot" rule (written to avoid colliding with coral's other job
   as the current-playback cue／focus ring elsewhere in the app); the doc
   itself hasn't been updated to match yet. */
.app-title-bar__obs-badge--live .app-title-bar__obs-time,
.app-title-bar__obs-badge--live .app-title-bar__obs-label,
.app-title-bar__obs-badge--rec .app-title-bar__obs-time,
.app-title-bar__obs-badge--rec .app-title-bar__obs-label {
  color: var(--ui-color-danger);
}

.app-title-bar__obs-badge--live .app-title-bar__obs-dot,
.app-title-bar__obs-badge--rec .app-title-bar__obs-dot {
  background: var(--ui-color-danger);
}

.app-title-bar__controls {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>

<script setup>
import { computed } from 'vue';
import UiChip from '../ui/UiChip.vue';
import {
  benchmarkM2Presentation,
  benchmarkPlayheadPercent,
  formatBenchmarkTime,
  projectBenchmarkSections,
} from '../../utils/musicAnalysisBenchmark.js';

const props = defineProps({
  durationMs: { type: Number, required: true },
  currentTimeMs: { type: Number, default: 0 },
  m2Status: { type: String, required: true },
  sections: { type: Array, default: () => [] },
});
const emit = defineEmits(['seek']);

const projectedSections = computed(() =>
  projectBenchmarkSections(props.sections, props.durationMs),
);
const playheadPercent = computed(() =>
  benchmarkPlayheadPercent(props.currentTimeMs, props.durationMs),
);
const status = computed(() => benchmarkM2Presentation(props.m2Status));

function seekTo(section) {
  emit('seek', section.startMs);
}
</script>

<template>
  <section
    class="benchmark-timeline"
    aria-labelledby="benchmark-timeline-title"
  >
    <div class="benchmark-timeline__heading">
      <div class="benchmark-timeline__title-group">
        <h3 id="benchmark-timeline-title" class="benchmark-timeline__title">
          預測段落
        </h3>
        <p class="benchmark-timeline__status-copy">{{ status.message }}</p>
      </div>
      <UiChip :tone="status.tone">{{ status.label }}</UiChip>
    </div>

    <div
      v-if="projectedSections.length"
      class="benchmark-timeline__track"
      role="group"
      aria-label="預測段落時間軸"
    >
      <button
        v-for="section in projectedSections"
        :key="section.key"
        class="benchmark-timeline__segment"
        :class="[
          `benchmark-timeline__segment--${section.role}`,
          { 'benchmark-timeline__segment--low': section.lowConfidence },
        ]"
        type="button"
        :style="{
          left: `${section.startPercent}%`,
          width: `${section.widthPercent}%`,
        }"
        :aria-label="section.ariaLabel"
        :title="section.ariaLabel"
        @click="seekTo(section)"
      >
        <span v-if="section.showInsideLabel" aria-hidden="true">
          {{ section.roleLabel }}
        </span>
      </button>
      <span
        class="benchmark-timeline__playhead"
        :style="{ left: `${playheadPercent}%` }"
        aria-hidden="true"
      />
    </div>

    <p v-else class="benchmark-timeline__empty">沒有可顯示的候選段落。</p>

    <div v-if="projectedSections.length" class="benchmark-timeline__ruler">
      <span>0:00</span>
      <span>{{ formatBenchmarkTime(durationMs / 2) }}</span>
      <span>{{ formatBenchmarkTime(durationMs) }}</span>
    </div>

    <ol v-if="projectedSections.length" class="benchmark-timeline__list">
      <li v-for="section in projectedSections" :key="`row-${section.key}`">
        <button
          class="benchmark-timeline__row"
          type="button"
          :aria-label="`跳到${section.ariaLabel}`"
          @click="seekTo(section)"
        >
          <span class="benchmark-timeline__role">
            {{ section.roleLabel }}
          </span>
          <span class="benchmark-timeline__time">
            {{ formatBenchmarkTime(section.startMs) }}–{{
              formatBenchmarkTime(section.endMs)
            }}
          </span>
          <span class="benchmark-timeline__confidence">
            {{ section.confidencePercent }}%
          </span>
          <UiChip v-if="section.lowConfidence" tone="warning">低信心</UiChip>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.benchmark-timeline {
  display: grid;
  gap: var(--ui-space-3);
}

.benchmark-timeline__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.benchmark-timeline__title-group {
  display: grid;
  gap: var(--ui-space-1);
}

.benchmark-timeline__title,
.benchmark-timeline__status-copy,
.benchmark-timeline__empty {
  margin: 0;
}

.benchmark-timeline__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.benchmark-timeline__status-copy,
.benchmark-timeline__empty,
.benchmark-timeline__ruler {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.benchmark-timeline__track {
  position: relative;
  height: 5rem;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
}

.benchmark-timeline__segment {
  position: absolute;
  inset-block: 0;
  min-width: 2px;
  overflow: hidden;
  padding: 0 var(--ui-space-1);
  border: 0;
  border-inline-end: var(--ui-border-width) solid
    color-mix(in srgb, var(--ui-color-surface) 70%, transparent);
  background: var(--benchmark-role-color, var(--ui-color-accent));
  color: var(--ui-color-accent-contrast);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: filter var(--ui-motion-fast) var(--ui-motion-ease);
}

.benchmark-timeline__segment:hover {
  filter: brightness(1.12);
}

.benchmark-timeline__segment:focus-visible,
.benchmark-timeline__row:focus-visible {
  z-index: 3;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.benchmark-timeline__segment--intro {
  --benchmark-role-color: var(--ui-color-info);
}

.benchmark-timeline__segment--verse {
  --benchmark-role-color: var(--ui-color-accent);
}

.benchmark-timeline__segment--pre-chorus {
  --benchmark-role-color: color-mix(
    in srgb,
    var(--ui-color-accent) 55%,
    var(--ui-color-warning)
  );
}

.benchmark-timeline__segment--chorus {
  --benchmark-role-color: var(--ui-color-success);
}

.benchmark-timeline__segment--bridge {
  --benchmark-role-color: var(--ui-color-warning);
}

.benchmark-timeline__segment--instrumental {
  --benchmark-role-color: var(--ui-color-border-strong);
}

.benchmark-timeline__segment--outro,
.benchmark-timeline__segment--unknown {
  --benchmark-role-color: var(--ui-color-current);
}

.benchmark-timeline__segment--low {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0,
    transparent 5px,
    color-mix(in srgb, var(--ui-color-surface) 45%, transparent) 5px,
    color-mix(in srgb, var(--ui-color-surface) 45%, transparent) 9px
  );
  box-shadow: inset 0 0 0 2px var(--ui-color-warning);
}

.benchmark-timeline__playhead {
  position: absolute;
  z-index: 2;
  inset-block: 0;
  width: 2px;
  background: var(--ui-color-text);
  box-shadow: 0 0 0 1px
    color-mix(in srgb, var(--ui-color-surface) 55%, transparent);
  pointer-events: none;
}

.benchmark-timeline__ruler {
  display: flex;
  justify-content: space-between;
  margin-top: calc(-1 * var(--ui-space-2));
  font-variant-numeric: tabular-nums;
}

.benchmark-timeline__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.benchmark-timeline__row {
  display: grid;
  grid-template-columns: minmax(7rem, 1fr) auto 3.5rem auto;
  gap: var(--ui-space-3);
  align-items: center;
  width: 100%;
  min-height: var(--ui-menu-item-height);
  padding: 0 var(--ui-space-2);
  border: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.benchmark-timeline__row:hover {
  background: var(--ui-color-surface-hover);
}

.benchmark-timeline__role {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
}

.benchmark-timeline__time,
.benchmark-timeline__confidence {
  font-variant-numeric: tabular-nums;
}

.benchmark-timeline__confidence {
  text-align: end;
}

@media (max-width: 720px) {
  .benchmark-timeline__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .benchmark-timeline__confidence,
  .benchmark-timeline__row :deep(.ui-chip) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .benchmark-timeline__segment {
    transition: none;
  }
}
</style>

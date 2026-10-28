<script setup>
// Decision specimen: the Music Structure section list currently borrows the
// menu-item height. Both candidates render the real summary side by side.
import MusicStructureSummary from '../analysis/MusicStructureSummary.vue';

const SAMPLE_RESULT = Object.freeze({
  trackId: 'demo-track',
  sourceRevision: 'demo'.repeat(16),
  sourceDurationMs: 214000,
  signals: {
    level: 'M2',
    reason: 'current',
    tempo: { bpm: 128, confidence: 0.88 },
    beats: [
      { timeMs: 0, downbeat: true },
      { timeMs: 470, downbeat: false },
    ],
    sections: [
      {
        sectionId: 's1',
        startMs: 0,
        endMs: 16000,
        role: 'intro',
        confidence: 0.82,
      },
      {
        sectionId: 's2',
        startMs: 16000,
        endMs: 52000,
        role: 'verse',
        confidence: 0.77,
      },
      {
        sectionId: 's3',
        startMs: 52000,
        endMs: 68000,
        role: 'pre-chorus',
        confidence: 0.64,
      },
      {
        sectionId: 's4',
        startMs: 68000,
        endMs: 100000,
        role: 'chorus',
        confidence: 0.91,
      },
      {
        sectionId: 's5',
        startMs: 100000,
        endMs: 136000,
        role: 'verse',
        confidence: 0.73,
      },
      {
        sectionId: 's6',
        startMs: 136000,
        endMs: 168000,
        role: 'chorus',
        confidence: 0.89,
      },
      {
        sectionId: 's7',
        startMs: 168000,
        endMs: 214000,
        role: 'outro',
        confidence: 0.7,
      },
    ],
  },
});

const CANDIDATES = Object.freeze([
  {
    key: 'floating-row',
    label: '32px · 選單列高（--ui-floating-row-min-height）',
    height: 'var(--ui-floating-row-min-height)',
  },
  {
    key: 'control',
    label: '36px · 控制項高度（--ui-control-height）',
    height: 'var(--ui-control-height)',
  },
]);
</script>

<template>
  <div class="demo-structure-row-height">
    <figure
      v-for="candidate in CANDIDATES"
      :key="candidate.key"
      class="demo-structure-row-height__candidate"
      :data-row-height-candidate="candidate.key"
      :style="{ '--ui-menu-item-height': candidate.height }"
    >
      <figcaption class="demo-structure-row-height__label">
        {{ candidate.label }}
      </figcaption>
      <MusicStructureSummary :result="SAMPLE_RESULT" />
    </figure>
  </div>
</template>

<style scoped>
.demo-structure-row-height {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--ui-space-5);
}

.demo-structure-row-height__candidate {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
  margin: 0;
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.demo-structure-row-height__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>

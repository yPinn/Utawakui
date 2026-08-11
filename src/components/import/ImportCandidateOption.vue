<script setup>
import { computed } from 'vue';
import { Music, Video } from '@lucide/vue';
import {
  candidateId,
  candidateSourceLabel,
  confidenceLabel,
  formatDuration,
} from '../../utils/importCandidateDisplay.js';
import { ICON_SIZE } from '../../constants/ui.js';

const props = defineProps({
  candidate: {
    type: Object,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  recommended: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  tabindex: {
    type: Number,
    default: -1,
  },
});

const emit = defineEmits(['select']);

const durationLabel = computed(() => formatDuration(props.candidate.duration));
const isMusicPlatform = computed(
  () =>
    props.candidate.searchProvider === 'yt-music' ||
    props.candidate.playbackKind?.startsWith('yt-music'),
);
const platformIcon = computed(() => (isMusicPlatform.value ? Music : Video));
const title = computed(() => props.candidate.title || '未命名歌曲');
const metaParts = computed(() =>
  [props.candidate.artist, durationLabel.value].filter(Boolean),
);
</script>

<template>
  <button
    type="button"
    class="candidate-option"
    :class="{ 'candidate-option--selected': selected }"
    :aria-checked="selected"
    :disabled="disabled"
    :tabindex="tabindex"
    :data-radio-id="candidateId(candidate)"
    role="radio"
    @click="emit('select', candidateId(candidate))"
  >
    <span
      class="platform-badge"
      :class="{ 'platform-badge--music': isMusicPlatform }"
    >
      <component :is="platformIcon" :size="ICON_SIZE" aria-hidden="true" />
      <span class="platform-badge__label">
        {{ candidateSourceLabel(candidate) }}
      </span>
    </span>

    <span class="candidate-option__main">
      <span class="candidate-option__title">{{ title }}</span>
      <span class="candidate-option__meta">
        <span v-for="part in metaParts" :key="part">{{ part }}</span>
      </span>
    </span>

    <span class="candidate-option__chips">
      <span v-if="selected" class="candidate-chip candidate-chip--selected">
        已選
      </span>
      <span v-else-if="recommended" class="candidate-chip">建議</span>
      <span class="candidate-chip">
        {{ confidenceLabel(candidate.confidence) }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.candidate-option {
  --candidate-border-width: calc(var(--ui-space-1) / 4);

  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  min-height: calc(var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2));
  padding: var(--ui-space-2);
  border: var(--candidate-border-width) solid transparent;
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.candidate-option:hover {
  background: var(--ui-surface-hover);
}

.candidate-option:disabled {
  cursor: default;
  opacity: 0.65;
}

.candidate-option:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: var(--candidate-border-width);
}

.candidate-option--selected {
  border-color: var(--ui-accent);
}

.platform-badge,
.candidate-chip,
.candidate-option__meta {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.platform-badge {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-surface);
  white-space: nowrap;
}

.platform-badge--music {
  color: var(--ui-accent);
}

.platform-badge__label {
  min-width: 0;
}

.candidate-option__main {
  min-width: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.candidate-option__title,
.candidate-option__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-option__title {
  color: var(--ui-text);
  font-weight: var(--ui-font-weight-strong);
}

.candidate-option__meta {
  display: flex;
  gap: var(--ui-space-2);
}

.candidate-option__chips {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
}

.candidate-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-surface);
  white-space: nowrap;
}

.candidate-chip--selected {
  color: var(--ui-accent-contrast);
  background: var(--ui-accent);
}

@media (max-width: 680px) {
  .candidate-option {
    grid-template-columns: 1fr;
  }

  .candidate-option__chips {
    justify-content: flex-start;
  }
}
</style>

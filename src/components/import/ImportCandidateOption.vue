<script setup>
import { computed } from 'vue';
import { ICON_SIZE, Music, Video } from '../../icons/index.js';
import {
  candidateId,
  candidateSourceLabel,
  formatViewCount,
  playbackKindLabel,
} from '../../utils/importCandidateDisplay.js';
import { formatDuration } from '../../utils/format.js';
import UiChip from '../ui/UiChip.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

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

// '' fallback (not the default '--:--') preserves this component's prior
// behavior of hiding an unknown duration rather than showing a placeholder.
const durationLabel = computed(() =>
  formatDuration(props.candidate.duration, ''),
);
const viewCountLabel = computed(() =>
  formatViewCount(props.candidate.viewCount),
);
const isMusicPlatform = computed(
  () =>
    props.candidate.availableProviders?.includes('yt-music') ||
    props.candidate.searchProvider === 'yt-music' ||
    props.candidate.playbackKind?.startsWith('yt-music'),
);
const platformIcon = computed(() => (isMusicPlatform.value ? Music : Video));
const title = computed(() => props.candidate.title || '未命名歌曲');
const versionLabel = computed(() =>
  playbackKindLabel(props.candidate.playbackKind),
);
const metaParts = computed(() =>
  [props.candidate.artist, durationLabel.value, viewCountLabel.value].filter(
    Boolean,
  ),
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
    <UiTrackThumb
      :track="candidate"
      size="calc(var(--ui-space-5) + var(--ui-space-2))"
    />

    <UiChip
      class="platform-badge"
      background="var(--ui-color-surface)"
      :color="isMusicPlatform ? 'var(--ui-color-accent)' : undefined"
    >
      <component :is="platformIcon" :size="ICON_SIZE" aria-hidden="true" />
      <span class="platform-badge__label">
        {{ candidateSourceLabel(candidate) }}
      </span>
    </UiChip>

    <span class="candidate-option__main">
      <span class="candidate-option__title">{{ title }}</span>
      <span class="candidate-option__meta">
        <span v-for="part in metaParts" :key="part">{{ part }}</span>
      </span>
    </span>

    <span class="candidate-option__chips">
      <UiChip
        v-if="selected"
        background="var(--ui-color-accent)"
        color="var(--ui-color-accent-contrast)"
      >
        已選
      </UiChip>
      <UiChip v-else-if="recommended" background="var(--ui-color-surface)">
        建議
      </UiChip>
      <UiChip background="var(--ui-color-surface)">
        {{ versionLabel }}
      </UiChip>
    </span>
  </button>
</template>

<style scoped>
.candidate-option {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  min-height: calc(var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2));
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.candidate-option:hover {
  background: var(--ui-color-surface-hover);
}

.candidate-option:disabled {
  color: var(--ui-color-text-muted);
  cursor: default;
  opacity: var(--ui-opacity-disabled);
}

.candidate-option:focus-visible {
  /* Inset, not outset — this is a v-for'd list row in a tightly-packed
     column (.candidate-options), same rule as QueueTrackButton.vue's ring:
     an outward offset gets clipped by the small gap to neighboring rows. */
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.candidate-option--selected {
  border-color: var(--ui-color-accent);
}

.candidate-option__meta {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
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
  color: var(--ui-color-text);
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

@media (max-width: 680px) {
  .candidate-option {
    grid-template-columns: 1fr;
  }

  .candidate-option__chips {
    justify-content: flex-start;
  }
}
</style>

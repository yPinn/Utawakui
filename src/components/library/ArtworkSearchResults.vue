<script setup>
import { computed } from 'vue';
import { projectArtworkCandidate } from '../../utils/artworkCandidateDisplay.js';
import UiChip from '../ui/UiChip.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  candidates: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);

const displayCandidates = computed(() =>
  props.candidates.map((candidate) => ({
    candidate,
    display: projectArtworkCandidate(candidate),
    track: {
      title: candidate.releaseTitle,
      artist: candidate.artistCredit,
      thumbnailUrl: candidate.previewUrl,
    },
  })),
);
</script>

<template>
  <div class="artwork-results" role="radiogroup" aria-label="線上封面候選">
    <article
      v-for="{ candidate, display, track } in displayCandidates"
      :key="candidate.id"
      class="artwork-results__row"
      :class="{
        'is-selected': selectedId === candidate.id,
      }"
    >
      <button
        type="button"
        class="artwork-results__select"
        role="radio"
        :aria-checked="selectedId === candidate.id"
        :disabled="disabled"
        @click="emit('select', candidate.id)"
      >
        <UiTrackThumb
          class="artwork-results__thumb"
          :class="{ 'is-loading': candidate.previewLoading }"
          :track="track"
          size="3.5rem"
          :decorative="false"
          :aria-label="`${display.title}封面`"
        >
          <template v-if="candidate.previewLoading" #overlay>
            <UiArtworkLoading :label="`${display.title}封面載入中`" />
          </template>
        </UiTrackThumb>

        <span class="artwork-results__copy">
          <span class="artwork-results__heading">
            <UiOverflowTooltip
              class="artwork-results__title"
              :text="display.title"
            >
              {{ display.title }}
            </UiOverflowTooltip>
            <UiChip :tone="display.decisionTone">
              {{ display.decisionLabel }}
            </UiChip>
          </span>
          <UiOverflowTooltip
            class="artwork-results__artist"
            :text="display.artist"
          >
            {{ display.artist }}
          </UiOverflowTooltip>
          <span class="artwork-results__meta">{{ display.releaseMeta }}</span>
          <span v-if="display.reason" class="artwork-results__reason">
            {{ display.reason }}
          </span>
        </span>
      </button>
    </article>
  </div>
</template>

<style scoped>
.artwork-results {
  min-width: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.artwork-results__row {
  min-width: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.artwork-results__row:last-child {
  border-bottom: 0;
}

.artwork-results__row.is-selected {
  background: var(--ui-color-surface-selected);
}

.artwork-results__select {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2);
  border: 0;
  background: transparent;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.artwork-results__select:disabled {
  cursor: default;
  opacity: var(--ui-opacity-disabled);
}

.artwork-results__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-radius-md);
}

.artwork-results__thumb {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.artwork-results__copy {
  min-width: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.artwork-results__heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.artwork-results__title,
.artwork-results__artist,
.artwork-results__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artwork-results__title {
  flex: 1 1 auto;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.artwork-results__artist,
.artwork-results__meta,
.artwork-results__reason {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.artwork-results__reason {
  overflow-wrap: anywhere;
}
</style>

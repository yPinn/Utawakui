<script setup>
import { Volume2 } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

defineProps({
  title: { type: String, required: true },
  tracks: { type: Array, default: () => [] },
  currentTrackId: { type: String, default: null },
  showArtwork: { type: Boolean, default: true },
});
</script>

<template>
  <div class="studio-track-table">
    <div class="studio-track-table__header" aria-hidden="true">
      <span>#</span>
      <span>曲目</span>
      <span>來源</span>
      <span>時間</span>
    </div>

    <ul
      class="studio-track-table__body"
      :aria-label="`${title}曲目`"
      role="list"
    >
      <li
        v-for="(track, index) in tracks"
        :key="track.id"
        class="studio-track-row"
        :class="{
          'studio-track-row--current': currentTrackId === track.id,
        }"
        role="listitem"
        :aria-current="currentTrackId === track.id ? 'true' : undefined"
      >
        <span class="studio-track-row__index" aria-hidden="true">
          <Volume2
            v-if="currentTrackId === track.id"
            :size="16"
            aria-hidden="true"
          />
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span class="studio-track-row__identity">
          <UiTrackThumb
            v-if="showArtwork"
            :track="track"
            size="var(--ui-track-artwork-size)"
          />
          <span class="studio-track-row__copy">
            <strong>{{ track.title }}</strong>
            <small>{{ track.artist || '未知演出者' }}</small>
          </span>
        </span>
        <span class="studio-track-row__source">
          {{ formatStudioTrackSource(track) }}
        </span>
        <span class="studio-track-row__duration">
          {{ formatDuration(track.duration) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.studio-track-table {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.studio-track-table__header,
.studio-track-row {
  display: grid;
  grid-template-columns: 2.25rem minmax(12rem, 1fr) 7rem 4.5rem;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-track-table__header {
  position: sticky;
  z-index: var(--ui-z-sticky);
  top: 0;
  min-height: var(--ui-list-header-height);
  padding: 0 var(--ui-space-2);
  color: var(--ui-color-text-muted);
  background: var(--ui-color-surface);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-track-table__header > :last-child {
  text-align: right;
}

.studio-track-table__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-1) 0 0;
  list-style: none;
}

.studio-track-row {
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  border-radius: var(--ui-radius-md);
}

.studio-track-row:hover {
  color: var(--ui-color-text);
  background: var(--ui-color-surface-hover);
}

.studio-track-row--current {
  background: var(--ui-color-current-soft);
}

.studio-track-row--current .studio-track-row__index,
.studio-track-row--current .studio-track-row__copy strong {
  color: var(--ui-color-current);
}

.studio-track-row__index {
  display: grid;
  place-items: center;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.studio-track-row__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.studio-track-row__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.studio-track-row__copy strong,
.studio-track-row__copy small,
.studio-track-row__source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-track-row__copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-track-row__copy small,
.studio-track-row__source,
.studio-track-row__duration {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-track-row__duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@container dossier (max-width: 45rem) {
  .studio-track-table__header,
  .studio-track-row {
    grid-template-columns: 2rem minmax(0, 1fr) 4.25rem;
  }

  .studio-track-table__header > :nth-child(3),
  .studio-track-row__source {
    display: none;
  }
}

@container dossier (max-width: 34rem) {
  .studio-track-table__header,
  .studio-track-row {
    grid-template-columns: 2rem minmax(0, 1fr);
  }

  .studio-track-table__header > :last-child,
  .studio-track-row__duration {
    display: none;
  }
}
</style>

<script setup>
import { computed } from 'vue';
import { trackArtistText } from '../../utils/artistPage.js';
import { formatDuration } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import TrackArtistCredits from '../track/TrackArtistCredits.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  row: { type: Object, required: true },
});
const emit = defineEmits(['locate', 'navigate']);
const creditTrack = computed(() => {
  const { track, key, artist } = props.row;
  return trackArtistText(track)
    ? track
    : { ...track, id: track?.id ?? key, artist };
});
const artistText = computed(() => trackArtistText(creditTrack.value));
const source = computed(() =>
  props.row.isMusicVideo
    ? t('session.archive.musicVideo')
    : props.row.statusDetail,
);
const duration = computed(() => props.row.track?.duration);
</script>

<template>
  <UiTrackRow
    class="performance-archive-track"
    :class="{ 'performance-archive-track--video': row.isMusicVideo }"
    :data-occurrence-id="row.key"
    :track="creditTrack"
    :title="row.title"
    :artist="artistText || source"
    :title-clickable="Boolean(row.track)"
    :title-aria-label="
      row.track
        ? t('session.archive.locateTrack', { title: row.title })
        : undefined
    "
    :state-surface="Boolean(row.track)"
    hide-duration
    :thumb-width="row.isMusicVideo ? 'var(--archive-artwork-lane)' : undefined"
    thumb-loading="lazy"
    thumb-decoding="async"
    overflow="ellipsis"
    @title-click="emit('locate', row)"
  >
    <template #lead>
      <span class="performance-archive-track__ordinal" aria-hidden="true">{{
        row.ordinal
      }}</span>
    </template>
    <template #artist>
      <span class="performance-archive-track__credits">
        <TrackArtistCredits
          v-if="artistText"
          :track="creditTrack"
          :navigable="Boolean(row.track)"
          @navigate="emit('navigate')"
        />
        <span v-if="source" class="performance-archive-track__source">{{
          source
        }}</span>
      </span>
    </template>
    <template #trail>
      <span class="performance-archive-track__result">
        <span v-if="duration > 0" class="performance-archive-track__duration">{{
          formatDuration(duration)
        }}</span>
        <span
          class="performance-archive-track__status"
          :class="{
            'performance-archive-track__status--interrupted':
              row.progress === 'interrupted',
          }"
          >{{ row.status }}</span
        >
      </span>
    </template>
  </UiTrackRow>
</template>

<style scoped>
.performance-archive-track {
  --archive-artwork-lane: calc(var(--ui-track-row-thumb-size) * 16 / 9);

  border-block-end: 1px solid var(--ui-color-border);
}

.performance-archive-track:not(.performance-archive-track--video)
  :deep(.ui-track__thumb) {
  margin-inline-end: calc(
    var(--archive-artwork-lane) - var(--ui-track-row-thumb-size)
  );
}

.performance-archive-track__ordinal {
  min-inline-size: 3ch;
  color: var(--ui-color-text-muted);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.performance-archive-track__credits {
  display: flex;
  align-items: baseline;
}

.performance-archive-track__source {
  flex: none;
}

.performance-archive-track__credits
  > *
  + .performance-archive-track__source::before {
  content: '·' / '';
  margin-inline: var(--ui-space-1);
}

.performance-archive-track__result {
  display: grid;
  min-inline-size: 5ch;
  justify-items: end;
  gap: var(--ui-space-1);
  padding-inline-start: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  white-space: nowrap;
}

.performance-archive-track__duration {
  font-variant-numeric: tabular-nums;
}

.performance-archive-track__status--interrupted {
  color: var(--ui-color-warning);
}
</style>

<script setup>
import { computed } from 'vue';
import { formatDuration } from '../../../utils/format.js';
import AppRightDockPanel from '../../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../../layout/AppRightDockSection.vue';
import TrackArtistPreview from './TrackArtistPreview.vue';
import TrackCapabilityMatrix from './TrackCapabilityMatrix.vue';
import TrackContextActions from './TrackContextActions.vue';
import TrackContextHero from './TrackContextHero.vue';
import TrackLyricsPreview from './TrackLyricsPreview.vue';
import TrackQueuePreview from './TrackQueuePreview.vue';
import UiHint from '../../ui/UiHint.vue';
import UiSeparator from '../../ui/UiSeparator.vue';
import UiTextButton from '../../ui/UiTextButton.vue';

const props = defineProps({
  currentTrack: { type: Object, default: null },
  queueSourceName: { type: String, default: '' },
  sourceLinkLabel: { type: String, default: '' },
  sourceNavigable: { type: Boolean, default: false },
  upcomingTracks: { type: Array, default: () => [] },
  queuedTrackIds: { type: Array, default: () => [] },
  playingTrackId: { type: String, default: '' },
  playerPlaying: { type: Boolean, default: false },
  lyricsPreview: { type: Object, default: null },
  lyricsLoading: { type: Boolean, default: false },
  artistSummary: { type: Object, default: null },
  readiness: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'collapse',
  'navigateSource',
  'openArtist',
  'openLyrics',
  'openQueue',
  'toggleQueueTrackPlayback',
]);

const queueContextLabel = computed(() => {
  if (props.queueSourceName) return props.queueSourceName;
  if (props.currentTrack || props.upcomingTracks.length > 0) return '目前佇列';
  return '尚未建立播放佇列';
});

const currentTrackFacts = computed(() => {
  if (!props.currentTrack) return [];

  const facts = [];
  if (props.currentTrack.album) {
    facts.push({ id: 'album', label: '專輯', value: props.currentTrack.album });
  }
  if (props.currentTrack.releaseYear) {
    facts.push({
      id: 'release-year',
      label: '年份',
      value: String(props.currentTrack.releaseYear),
    });
  }
  if (Number.isFinite(props.currentTrack.duration)) {
    facts.push({
      id: 'duration',
      label: '長度',
      value: formatDuration(props.currentTrack.duration),
    });
  }
  return facts;
});
</script>

<template>
  <AppRightDockPanel
    class="studio-context-inspector"
    title="播放資訊"
    collapse-label="摺疊播放資訊"
    aria-label="播放資訊"
    @collapse="emit('collapse')"
  >
    <template #identity>
      <div class="studio-context-inspector__source-identity">
        <UiTextButton
          v-if="sourceNavigable"
          class="studio-context-inspector__source-link"
          :text="queueContextLabel"
          :aria-label="sourceLinkLabel"
          overflow="ellipsis"
          @click="emit('navigateSource')"
        />
        <span v-else class="studio-context-inspector__source-label">
          {{ queueContextLabel }}
        </span>
      </div>
    </template>

    <TrackContextHero v-if="currentTrack" :track="currentTrack">
      <template #actions>
        <TrackContextActions :track="currentTrack" />
      </template>
    </TrackContextHero>

    <AppRightDockSection
      v-else
      class="studio-context-inspector__section studio-context-inspector__now"
      heading="目前歌曲"
      appearance="contained"
    >
      <UiHint class="studio-context-inspector__hint">
        目前沒有播放中的歌曲
      </UiHint>
    </AppRightDockSection>

    <TrackLyricsPreview
      v-if="currentTrack && (lyricsLoading || lyricsPreview?.lines?.length)"
      :preview="lyricsPreview"
      :artwork-url="currentTrack?.thumbnailUrl ?? ''"
      :loading="lyricsLoading"
      @open="emit('openLyrics')"
    />

    <TrackArtistPreview
      v-if="artistSummary"
      :summary="artistSummary"
      @open="emit('openArtist')"
    />

    <TrackQueuePreview
      v-if="upcomingTracks.length > 0"
      :tracks="upcomingTracks"
      :queued-track-ids="queuedTrackIds"
      :playing-track-id="playingTrackId"
      :player-playing="playerPlaying"
      @open="emit('openQueue')"
      @toggle-playback="emit('toggleQueueTrackPlayback', $event)"
    />

    <AppRightDockSection
      v-if="currentTrackFacts.length > 0 || readiness.length > 0"
      class="studio-context-inspector__section studio-context-inspector__details"
      heading="曲目資訊"
      appearance="contained"
    >
      <dl v-if="currentTrackFacts.length > 0">
        <div v-for="fact in currentTrackFacts" :key="fact.id">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>
      <UiSeparator
        v-if="currentTrackFacts.length > 0 && readiness.length > 0"
        class="studio-context-inspector__details-divider"
        decorative
      />
      <TrackCapabilityMatrix v-if="readiness.length > 0" :items="readiness" />
    </AppRightDockSection>
  </AppRightDockPanel>
</template>

<style scoped>
.studio-context-inspector {
  --ui-right-dock-section-surface-background: var(--ui-color-surface-raised);
}

.studio-context-inspector__details,
.studio-context-inspector__source-identity,
.studio-context-inspector__source-link,
.studio-context-inspector__source-label {
  min-width: 0;
}

.studio-context-inspector__source-identity {
  min-block-size: var(--ui-control-height);
  display: flex;
  align-items: center;
  padding-inline-start: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__source-link,
.studio-context-inspector__source-label {
  max-width: 100%;
}

.studio-context-inspector__source-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__details dl,
.studio-context-inspector__details dt,
.studio-context-inspector__details dd {
  margin: 0;
}

.studio-context-inspector__details dl {
  display: grid;
  gap: var(--ui-space-2);
}

.studio-context-inspector__details dl > div {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.studio-context-inspector__details dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__details dd {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__hint,
.studio-context-inspector__details dd {
  -webkit-user-select: none;
  user-select: none;
}
</style>

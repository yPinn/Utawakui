<script setup>
import { computed } from 'vue';
import { formatDuration } from '../../utils/format.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import TrackArtistPreview from './TrackArtistPreview.vue';
import TrackContextActions from './TrackContextActions.vue';
import TrackContextHero from './TrackContextHero.vue';
import TrackLyricsPreview from './TrackLyricsPreview.vue';
import TrackQueuePreview from './TrackQueuePreview.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  currentTrack: { type: Object, default: null },
  queueSourceName: { type: String, default: '' },
  sourceLinkLabel: { type: String, default: '' },
  sourceNavigable: { type: Boolean, default: false },
  upcomingTracks: { type: Array, default: () => [] },
  collection: { type: Object, default: null },
  lyricsPreview: { type: Object, default: null },
  artistSummary: { type: Object, default: null },
  readiness: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'close',
  'navigateSource',
  'openArtist',
  'openLyrics',
  'openQueue',
]);

const COLLECTION_COVER_SIZE = 120;

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
  facts.push({
    id: 'source',
    label: '來源',
    value: formatStudioTrackSource(props.currentTrack),
  });
  return facts;
});
</script>

<template>
  <AppRightDockPanel
    class="studio-context-inspector"
    title="播放資訊"
    :subtitle="queueContextLabel"
    close-label="關閉播放資訊"
    aria-label="播放資訊"
    @close="emit('close')"
  >
    <TrackContextHero
      v-if="currentTrack"
      :track="currentTrack"
      :source-name="queueContextLabel"
      :source-link-label="sourceLinkLabel"
      :source-navigable="sourceNavigable"
      @navigate-source="emit('navigateSource')"
    >
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
      <UiHint>目前沒有播放中的歌曲</UiHint>
    </AppRightDockSection>

    <TrackLyricsPreview
      v-if="lyricsPreview?.lines?.length"
      :preview="lyricsPreview"
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
      @open="emit('openQueue')"
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
      <ul
        v-if="readiness.length > 0"
        class="studio-context-inspector__readiness"
        aria-label="素材狀態"
      >
        <li v-for="item in readiness" :key="item.id">
          <UiChip :tone="item.tone">{{ item.label }}</UiChip>
        </li>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="collection"
      class="studio-context-inspector__section studio-context-inspector__collection"
      heading="播放來源"
      appearance="contained"
    >
      <UiCollageThumb
        class="studio-context-inspector__collection-cover"
        :cover-url="collection.coverUrl"
        :tracks="collection.tracks"
        :can-collage="collection.canCollage"
        :size="COLLECTION_COVER_SIZE"
      />
      <div class="studio-context-inspector__collection-copy">
        <h4>{{ collection.name }}</h4>
        <p v-if="collection.description">{{ collection.description }}</p>
      </div>
    </AppRightDockSection>
  </AppRightDockPanel>
</template>

<style scoped>
.studio-context-inspector__collection,
.studio-context-inspector__collection-copy,
.studio-context-inspector__details {
  min-width: 0;
}

.studio-context-inspector__collection h4,
.studio-context-inspector__collection p,
.studio-context-inspector__details dl,
.studio-context-inspector__details dt,
.studio-context-inspector__details dd,
.studio-context-inspector__readiness {
  margin: 0;
}

.studio-context-inspector__collection p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.studio-context-inspector__collection :deep(.app-right-dock-section__body) {
  justify-items: start;
}

.studio-context-inspector__collection-cover {
  box-shadow: var(--ui-shadow-contact);
}

.studio-context-inspector__collection-copy {
  display: grid;
  gap: var(--ui-space-1);
}

.studio-context-inspector__collection h4 {
  max-width: 100%;
  overflow: hidden;
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__collection p {
  max-inline-size: 32ch;
  font-weight: var(--ui-font-weight-regular);
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

.studio-context-inspector__readiness {
  margin: 0;
  padding: 0;
  list-style: none;
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
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__details dd {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__readiness {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.studio-context-inspector__section :deep(.ui-chip) {
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector :deep(.app-right-dock-header p),
.studio-context-inspector__section :deep(.ui-hint),
.studio-context-inspector__collection-copy,
.studio-context-inspector__details dd {
  -webkit-user-select: none;
  user-select: none;
}
</style>

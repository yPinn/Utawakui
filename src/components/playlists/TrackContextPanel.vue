<script setup>
import { computed } from 'vue';
import { Volume2 } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  currentTrack: { type: Object, default: null },
  queueSourceName: { type: String, default: '' },
  upcomingTracks: { type: Array, default: () => [] },
  collection: { type: Object, default: null },
  lyricsPreview: { type: Object, default: null },
  artistSummary: { type: Object, default: null },
  readiness: { type: Array, default: () => [] },
});

const emit = defineEmits(['close']);

const METADATA_QUEUE_PREVIEW_LIMIT = 3;
const COLLECTION_COVER_SIZE = 120;
const ARTIST_COVER_SIZE = 64;

const upcomingPreviewTracks = computed(() =>
  props.upcomingTracks.slice(0, METADATA_QUEUE_PREVIEW_LIMIT),
);
const queuePreviewLabel = computed(() =>
  props.upcomingTracks.length > METADATA_QUEUE_PREVIEW_LIMIT
    ? `接下來的播放佇列，顯示前 ${METADATA_QUEUE_PREVIEW_LIMIT} 首，共 ${props.upcomingTracks.length} 首`
    : '接下來的播放佇列',
);

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

const artistSummaryText = computed(() => {
  if (!props.artistSummary) return '';
  const album =
    props.artistSummary.albumCount > 0
      ? ` · ${props.artistSummary.albumCount} 張專輯`
      : '';
  return `本機收錄 ${props.artistSummary.trackCount} 首${album}`;
});

function formatUpcomingTrackMetadata(track) {
  const artist = track.artist || '未知演出者';
  if (!Number.isFinite(track.duration)) return artist;
  return `${artist} · ${formatDuration(track.duration)}`;
}
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
    <AppRightDockSection
      class="studio-context-inspector__section studio-context-inspector__now"
      heading="目前播放"
    >
      <template #trailing>
        <UiStatusIcon
          v-if="currentTrack"
          :icon="Volume2"
          tone="current"
          :label="`目前播放：${currentTrack.title}`"
          decorative
        />
      </template>

      <ul v-if="currentTrack" class="studio-context-inspector__identity-list">
        <UiTrackRow
          class="studio-context-inspector__now-identity"
          :track="currentTrack"
          current
          hide-duration
          overflow="ellipsis"
        />
      </ul>
      <UiHint v-else>目前沒有播放中的歌曲</UiHint>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="lyricsPreview?.lines?.length"
      class="studio-context-inspector__section studio-context-inspector__lyrics"
      heading="歌詞預覽"
      divided
    >
      <div class="studio-context-inspector__lyrics-lines">
        <p
          v-for="line in lyricsPreview.lines"
          :key="line.id"
          :class="{
            'studio-context-inspector__lyrics-line--active': line.active,
          }"
        >
          {{ line.text }}
        </p>
      </div>
      <p
        v-if="lyricsPreview.sourceLabel"
        class="studio-context-inspector__lyrics-source"
      >
        {{ lyricsPreview.sourceLabel }}
      </p>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="collection"
      class="studio-context-inspector__section studio-context-inspector__collection"
      heading="播放來源"
      divided
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

    <AppRightDockSection
      v-if="artistSummary"
      class="studio-context-inspector__section studio-context-inspector__artist"
      heading="本機藝人"
      divided
    >
      <div class="studio-context-inspector__artist-summary">
        <UiCollageThumb
          :tracks="artistSummary.tracks"
          :can-collage="false"
          :size="ARTIST_COVER_SIZE"
          radius="var(--ui-radius-pill)"
        />
        <div>
          <h4>{{ artistSummary.name }}</h4>
          <p>{{ artistSummaryText }}</p>
        </div>
      </div>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="upcomingTracks.length > 0"
      class="studio-context-inspector__section studio-context-inspector__queue"
      heading="接下來"
      divided
    >
      <template #trailing>
        <UiChip tone="muted">{{ upcomingTracks.length }} 首</UiChip>
      </template>
      <ol
        class="studio-context-inspector__queue-list"
        :aria-label="queuePreviewLabel"
      >
        <UiTrackRow
          v-for="(track, index) in upcomingPreviewTracks"
          :key="track.id ?? `${track.title}-${index}`"
          class="studio-context-inspector__queue-item"
          :track="track"
          :artist="formatUpcomingTrackMetadata(track)"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
        />
      </ol>
    </AppRightDockSection>

    <AppRightDockSection
      v-if="currentTrackFacts.length > 0 || readiness.length > 0"
      class="studio-context-inspector__section studio-context-inspector__details"
      heading="曲目資訊"
      divided
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
  </AppRightDockPanel>
</template>

<style scoped>
.studio-context-inspector__identity-list,
.studio-context-inspector__lyrics-lines,
.studio-context-inspector__collection,
.studio-context-inspector__collection-copy,
.studio-context-inspector__details {
  min-width: 0;
}

.studio-context-inspector__lyrics-lines p,
.studio-context-inspector__lyrics-source,
.studio-context-inspector__collection h4,
.studio-context-inspector__collection p,
.studio-context-inspector__artist h4,
.studio-context-inspector__artist p,
.studio-context-inspector__details dl,
.studio-context-inspector__details dt,
.studio-context-inspector__details dd,
.studio-context-inspector__queue-list,
.studio-context-inspector__readiness {
  margin: 0;
}

.studio-context-inspector__collection p,
.studio-context-inspector__artist p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.studio-context-inspector__lyrics-lines {
  display: grid;
  gap: var(--ui-space-2);
}

.studio-context-inspector__lyrics-lines p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-wrap: pretty;
}

.studio-context-inspector__lyrics-lines
  .studio-context-inspector__lyrics-line--active {
  color: var(--ui-color-text);
}

.studio-context-inspector__lyrics-source {
  margin-top: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-context-inspector__collection :deep(.app-right-dock-section__body) {
  display: grid;
  justify-items: start;
}

.studio-context-inspector__collection-cover {
  margin-bottom: var(--ui-space-2);
  box-shadow: var(--ui-shadow-contact);
}

.studio-context-inspector__collection-copy,
.studio-context-inspector__artist-summary > div {
  display: grid;
  gap: var(--ui-space-1);
}

.studio-context-inspector__collection h4,
.studio-context-inspector__artist h4 {
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

.studio-context-inspector__artist-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.studio-context-inspector__artist-summary > div {
  min-width: 0;
}

.studio-context-inspector__identity-list,
.studio-context-inspector__queue-list,
.studio-context-inspector__readiness {
  margin: 0;
  padding: 0;
  list-style: none;
}

.studio-context-inspector__queue-list {
  display: grid;
  gap: var(--ui-track-list-gap);
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
  margin-top: var(--ui-space-3);
}

.studio-context-inspector__section :deep(.ui-chip),
.studio-context-inspector__section :deep(.ui-status-icon) {
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__section :deep(.ui-hint),
.studio-context-inspector__identity-list :deep(.ui-track__info),
.studio-context-inspector__lyrics-lines,
.studio-context-inspector__lyrics-source,
.studio-context-inspector__collection-copy,
.studio-context-inspector__artist-summary,
.studio-context-inspector__queue-list :deep(.ui-track__info),
.studio-context-inspector__details dd {
  -webkit-user-select: text;
  user-select: text;
}
</style>

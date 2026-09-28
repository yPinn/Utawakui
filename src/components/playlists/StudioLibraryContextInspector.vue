<script setup>
import { computed } from 'vue';
import { Volume2 } from '../../icons/index.js';
import {
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useStudioLibraryInspectorWidth,
} from '../../composables/useStudioLibraryInspectorWidth.js';
import { formatDuration } from '../../utils/format.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import UiChip from '../ui/UiChip.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  currentTrack: { type: Object, default: null },
  queueSourceName: { type: String, default: '' },
  upcomingTracks: { type: Array, default: () => [] },
  // The playlist/album playback started from — only local data (name,
  // description, cover). null when playing from the general library view
  // (no specific collection to show), not merely "loading".
  collection: { type: Object, default: null },
});

const emit = defineEmits(['close']);

const inspectorWidth = useStudioLibraryInspectorWidth();
const METADATA_QUEUE_PREVIEW_LIMIT = 3;
const upcomingPreviewTracks = computed(() =>
  props.upcomingTracks.slice(0, METADATA_QUEUE_PREVIEW_LIMIT),
);
const queuePreviewLabel = computed(() =>
  props.upcomingTracks.length > METADATA_QUEUE_PREVIEW_LIMIT
    ? `接下來的播放佇列，顯示前 ${METADATA_QUEUE_PREVIEW_LIMIT} 首，共 ${props.upcomingTracks.length} 首`
    : '接下來的播放佇列',
);

// Unlike every other UiCollageThumb consumer (dossier header, details modal,
// setlist header), this one lives in a container the user can actually
// resize — so instead of one fixed number, the cover scales linearly across
// the panel's own draggable range. Endpoints reuse already-reviewed sizes
// (88 = StudioLibraryDossierHeader.vue, 120 = PlaylistDetailsModal.vue)
// rather than inventing new ones.
const COLLECTION_COVER_MIN = 88;
const COLLECTION_COVER_MAX = 120;
const collectionCoverSize = computed(() => {
  const range = INSPECTOR_WIDTH_MAX - INSPECTOR_WIDTH_MIN;
  const progress =
    range > 0 ? (inspectorWidth.width.value - INSPECTOR_WIDTH_MIN) / range : 0;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return Math.round(
    COLLECTION_COVER_MIN +
      (COLLECTION_COVER_MAX - COLLECTION_COVER_MIN) * clampedProgress,
  );
});

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

function formatUpcomingTrackMetadata(track) {
  const artist = track.artist || '未知演出者';
  if (!Number.isFinite(track.duration)) return artist;
  return `${artist} · ${formatDuration(track.duration)}`;
}
</script>

<template>
  <section class="studio-context-inspector" aria-label="播放資訊">
    <AppRightDockHeader
      title="播放資訊"
      :subtitle="queueContextLabel"
      close-label="關閉播放資訊"
      @close="emit('close')"
    />

    <div class="studio-context-inspector__scroll">
      <section
        v-if="collection"
        class="studio-context-inspector__section studio-context-inspector__collection"
        aria-labelledby="studio-context-collection-heading"
      >
        <UiCollageThumb
          class="studio-context-inspector__collection-cover"
          :cover-url="collection.coverUrl"
          :tracks="collection.tracks"
          :can-collage="collection.canCollage"
          :size="collectionCoverSize"
        />
        <h3 id="studio-context-collection-heading">{{ collection.name }}</h3>
        <p v-if="collection.description">{{ collection.description }}</p>
      </section>

      <section
        class="studio-context-inspector__section studio-context-inspector__current"
        aria-labelledby="studio-context-current-heading"
      >
        <div class="studio-context-inspector__section-heading">
          <h3 id="studio-context-current-heading">目前播放</h3>
          <UiStatusIcon
            v-if="currentTrack"
            :icon="Volume2"
            tone="current"
            :label="`目前播放：${currentTrack.title}`"
            decorative
          />
        </div>

        <template v-if="currentTrack">
          <ul class="studio-context-inspector__track-list">
            <UiTrackRow
              class="studio-context-inspector__current-track"
              :track="currentTrack"
              :artist="currentTrack.artist || '未知演出者'"
              current
              hide-duration
              overflow="ellipsis"
            />
          </ul>

          <dl v-if="currentTrackFacts.length > 0">
            <div v-for="fact in currentTrackFacts" :key="fact.id">
              <dt>{{ fact.label }}</dt>
              <dd>{{ fact.value }}</dd>
            </div>
          </dl>
        </template>
        <UiHint v-else>目前沒有播放中的歌曲</UiHint>
      </section>

      <section
        class="studio-context-inspector__section studio-context-inspector__queue"
        aria-labelledby="studio-context-queue-heading"
      >
        <div class="studio-context-inspector__section-heading">
          <h3 id="studio-context-queue-heading">接下來</h3>
          <UiChip v-if="upcomingTracks.length > 0" tone="muted">
            {{ upcomingTracks.length }} 首
          </UiChip>
        </div>

        <UiHint v-if="upcomingTracks.length === 0">佇列中沒有下一首</UiHint>
        <ol
          v-else
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
      </section>
    </div>
  </section>
</template>

<style scoped>
.studio-context-inspector {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  color: var(--ui-color-text);
}

.studio-context-inspector__section h3,
.studio-context-inspector__section p,
.studio-context-inspector__section dl,
.studio-context-inspector__section dt,
.studio-context-inspector__section dd,
.studio-context-inspector__queue-list {
  margin: 0;
}

.studio-context-inspector__scroll {
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.studio-context-inspector__section {
  padding: var(--ui-right-dock-content-inset);
}

.studio-context-inspector__section + .studio-context-inspector__section {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-context-inspector__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}

.studio-context-inspector__section-heading :deep(.ui-chip) {
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__section :deep(.ui-hint) {
  -webkit-user-select: text;
  user-select: text;
}

.studio-context-inspector__section h3 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-context-inspector__collection {
  display: grid;
  justify-items: start;
  gap: var(--ui-space-1);
}

.studio-context-inspector__collection-cover {
  margin-bottom: var(--ui-space-2);
  box-shadow: var(--ui-shadow-contact);
}

.studio-context-inspector__collection h3 {
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
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

.studio-context-inspector__section dt,
.studio-context-inspector__section dd {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.studio-context-inspector__section dt {
  color: var(--ui-color-text-muted);
}

.studio-context-inspector__current dl {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  padding-inline: var(--ui-track-row-padding-inline);
}

.studio-context-inspector__current dl div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--ui-space-3);
}

.studio-context-inspector__section dd {
  overflow: hidden;
  max-width: 10rem;
  font-weight: var(--ui-font-weight-semibold);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__track-list,
.studio-context-inspector__queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.studio-context-inspector__track-list :deep(.ui-track__info),
.studio-context-inspector__current dl dd,
.studio-context-inspector__collection p {
  -webkit-user-select: text;
  user-select: text;
}

.studio-context-inspector__section h3,
.studio-context-inspector__section dt {
  -webkit-user-select: none;
  user-select: none;
}
</style>

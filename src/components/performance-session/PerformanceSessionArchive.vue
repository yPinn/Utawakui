<script setup>
import { computed, onScopeDispose, shallowRef, toRef, watch } from 'vue';
import { Copy, Download, ImagePlus, RotateCcw } from '../../icons/index.js';
import { FOLDER_DOSSIER_ARTWORK_SIZE } from '../../constants/ui.js';
import { useAppView } from '../../composables/useAppView.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceArchive } from '../../composables/usePerformanceArchive.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import {
  performanceArchiveProgress,
  performanceArchiveRows,
  performanceArchiveTiming,
} from '../../utils/performanceArchivePresentation.js';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import AppFolderContentField from '../layout/AppFolderContentField.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import PerformanceArchiveTrackRow from './PerformanceArchiveTrackRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import CollectionActionRail from '../library/CollectionActionRail.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import { t } from '../../utils/i18n.js';
import PerformanceSessionPlatformVideos from './PerformanceSessionPlatformVideos.vue';

const props = defineProps({
  sessionId: { type: String, required: true },
  embedded: Boolean,
  allowSavePlaylist: Boolean,
});
const { session, loading, error, refresh } = usePerformanceArchive(
  toRef(props, 'sessionId'),
);
const { state: library } = useLibrary();
const emit = defineEmits(['navigate', 'session-name']);
watch(
  () => session.value?.name,
  (name) => {
    if (props.embedded && name) emit('session-name', name);
  },
  { immediate: true },
);
const { openLibraryContent, revealLibraryTrack } = useAppView();
const { canJumpToAlbum, jumpToAlbum } = useAlbumNavigation();
const playlists = usePlaylists();
const timeline = useObsSessionExport();
const { editArchiveCover } = usePerformanceSessionPlan();
const editingCover = shallowRef(false);
const coverError = shallowRef('');
const saving = shallowRef(false);
const saveError = shallowRef(false);
let disposed = false;
onScopeDispose(() => {
  disposed = true;
});
const rows = computed(() =>
  performanceArchiveRows(session.value, library.tracks),
);
const canSave = computed(() =>
  rows.value.some((row) => row.mode === 'library-track' && row.track),
);

function locateTrack({ track, isMusicVideo }) {
  if (!track) return;
  emit('navigate');
  if (!isMusicVideo && canJumpToAlbum(track)) {
    jumpToAlbum(track);
  } else {
    playlists.select(null);
    playlists.setLibraryView('all');
    openLibraryContent();
  }
  revealLibraryTrack(track.id);
}

async function changeCover(reset = false) {
  if (editingCover.value || !session.value?.endedAt) return;
  const id = session.value.id;
  coverError.value = '';
  editingCover.value = true;
  try {
    const saved = await editArchiveCover(id, {
      reset,
      onError: (message) => {
        if (!disposed && props.sessionId === id) coverError.value = message;
      },
    });
    if (saved && !disposed && props.sessionId === id) await refresh();
  } finally {
    editingCover.value = false;
  }
}

async function createPlaylist() {
  if (!canSave.value || saving.value) return;
  const sessionId = props.sessionId;
  saving.value = true;
  saveError.value = false;
  try {
    const result = await playlists.createFromPerformanceArchive(sessionId);
    if (disposed || props.sessionId !== sessionId) return;
    if (
      !result?.playlistId ||
      !playlists.state.playlists.some(({ id }) => id === result.playlistId)
    ) {
      saveError.value = true;
      return;
    }
    playlists.select(result.playlistId);
    openLibraryContent();
  } catch {
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}
const coverTracks = computed(() => {
  const seen = new Set();
  return rows.value
    .map((row) => row.track)
    .filter((track) => {
      if (!track || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
});
const fields = computed(() => {
  if (!session.value) return [];
  const timing = performanceArchiveTiming(session.value);
  const completed = rows.value.filter(
    ({ progress }) => progress === 'completed',
  ).length;
  return [
    { key: 'timing', text: timing },
    {
      key: 'summary',
      text: rows.value.length
        ? performanceArchiveProgress(completed, rows.value.length)
        : '',
    },
  ].filter(({ text }) => text);
});
</script>

<template>
  <section class="performance-archive" :aria-busy="loading">
    <UiSkeleton
      v-if="loading && !session"
      :lines="4"
      :aria-label="t('session.archive.loading')"
    />
    <UiNotice v-if="error" compact tone="warning" :message="error" />
    <UiButton v-if="error" :disabled="loading" @click="refresh">{{
      t('session.archive.reload')
    }}</UiButton>
    <template v-if="session">
      <slot name="artwork" :cover-url="session.coverUrl || ''" />
      <header
        class="performance-archive__header"
        :class="{ 'performance-archive__header--embedded': embedded }"
      >
        <AppFolderDossier
          v-if="!embedded"
          :title="session.name"
          title-id="performance-archive-title"
          :fields="fields"
        >
          <template #artwork
            ><UiCollageThumb
              :tracks="coverTracks"
              :size="FOLDER_DOSSIER_ARTWORK_SIZE"
              radius="0"
          /></template>
        </AppFolderDossier>
        <p v-else-if="fields.length" class="performance-archive__summary">
          <span v-for="field in fields" :key="field.key">{{ field.text }}</span>
        </p>
        <CollectionActionRail
          class="performance-archive__rail"
          :entity-label="t('session.archive.entity')"
          :show-search="false"
          :show-density="false"
        >
          <template #actions>
            <template v-if="session.endedAt">
              <UiIconButton
                :icon="ImagePlus"
                :label="t('session.archive.chooseCover')"
                :disabled="editingCover"
                @click="changeCover()"
              />
              <UiIconButton
                v-if="session.coverUrl"
                :icon="RotateCcw"
                :label="t('session.archive.resetCover')"
                :disabled="editingCover"
                @click="changeCover(true)"
              />
            </template>
            <UiButton
              v-if="(!embedded || allowSavePlaylist) && canSave"
              :icon="Copy"
              :disabled="saving"
              @click="createPlaylist"
              >{{ t('session.archive.savePlaylist') }}</UiButton
            >
            <UiIconButton
              :icon="Download"
              :label="t('obs.export.title')"
              @click="timeline.openForArrangement(session.id)"
            />
            <PerformanceSessionPlatformVideos :session-id="session.id" />
          </template>
        </CollectionActionRail>
      </header>
      <UiNotice
        v-if="coverError"
        tone="warning"
        compact
        :message="coverError"
      />
      <UiNotice
        v-if="saveError"
        tone="warning"
        compact
        :message="t('session.history.playlistCreationFailed')"
      />
      <AppFolderContentField :aria-label="t('session.archive.tracksLabel')">
        <UiHint v-if="!rows.length">{{
          t(
            session.timeline?.some(({ type }) => type === 'marker')
              ? 'session.archive.markersOnly'
              : 'session.archive.empty',
          )
        }}</UiHint>
        <ol v-else class="performance-archive__tracks" role="list">
          <PerformanceArchiveTrackRow
            v-for="row in rows"
            :key="row.key"
            :row="row"
            @locate="locateTrack"
            @navigate="emit('navigate')"
          />
        </ol>
      </AppFolderContentField>
    </template>
  </section>
</template>

<style scoped>
.performance-archive {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.performance-archive > .ui-btn {
  justify-self: start;
}
.performance-archive__header {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.performance-archive__header--embedded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding-block-end: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}
.performance-archive__header--embedded .performance-archive__rail {
  max-inline-size: 100%;
  margin-inline-start: auto;
  padding-block-end: 0;
}
.performance-archive__tracks {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.performance-archive__summary {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  min-inline-size: 0;
  gap: var(--ui-space-1) var(--ui-space-3);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}
</style>

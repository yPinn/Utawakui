<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Loader2, MicVocal, RefreshCw } from '@lucide/vue';
import { usePlayer } from '../composables/usePlayer.js';
import { useSeparation } from '../composables/useSeparation.js';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';

const { state, playTrack } = usePlayer();
// Owned at module scope (see useSeparation.js), not locally — this view
// unmounts on every tab switch, and a run must keep showing progress after
// the user navigates away and back.
const {
  state: separationState,
  isSeparating,
  describe,
  separate,
} = useSeparation();

const tracks = ref([]);
const isLoading = ref(true);

// Row click plays a separated track's stems file — usePlayer.js doesn't
// need to know "separation" exists, it only ever reads track.url.
function playRow(track) {
  playTrack(track.hasSeparation ? { ...track, url: track.stemsUrl } : track);
}

async function loadTracks() {
  tracks.value = await window.Utawakui.listTracks();
}

async function refresh() {
  isLoading.value = true;
  await loadTracks();
  isLoading.value = false;
}

let unsubscribe;

onMounted(() => {
  refresh();
  // Background metadata backfill (electron/lib/library.js's runBackfillPass)
  // pushes this after it changes something — silently re-fetch without
  // toggling isLoading, so the list updates in place instead of flashing
  // "載入中".
  unsubscribe = window.Utawakui.onLibraryUpdated(loadTracks);
});

onUnmounted(() => {
  // This view gets unmounted on every tab switch (App.vue swaps views via
  // <component :is>), so skipping this would stack a duplicate listener
  // each time the user revisits Setlist.
  unsubscribe?.();
});
</script>

<template>
  <div>
    <UiPageHeader title="Setlist">
      <template #actions>
        <UiButton :icon="RefreshCw" @click="refresh">重新整理</UiButton>
      </template>
    </UiPageHeader>

    <p v-if="isLoading" class="hint" role="status">載入中…</p>

    <p v-else-if="tracks.length === 0" class="hint">
      還沒有任何曲目——前往「Import」下載歌曲後再回來重新整理。
    </p>

    <template v-else>
      <p
        v-for="[trackId, message] in separationState.errors"
        :key="trackId"
        class="hint hint--error"
        role="alert"
      >
        {{ message }}
      </p>

      <ul class="tracks">
        <UiTrackRow
          v-for="track in tracks"
          :key="track.id"
          :track="track"
          :active="state.track?.id === track.id"
          interactive
          @click="playRow(track)"
        >
          <template v-if="!track.hasSeparation" #trail>
            <div class="row-actions" @click.stop>
              <!-- Separate <template>s, not one UiButton with a
                   conditionally-empty slot — $slots.default is
                   compile-time-present even behind a false v-if, which
                   would silently break the icon-only compact style. -->
              <UiButton
                v-if="isSeparating(track.id)"
                :icon="Loader2"
                class="row-actions__spin"
                disabled
                :title="describe(track.id)"
                role="status"
                @click="separate(track)"
              >
                {{ describe(track.id) }}
              </UiButton>
              <UiButton
                v-else
                :icon="MicVocal"
                aria-label="去人聲"
                title="去人聲(產生可調整導唱強弱的伴奏+人聲版本)"
                @click="separate(track)"
              />
            </div>
          </template>
        </UiTrackRow>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.hint {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.hint--error {
  color: var(--ui-danger);
  font-weight: var(--ui-font-weight-strong);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.row-actions__spin :deep(svg) {
  animation: row-actions-spin 1s linear infinite;
}

@keyframes row-actions-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .row-actions__spin :deep(svg) {
    animation: none;
  }
}

.tracks {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
</style>

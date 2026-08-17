<script setup>
import { computed, ref } from 'vue';
import {
  Captions,
  Check,
  ICON_SIZE,
  Library,
  ListMusic,
  Music,
  Music2,
  Search,
} from '../../icons/index.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const { state, currentTrackId, selectTrack, setTrackScope } = useLyrics();
const { selectedPlaylist } = usePlaylists();
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();

const query = ref('');

const scopeOptions = computed(() => [
  {
    value: 'all',
    label: '全部曲目',
    icon: Library,
  },
  {
    value: 'current-playlist',
    label: selectedPlaylist.value
      ? `目前歌單：${selectedPlaylist.value.name}`
      : '目前歌單',
    icon: ListMusic,
    disabled: !selectedPlaylist.value,
  },
  {
    value: 'local',
    label: '本機音訊',
    icon: Music,
  },
  {
    value: 'missing-lyrics',
    label: '缺歌詞',
    icon: Captions,
  },
  {
    value: 'available-lyrics',
    label: '有歌詞',
    icon: Music2,
  },
]);

const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());

const visibleTracks = computed(() => {
  const needle = normalizedQuery.value;
  if (!needle) return state.tracks;
  return state.tracks.filter((track) =>
    [track.title, track.artist, track.id, track.filename].some((value) =>
      String(value ?? '')
        .toLocaleLowerCase()
        .includes(needle),
    ),
  );
});

const selectedScopeLabel = computed(
  () =>
    scopeOptions.value.find((option) => option.value === state.trackScope)
      ?.label ?? '全部曲目',
);

const jumpableTrackIds = computed(() => {
  const ids = new Set();
  for (const track of visibleTracks.value) {
    if (albumForTrack(track)) ids.add(track.id);
  }
  return ids;
});

function lyricsStatusLabel(track) {
  const status = track.lyrics?.status;
  if (status === 'available') return '有歌詞';
  if (status === 'missing') return '無歌詞';
  return '未掃描歌詞';
}

function lyricsStatusIconTone(track) {
  const status = track.lyrics?.status;
  if (status === 'available') return 'accent';
  if (status === 'missing') return 'muted';
  return 'highlight';
}

function handleScopeClick(option) {
  if (option.disabled) return;
  setTrackScope(option.value);
}

function handleTrackSelect(track) {
  selectTrack(track.id);
  emit('close');
}
</script>

<template>
  <UiModal :open="open" title="選擇歌詞曲目" size="wide" @close="emit('close')">
    <div class="lyrics-track-picker">
      <div
        class="lyrics-track-picker__scope"
        role="group"
        aria-label="曲目範圍"
      >
        <UiButton
          v-for="option in scopeOptions"
          :key="option.value"
          :icon="option.icon"
          :active="state.trackScope === option.value"
          :disabled="option.disabled"
          :title="option.label"
          @click="handleScopeClick(option)"
        >
          {{ option.label }}
        </UiButton>
      </div>

      <label class="lyrics-track-picker__search">
        <Search :size="ICON_SIZE" aria-hidden="true" />
        <span class="visually-hidden">搜尋曲目</span>
        <input v-model="query" placeholder="搜尋曲名、歌手或 ID" />
      </label>

      <div class="lyrics-track-picker__summary">
        <span>{{ selectedScopeLabel }}</span>
        <span>{{ visibleTracks.length }} 首</span>
      </div>

      <UiHint
        v-if="state.trackScope === 'current-playlist' && !selectedPlaylist"
        padded
      >
        目前沒有選取 Setlist 歌單。
      </UiHint>
      <UiHint v-else-if="visibleTracks.length === 0" padded>
        找不到符合的曲目。
      </UiHint>

      <ul v-else class="lyrics-track-picker__list">
        <UiTrackRow
          v-for="track in visibleTracks"
          :key="track.id"
          :track="track"
          :active="track.id === state.selectedTrackId"
          :current="track.id === currentTrackId"
          interactive
          hide-duration
          :title-clickable="jumpableTrackIds.has(track.id)"
          :title-aria-label="`前往專輯：${track.title}`"
          @click="handleTrackSelect(track)"
          @title-click="jumpToAlbum(track)"
        >
          <template #trail>
            <div class="lyrics-track-picker__row-status">
              <UiStatusIcon
                v-if="track.id === state.selectedTrackId"
                :icon="Check"
                tone="accent"
                label="已選取"
              />
              <UiStatusIcon
                :icon="Captions"
                :tone="lyricsStatusIconTone(track)"
                :label="lyricsStatusLabel(track)"
              />
            </div>
          </template>
        </UiTrackRow>
      </ul>
    </div>
  </UiModal>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lyrics-track-picker {
  display: grid;
  gap: var(--ui-space-3);
}

.lyrics-track-picker__scope {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.lyrics-track-picker__search {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  height: var(--ui-control-height);
  padding: 0 var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text-muted);
}

.lyrics-track-picker__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.lyrics-track-picker__search input::placeholder {
  color: var(--ui-color-text-muted);
}

.lyrics-track-picker__search:focus-within {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-track-picker__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-track-picker__list {
  display: grid;
  gap: var(--ui-space-1);
  max-height: min(52vh, 520px);
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.lyrics-track-picker__row-status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex: 0 0 auto;
  --ui-status-icon-bg: var(--ui-color-canvas);
}
</style>

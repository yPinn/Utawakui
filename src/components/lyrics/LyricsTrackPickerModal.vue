<script setup>
import { computed, shallowRef } from 'vue';
import {
  Captions,
  Check,
  Library,
  ListMusic,
  Music,
  Music2,
} from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useVirtualList } from '../../composables/useVirtualRows.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const { state, currentTrackId, selectTrack, setTrackScope } = useLyrics();
const { selectedPlaylist } = usePlaylists();

const query = shallowRef('');

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
    label: '本機檔案',
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

const trackList = shallowRef(null);
const {
  rows: trackRows,
  rowAttrs,
  listStyle,
  listListeners,
} = useVirtualList({
  listRef: trackList,
  items: () => visibleTracks.value,
  keyOf: (track) => track.id,
  // Picker rows cost about 1 ms each; an unfiltered library would block opening.
  threshold: () => 100,
  // First-frame guess (3.25rem row + gap); replaced once one renders.
  estimateRowHeight: () => 56,
});

const selectedScopeLabel = computed(
  () =>
    scopeOptions.value.find((option) => option.value === state.trackScope)
      ?.label ?? '全部曲目',
);

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

      <UiSearchBox
        v-model="query"
        label="搜尋曲目"
        placeholder="搜尋歌名或歌手"
      />

      <div class="lyrics-track-picker__summary">
        <span>{{ selectedScopeLabel }}</span>
        <span>{{ visibleTracks.length }} 首</span>
      </div>

      <UiHint
        v-if="state.trackScope === 'current-playlist' && !selectedPlaylist"
        padded
      >
        尚未選擇播放清單。
      </UiHint>
      <UiHint v-else-if="visibleTracks.length === 0" padded>
        找不到符合的曲目。
      </UiHint>

      <UiScrollRegion
        v-else
        class="lyrics-track-picker__list"
        axis="both"
        viewport-class="lyrics-track-picker__list-viewport"
      >
        <ul
          ref="trackList"
          class="lyrics-track-picker__rows"
          :style="listStyle"
          v-on="listListeners"
        >
          <TrackIdentityRow
            v-for="{ key, item: track, index, gap } in trackRows"
            :key="key"
            v-bind="rowAttrs({ key, index, gap })"
            :track="track"
            :active="track.id === state.selectedTrackId"
            :current="track.id === currentTrackId"
            interactive
            :action-label="`選取 ${track.title}`"
            hide-duration
            navigation="album"
            @row-click="handleTrackSelect(track)"
            @navigate="emit('close')"
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
          </TrackIdentityRow>
        </ul>
      </UiScrollRegion>
    </div>
  </UiModal>
</template>

<style scoped>
.lyrics-track-picker {
  display: grid;
  gap: var(--ui-space-3);
}

.lyrics-track-picker__scope {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.lyrics-track-picker__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-track-picker__list {
  max-height: min(52vh, 32.5rem);
}

.lyrics-track-picker__list :deep(.lyrics-track-picker__list-viewport) {
  block-size: auto;
  max-block-size: inherit;
}

.lyrics-track-picker__rows {
  display: grid;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
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

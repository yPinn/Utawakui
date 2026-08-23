<script setup>
import { computed, shallowRef } from 'vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  selectedTrackId: { type: String, default: '' },
  selectedLevel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);
const query = shallowRef('');

const visibleTracks = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  if (!normalized) return props.tracks;
  return props.tracks.filter((track) =>
    `${track.title ?? ''} ${track.artist ?? ''}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
});

function selectTrack(trackId) {
  if (!props.disabled) emit('select', trackId);
}
</script>

<template>
  <section class="analysis-picker" aria-labelledby="analysis-track-heading">
    <div class="analysis-picker__heading-row">
      <div>
        <h2 id="analysis-track-heading" class="analysis-picker__heading">
          曲目
        </h2>
        <p class="analysis-picker__count">{{ tracks.length }} 首本機曲目</p>
      </div>
      <UiChip v-if="selectedLevel" tone="info">{{ selectedLevel }}</UiChip>
    </div>

    <UiSearchBox v-model="query" placeholder="搜尋可分析曲目" />

    <UiHint v-if="loading" padded>正在讀取本機曲庫…</UiHint>
    <UiHint v-else-if="visibleTracks.length === 0" padded center>
      {{
        tracks.length === 0 ? '曲庫目前沒有可分析曲目。' : '沒有符合的曲目。'
      }}
    </UiHint>
    <ul v-else class="analysis-picker__list">
      <UiTrackRow
        v-for="track in visibleTracks"
        :key="track.id"
        :track="track"
        :active="track.id === selectedTrackId"
        :interactive="!disabled"
        :aria-current="track.id === selectedTrackId ? 'true' : undefined"
        :aria-pressed="!disabled ? track.id === selectedTrackId : undefined"
        :aria-disabled="disabled || undefined"
        @click="selectTrack(track.id)"
      />
    </ul>
  </section>
</template>

<style scoped>
.analysis-picker {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.analysis-picker__heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.analysis-picker__heading,
.analysis-picker__count {
  margin: 0;
}

.analysis-picker__heading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.analysis-picker__count {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.analysis-picker :deep(.ui-search-box) {
  width: 100%;
}

.analysis-picker__list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

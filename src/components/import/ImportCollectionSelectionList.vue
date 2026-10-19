<script setup>
import { computed } from 'vue';
import { SquareCheckBig } from '../../icons/index.js';
import {
  identityArtistLabel,
  identityTitle,
} from '../../utils/importCandidateDisplay.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import ImportCollectionTrackStatus from './ImportCollectionTrackStatus.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  allSelected: { type: Boolean, default: false },
});
const emit = defineEmits(['selectTrack', 'toggleSelectAll']);

const sections = computed(() => {
  const missing = [];
  const local = [];
  for (const source of props.tracks) {
    const entry = {
      source,
      track: {
        ...source,
        title: identityTitle(source.trackIdentity, source.title),
        artist: identityArtistLabel(source.trackIdentity, source.artist),
      },
    };
    (source.alreadyDownloaded || source.status === 'done'
      ? local
      : missing
    ).push(entry);
  }
  return [
    {
      id: 'missing',
      label: '待下載',
      entries: missing,
      empty: '沒有待下載的曲目',
    },
    {
      id: 'local',
      label: '已在曲庫',
      entries: local,
      empty: '沒有已在曲庫的曲目',
    },
  ];
});

function checkboxId(trackId) {
  return `import-collection-track-${encodeURIComponent(String(trackId))}`;
}
</script>

<template>
  <div class="import-collection-selection-list">
    <AppRightDockSection
      v-for="section in sections"
      :key="section.id"
      :heading="`${section.label} · ${section.entries.length} 首`"
    >
      <template v-if="section.id === 'missing'" #trailing>
        <UiIconButton
          :icon="SquareCheckBig"
          :label="allSelected ? '取消全選' : '全選待下載曲目'"
          :active="allSelected"
          :aria-pressed="allSelected"
          :disabled="busy || section.entries.length === 0"
          @click="emit('toggleSelectAll')"
        />
      </template>
      <UiHint v-if="section.entries.length === 0">{{ section.empty }}</UiHint>
      <ul v-else class="import-collection-selection-list__rows">
        <UiTrackRow
          v-for="entry in section.entries"
          :key="entry.source.id"
          class="import-collection-selection-list__row"
          :track="entry.track"
          :active="section.id === 'missing' && entry.source.selected"
          state-surface
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
        >
          <template v-if="section.id === 'missing'" #lead>
            <UiCheckbox
              :id="checkboxId(entry.source.id)"
              :model-value="entry.source.selected"
              :label="`選取 ${entry.track.title}`"
              label-hidden
              :disabled="busy"
              @update:model-value="emit('selectTrack', entry.source.id, $event)"
            />
          </template>
          <template #trail>
            <ImportCollectionTrackStatus :track="entry.source" />
          </template>
        </UiTrackRow>
      </ul>
    </AppRightDockSection>
  </div>
</template>

<style scoped>
.import-collection-selection-list {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--ui-right-dock-section-gap);
}

.import-collection-selection-list :deep(.app-right-dock-section__header) {
  min-block-size: var(--ui-control-height);
}

.import-collection-selection-list__rows {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.import-collection-selection-list__row {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}

@container (max-width: 42rem) {
  .import-collection-selection-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

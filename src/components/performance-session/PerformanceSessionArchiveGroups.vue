<script setup>
import { performanceArchiveSummary } from '../../utils/performanceArchivePresentation.js';
import PlaylistSidebarRow from '../playlists/PlaylistSidebarRow.vue';

defineProps({ groups: { type: Array, required: true } });
const emit = defineEmits(['open']);
</script>

<template>
  <div class="archive-groups">
    <section
      v-for="group in groups"
      :key="group.key"
      class="archive-groups__day"
    >
      <h2 class="archive-groups__label">{{ group.label }}</h2>
      <PlaylistSidebarRow
        v-for="archive in group.archives"
        :key="archive.id"
        :playlist="archive"
        :subtitle="
          performanceArchiveSummary(archive, {
            compact: true,
            timeOnly: Boolean(group.date),
          })
        "
        :cover-tracks="archive.coverTracks"
        :playback-enabled="false"
        @select="emit('open', archive.id)"
      />
    </section>
  </div>
</template>

<style scoped>
.archive-groups {
  display: grid;
  gap: var(--ui-folder-section-gap);
}

.archive-groups__day {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-track-list-gap);
}

.archive-groups__label {
  padding-block-end: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
</style>

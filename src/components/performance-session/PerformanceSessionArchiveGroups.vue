<script setup>
import { performanceArchiveSummary } from '../../utils/performanceArchivePresentation.js';
import PlaylistSidebarRow from '../playlists/PlaylistSidebarRow.vue';
import PerformanceSessionArchiveTicket from './PerformanceSessionArchiveTicket.vue';

defineProps({
  groups: { type: Array, required: true },
  ticket: Boolean,
});
const emit = defineEmits(['open']);
</script>

<template>
  <div class="archive-groups">
    <section
      v-for="group in groups"
      :key="group.key"
      class="archive-groups__section"
      :class="{ 'archive-groups__section--tickets': ticket }"
    >
      <h2 class="archive-groups__label">{{ group.label }}</h2>
      <div v-if="ticket" class="archive-groups__tickets">
        <PerformanceSessionArchiveTicket
          v-for="archive in group.archives"
          :key="archive.id"
          :archive="archive"
          @select="emit('open', archive.id)"
        />
      </div>
      <template v-else>
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
      </template>
    </section>
  </div>
</template>

<style scoped>
.archive-groups {
  display: grid;
  gap: var(--ui-folder-section-gap);
}

.archive-groups__section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-track-list-gap);
}

.archive-groups__section--tickets {
  container: archive-ticket-month / inline-size;
  gap: var(--ui-space-3);
}

.archive-groups__tickets {
  --archive-ticket-max-width: 22rem;
  --archive-ticket-gap: var(--ui-space-2);

  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-inline-size: calc(
    2 * var(--archive-ticket-max-width) + var(--archive-ticket-gap)
  );
  gap: var(--archive-ticket-gap);
}

@container archive-ticket-month (width < 29rem) {
  .archive-groups__tickets {
    grid-template-columns: minmax(0, 1fr);
  }
}

.archive-groups__label {
  padding-block-end: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
</style>

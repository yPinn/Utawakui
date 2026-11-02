<script setup>
import { Search } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  query: { type: String, default: '' },
  results: { type: Object, required: true },
  searching: Boolean,
  searched: Boolean,
  selectedTrackId: { type: String, default: '' },
  disabled: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['query', 'search', 'select']);
function search() {
  if (props.disabled || props.searching) return;
  emit('search', props.query);
}
</script>

<template>
  <section class="work-link-search" :aria-label="t('work.linkSearch.label')">
    <form
      class="work-link-search__query"
      role="search"
      @submit.prevent="search"
    >
      <UiTextField
        id="work-search-query"
        :label="t('work.linkSearch.searchTitle')"
        label-hidden
        :placeholder="t('work.linkSearch.searchTitle')"
        :model-value="query"
        :maxlength="200"
        :disabled="disabled"
        @update:model-value="emit('query', $event)"
      />
      <UiButton
        type="submit"
        :icon="Search"
        :title="t('work.linkSearch.search')"
        :aria-label="t('work.linkSearch.search')"
        :disabled="disabled"
        :loading="searching"
        :loading-label="t('work.linkSearch.searching')"
      />
    </form>
    <UiNotice v-if="error" tone="danger" :message="error" />
    <p v-if="searching" class="work-link-search__hint" role="status">
      {{ t('work.linkSearch.searchingStatus') }}
    </p>
    <template v-else-if="searched && !error">
      <template v-if="results.tracks.length">
        <ul class="work-link-search__tracks">
          <TrackIdentityRow
            v-for="track in results.tracks"
            :key="track.id"
            :track="track"
            hide-duration
            overflow="ellipsis"
          >
            <template #trail
              ><UiButton
                variant="secondary"
                :aria-label="
                  t(
                    selectedTrackId === track.id
                      ? 'work.linkSearch.selectedNamed'
                      : 'work.linkSearch.linkNamed',
                    {
                      title: track.title,
                      artist:
                        track.artist || t('work.linkSearch.unknownArtist'),
                    },
                  )
                "
                :disabled="disabled || selectedTrackId === track.id"
                @click="
                  emit('select', { kind: 'track', targetTrackId: track.id })
                "
                >{{
                  t(
                    selectedTrackId === track.id
                      ? 'work.linkSearch.selected'
                      : 'work.linkSearch.link',
                  )
                }}</UiButton
              ></template
            >
          </TrackIdentityRow>
        </ul>
      </template>
      <p
        v-if="!results.tracks.length"
        class="work-link-search__hint"
        role="status"
      >
        {{ t('work.linkSearch.noResults') }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.work-link-search {
  display: grid;
  gap: var(--ui-space-4);
}
.work-link-search__query {
  display: flex;
  align-items: end;
  gap: var(--ui-space-3);
}
.work-link-search__query > :first-child {
  flex: 1;
  min-inline-size: 0;
}
.work-link-search__tracks {
  list-style: none;
  padding: 0;
  margin: 0;
}
.work-link-search__hint {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>

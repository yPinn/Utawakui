<script setup>
import { Search } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';

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
  <section class="work-link-search" aria-label="連結曲目">
    <form
      class="work-link-search__query"
      role="search"
      @submit.prevent="search"
    >
      <UiTextField
        id="work-search-query"
        label="搜尋歌名"
        label-hidden
        placeholder="搜尋歌名"
        :model-value="query"
        :maxlength="200"
        :disabled="disabled"
        @update:model-value="emit('query', $event)"
      />
      <UiButton
        type="submit"
        :icon="Search"
        title="搜尋"
        aria-label="搜尋"
        :disabled="disabled"
        :loading="searching"
        loading-label="搜尋中"
      />
    </form>
    <UiNotice v-if="error" tone="danger" :message="error" />
    <p v-if="searching" class="work-link-search__hint" role="status">搜尋中…</p>
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
                :aria-label="`${selectedTrackId === track.id ? '已選擇' : '連結'} ${track.title}（${track.artist || '未知演唱者'}）`"
                :disabled="disabled || selectedTrackId === track.id"
                @click="
                  emit('select', { kind: 'track', targetTrackId: track.id })
                "
                >{{
                  selectedTrackId === track.id ? '已選擇' : '連結'
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
        找不到曲目。試試其他關鍵字。
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

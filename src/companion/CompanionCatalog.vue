<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { Plus } from '../icons/index.js';
import UiButton from '../components/ui/UiButton.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiSearchBox from '../components/ui/UiSearchBox.vue';
import UiSegmentedControl from '../components/ui/UiSegmentedControl.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { t } from '../utils/i18n.js';

const props = defineProps({
  remote: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  connected: { type: Boolean, default: false },
  withThumbnail: { type: Function, default: (track) => track },
});
const emit = defineEmits(['command', 'preload-thumbnails']);
const query = shallowRef('');
const category = shallowRef('all');
const items = shallowRef([]);
const total = shallowRef(null);
const nextOffset = shallowRef(null);
const loading = shallowRef(false);
const error = shallowRef(false);
const categories = ['all', 'artist', 'album'].map((id) => ({
  id,
  label: t(`companion.queue.catalog.${id}`),
}));
let request;
let debounce;

const groups = computed(() => {
  const field = category.value;
  if (!items.value.length) return [];
  if (field === 'all') return [{ key: '', label: '', tracks: items.value }];
  const result = new Map();
  for (const track of items.value) {
    const key = track[field] || '';
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(track);
  }
  return Array.from(result, ([key, tracks]) => ({
    key,
    label: key || t('companion.queue.catalog.uncategorized'),
    tracks,
  }));
});

async function load(offset = 0) {
  if (!props.connected || !props.remote?.getCatalog) return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  error.value = false;
  try {
    const page = await props.remote.getCatalog(
      {
        query: query.value,
        category: category.value,
        offset,
      },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    const merged = new Map(
      (offset ? items.value : []).map((track) => [track.id, track]),
    );
    for (const track of page.items) merged.set(track.id, track);
    items.value = [...merged.values()];
    // Page order is display order, so top rows arrive first.
    emit(
      'preload-thumbnails',
      page.items.map(({ id }) => id),
    );
    total.value = page.total;
    nextOffset.value = page.nextOffset;
  } catch {
    if (!controller.signal.aborted) error.value = true;
  } finally {
    if (request === controller) loading.value = false;
  }
}

watch(
  [query, category, () => props.connected],
  () => {
    clearTimeout(debounce);
    request?.abort();
    request = null;
    items.value = [];
    total.value = null;
    nextOffset.value = null;
    error.value = false;
    loading.value = props.connected && Boolean(props.remote?.getCatalog);
    if (loading.value) debounce = setTimeout(() => void load(), 160);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(debounce);
  request?.abort();
});

function command(name, track) {
  emit('command', name, { libraryTrackId: track.id });
}
</script>

<template>
  <div class="companion-catalog">
    <div class="companion-catalog__controls">
      <UiSearchBox
        id="companion-library-search"
        v-model="query"
        :label="t('companion.queue.catalog.search')"
        :placeholder="t('companion.queue.catalog.search')"
        :maxlength="100"
      />
      <div class="companion-catalog__filter">
        <UiHint>{{ t('companion.queue.catalog.groupBy') }}</UiHint>
        <UiSegmentedControl
          v-model="category"
          :items="categories"
          :aria-label="t('companion.queue.catalog.groupBy')"
          wrap
        />
      </div>
    </div>
    <UiHint
      v-if="total !== null && total > 0"
      class="companion-catalog__count"
      role="status"
    >
      {{ t('playlist.actions.trackCount', total) }}
    </UiHint>
    <section
      v-for="group in groups"
      :key="group.key"
      class="companion-catalog__group"
    >
      <h2 v-if="group.label" class="companion-catalog__heading">
        {{ group.label }}
      </h2>
      <ul>
        <UiTrackRow
          v-for="track in group.tracks"
          :key="track.id"
          class="companion-catalog__track"
          :track="withThumbnail(track)"
          :disabled="disabled"
          :action-label="t('queue.track.playNamed', { title: track.title })"
          overflow="ellipsis"
          thumb-loading="lazy"
          interactive
          hide-duration
          @row-click="command('library.play', track)"
        >
          <template #trail>
            <UiIconButton
              :icon="Plus"
              :label="t('track.menu.addToQueue')"
              :disabled="disabled"
              @click.stop="command('library.enqueue', track)"
            />
          </template>
        </UiTrackRow>
      </ul>
    </section>
    <UiHint v-if="!connected" padded role="status">
      {{ t('companion.page.reconnectingShort') }}
    </UiHint>
    <UiHint v-else-if="loading" padded role="status">
      {{ t('companion.queue.catalog.loading') }}
    </UiHint>
    <div v-else-if="error" class="companion-catalog__feedback">
      <UiHint tone="danger" role="alert">{{
        t('companion.queue.catalog.loadFailed')
      }}</UiHint>
      <UiButton variant="secondary" @click="load(nextOffset ?? 0)">{{
        t('common.retry')
      }}</UiButton>
    </div>
    <UiButton
      v-else-if="nextOffset !== null"
      variant="secondary"
      @click="load(nextOffset)"
    >
      {{ t('companion.queue.catalog.more') }}
    </UiButton>
    <UiHint v-else-if="!items.length" padded>{{
      t('companion.queue.catalog.empty')
    }}</UiHint>
  </div>
</template>

<style scoped>
.companion-catalog {
  --ui-track-row-thumb-size: var(--ui-companion-track-artwork-size);
  --ui-track-row-gap: var(--ui-space-3);
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}

.companion-catalog__controls,
.companion-catalog__group {
  min-inline-size: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-companion-panel);
}

.companion-catalog__controls,
.companion-catalog__filter {
  display: grid;
  gap: var(--ui-space-2);
}

.companion-catalog__feedback {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.companion-catalog__filter {
  gap: var(--ui-space-1);
}

.companion-catalog__filter :deep(.ui-segmented-control__wrap) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.companion-catalog__filter :deep(.ui-segmented-control__option) {
  padding-inline: var(--ui-space-1);
}

.companion-catalog__track.ui-track {
  font-size: var(--ui-type-body-size);
}

.companion-catalog__heading,
.companion-catalog__count {
  padding-inline: var(--ui-space-2);
}

.companion-catalog__heading {
  padding-block: var(--ui-space-1);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
  overflow-wrap: anywhere;
}

.companion-catalog ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

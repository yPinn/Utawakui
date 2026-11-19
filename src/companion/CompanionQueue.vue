<script setup>
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronDown, ChevronUp, Ellipsis, ListMinus } from '../icons/index.js';
import UiButton from '../components/ui/UiButton.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiSegmentedControl from '../components/ui/UiSegmentedControl.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import CompanionCatalog from './CompanionCatalog.vue';
import { t } from '../utils/i18n.js';

const props = defineProps({
  track: { type: Object, default: null },
  queue: { type: Object, default: null },
  manualQueueCount: { type: Number, default: undefined },
  queueView: { type: Object, default: null },
  remote: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  withThumbnail: { type: Function, default: (track) => track },
  artworkReady: { type: Boolean, default: false },
});
const emit = defineEmits([
  'load-thumbnail',
  'preload-thumbnails',
  'play',
  'command',
]);
const libraryOpen = shallowRef(false);
const openRow = shallowRef(null);
const confirmClear = shallowRef(false);
const queueRoot = useTemplateRef('queueRoot');
const visibleTab = computed(() =>
  libraryOpen.value
    ? 'library'
    : props.queueView?.variant === 'arrangement'
      ? 'arrangement'
      : (props.queueView?.tab ?? 'queue'),
);
const tabs = [
  { id: 'queue', label: t('queue.panel.queue') },
  { id: 'recent', label: t('queue.panel.recent') },
  { id: 'arrangement', label: t('companion.queue.arrangement') },
  { id: 'library', label: t('companion.queue.catalog.library') },
];
const arrangementTabs = [
  { id: 'pending', label: t('session.board.pending') },
  { id: 'history', label: t('session.board.history') },
];
watch(
  visibleTab,
  () => {
    if (queueRoot.value?.parentElement)
      queueRoot.value.parentElement.scrollTop = 0;
  },
  { flush: 'post' },
);
function selectView(tab) {
  libraryOpen.value = tab === 'library';
  openRow.value = null;
  confirmClear.value = false;
  if (tab === 'library') return;
  if (tab === 'arrangement') {
    if (props.queueView?.variant !== 'arrangement')
      selectArrangement(props.queueView?.arrangementTab ?? 'pending');
  } else if (
    tab !== props.queueView?.tab ||
    props.queueView?.variant !== 'queue'
  ) {
    emit(
      'command',
      tab === 'recent' ? 'queue.view-recent' : 'queue.view-queue',
    );
  }
}
function selectArrangement(tab) {
  emit(
    'command',
    tab === 'history'
      ? 'queue.view-arrangement-history'
      : 'queue.view-arrangement-pending',
  );
}
function queueAction(command, queueIndex) {
  openRow.value = null;
  emit('command', command, { queueIndex });
}
const rows = new Map();
let observer;

function observeRow(row, id) {
  if (!props.artworkReady) return;
  if (typeof IntersectionObserver === 'undefined') {
    emit('load-thumbnail', id);
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const trackId = rows.get(target);
      if (!isIntersecting || !trackId || !props.artworkReady) continue;
      observer.unobserve(target);
      emit('load-thumbnail', trackId);
    }
  });
  observer.observe(row);
}

const vThumbnail = {
  mounted(row, { value }) {
    rows.set(row, value);
    observeRow(row, value);
  },
  unmounted(row) {
    observer?.unobserve(row);
    rows.delete(row);
  },
};

watch(
  () => props.artworkReady,
  (ready) => {
    if (ready) rows.forEach((id, row) => observeRow(row, id));
    else observer?.disconnect();
  },
);
onBeforeUnmount(() => observer?.disconnect());
const current = computed(
  () =>
    props.track ??
    props.queue?.items?.find(({ state }) => state === 'current')?.track,
);
const upcoming = computed(
  () =>
    props.queue?.items
      ?.filter(({ state }) => state === 'queued')
      .map(({ track }, index) => ({ track, index })) ?? [],
);
const groups = computed(() => {
  const manualCount = props.manualQueueCount ?? upcoming.value.length;
  return [
    {
      id: 'manual',
      label: t('queue.panel.nextUp'),
      tracks: upcoming.value.slice(0, manualCount),
    },
    {
      id: 'source',
      label: props.queue?.sourceName || t('queue.panel.currentQueue'),
      tracks: upcoming.value.slice(manualCount),
    },
  ].filter(({ tracks }) => tracks.length);
});
</script>

<template>
  <div ref="queueRoot" class="companion-queue">
    <UiSegmentedControl
      v-if="queueView"
      class="companion-queue__tabs"
      :model-value="visibleTab"
      :items="tabs"
      :aria-label="t('queue.panel.generalLabel')"
      wrap
      @update:model-value="selectView"
      @reselect="selectView"
    />
    <CompanionCatalog
      v-if="visibleTab === 'library'"
      :remote="remote"
      :connected="artworkReady"
      :disabled="disabled"
      :with-thumbnail="withThumbnail"
      @command="(name, context) => emit('command', name, context)"
      @preload-thumbnails="(ids) => emit('preload-thumbnails', ids)"
    />
    <section
      v-else-if="visibleTab === 'arrangement'"
      class="companion-queue__group"
    >
      <UiSegmentedControl
        :model-value="queueView.arrangementTab"
        :items="arrangementTabs"
        :aria-label="t('session.board.label')"
        wrap
        @update:model-value="selectArrangement"
      />
      <ol v-if="queueView.arrangement.length">
        <UiTrackRow
          v-for="entry in queueView.arrangement"
          :key="entry.id"
          class="companion-queue__track"
          :track="entry"
          :current="entry.current"
          overflow="ellipsis"
          hide-duration
        />
      </ol>
      <p v-else>{{ t('companion.queue.empty') }}</p>
    </section>
    <section v-else-if="visibleTab === 'recent'" class="companion-queue__group">
      <h2>{{ t('queue.panel.recent') }}</h2>
      <ol v-if="queueView?.recent.length">
        <UiTrackRow
          v-for="(entry, index) in queueView.recent"
          :key="`${entry.id}-${index}`"
          v-thumbnail="entry.id"
          class="companion-queue__track"
          :track="withThumbnail(entry)"
          :disabled="disabled"
          :action-label="t('queue.track.playNamed', { title: entry.title })"
          overflow="ellipsis"
          interactive
          hide-duration
          @row-click="queueAction('queue.play-recent', index)"
        />
      </ol>
      <p v-else>{{ t('queue.recent.empty') }}</p>
    </section>
    <template v-else>
      <section v-if="current" class="companion-queue__group">
        <h2>{{ t('queue.panel.nowPlaying') }}</h2>
        <ul>
          <UiTrackRow
            class="companion-queue__track"
            :track="current"
            current
            overflow="ellipsis"
            hide-duration
          />
        </ul>
      </section>
      <section
        v-for="group in groups"
        :key="group.id"
        class="companion-queue__group"
      >
        <header class="companion-queue__group-header">
          <h2>{{ group.label }}</h2>
          <div
            v-if="queueView && group.id === 'manual'"
            class="companion-queue__actions"
          >
            <UiButton
              v-if="!confirmClear"
              :disabled="disabled"
              @click="confirmClear = true"
              >{{ t('queue.panel.clear') }}</UiButton
            >
            <template v-else>
              <UiButton
                :disabled="disabled"
                @click="
                  confirmClear = false;
                  emit('command', 'queue.clear');
                "
                >{{ t('companion.queue.confirmClear') }}</UiButton
              >
              <UiButton @click="confirmClear = false">{{
                t('common.cancel')
              }}</UiButton>
            </template>
          </div>
        </header>
        <ol>
          <template
            v-for="({ track: queued, index }, groupIndex) in group.tracks"
            :key="`${queued.id}-${index}`"
          >
            <UiTrackRow
              v-thumbnail="queued.id"
              class="companion-queue__track"
              :track="withThumbnail(queued)"
              :interactive="manualQueueCount !== undefined"
              :disabled="disabled"
              :action-label="
                t('queue.track.playNamed', { title: queued.title })
              "
              overflow="ellipsis"
              hide-duration
              thumb-loading="lazy"
              thumb-decoding="async"
              @row-click="emit('play', index)"
            >
              <template v-if="queueView" #trail>
                <UiIconButton
                  :icon="Ellipsis"
                  :label="t('queue.track.moreNamed', { title: queued.title })"
                  :aria-expanded="openRow === index"
                  :disabled="disabled"
                  @click.stop="openRow = openRow === index ? null : index"
                />
              </template>
            </UiTrackRow>
            <li v-if="openRow === index" class="companion-queue__drawer">
              <UiButton
                :icon="ChevronUp"
                :disabled="disabled || groupIndex === 0"
                @click="queueAction('queue.move-up', index)"
              >
                {{ t('companion.queue.moveUp') }}
              </UiButton>
              <UiButton
                :icon="ChevronDown"
                :disabled="disabled || groupIndex + 1 === group.tracks.length"
                @click="queueAction('queue.move-down', index)"
              >
                {{ t('companion.queue.moveDown') }}
              </UiButton>
              <UiButton
                v-if="group.id === 'manual'"
                :icon="ListMinus"
                :aria-label="t('track.menu.removeFromQueue')"
                intent="danger"
                :disabled="disabled"
                @click="queueAction('queue.remove', index)"
              >
                {{ t('companion.queue.remove') }}
              </UiButton>
            </li>
          </template>
        </ol>
      </section>
      <section v-if="!upcoming.length" class="companion-queue__group">
        <p>{{ t('companion.queue.empty') }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.companion-queue {
  --ui-track-row-thumb-size: var(--ui-companion-track-artwork-size);
  --ui-track-row-gap: var(--ui-space-3);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.companion-queue__group {
  min-inline-size: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-companion-panel);
}

.companion-queue__group h2 {
  padding: var(--ui-space-1) var(--ui-space-2);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.companion-queue__group p {
  margin: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
}

.companion-queue__group :is(ul, ol) {
  margin: 0;
  padding: 0;
  list-style: none;
}

.companion-queue .companion-queue__track {
  font-size: var(--ui-type-body-size);
}

.companion-queue__group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-1);
}

.companion-queue__group-header h2 {
  flex: 1 1 min-content;
  min-inline-size: 0;
  overflow-wrap: break-word;
}

.companion-queue__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  margin-inline-start: auto;
}

.companion-queue__drawer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  background: var(--ui-companion-canvas);
}

.companion-queue__drawer :deep(.ui-btn) {
  min-inline-size: var(--ui-control-height-live);
  padding-inline: var(--ui-space-1);
}

.companion-queue__tabs :deep(.ui-segmented-control__wrap) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.companion-queue__tabs :deep(.ui-segmented-control__option) {
  padding-inline: var(--ui-space-1);
}
</style>

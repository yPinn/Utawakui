<script setup>
import { computed } from 'vue';
import { PanelRightClose, PanelRightOpen, Volume2 } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { formatStudioTrackSource } from '../../utils/studioLibraryPresentation.js';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  currentTrack: { type: Object, default: null },
  queueSourceName: { type: String, default: '' },
  upcomingTracks: { type: Array, default: () => [] },
});

const emit = defineEmits(['toggle']);

const queueContextLabel = computed(() => {
  if (props.queueSourceName) return props.queueSourceName;
  if (props.currentTrack || props.upcomingTracks.length > 0) return '目前佇列';
  return '尚未建立播放佇列';
});

const currentTrackFacts = computed(() => {
  if (!props.currentTrack) return [];

  const facts = [];
  if (props.currentTrack.album) {
    facts.push({ id: 'album', label: '專輯', value: props.currentTrack.album });
  }
  if (Number.isFinite(props.currentTrack.duration)) {
    facts.push({
      id: 'duration',
      label: '長度',
      value: formatDuration(props.currentTrack.duration),
    });
  }
  facts.push({
    id: 'source',
    label: '來源',
    value: formatStudioTrackSource(props.currentTrack),
  });
  return facts;
});
</script>

<template>
  <aside
    class="studio-context-inspector"
    :class="{
      'studio-context-inspector--open': open,
      'studio-context-inspector--collapsed': !open,
    }"
    :aria-label="open ? '播放資訊' : '播放資訊（已摺疊）'"
  >
    <div
      id="studio-library-inspector-content"
      class="studio-context-inspector__content"
      :hidden="!open"
      :aria-hidden="!open"
    >
      <header class="studio-context-inspector__header">
        <div class="studio-context-inspector__identity">
          <h2>播放資訊</h2>
          <p>{{ queueContextLabel }}</p>
        </div>
        <UiIconButton
          class="studio-context-inspector__collapse"
          :icon="PanelRightClose"
          label="摺疊播放資訊"
          size="md"
          :aria-expanded="true"
          aria-controls="studio-library-inspector-content"
          @click="emit('toggle')"
        />
      </header>

      <div class="studio-context-inspector__scroll">
        <section
          class="studio-context-inspector__section studio-context-inspector__current"
          aria-labelledby="studio-context-current-heading"
        >
          <div class="studio-context-inspector__section-heading">
            <h3 id="studio-context-current-heading">目前播放</h3>
            <UiStatusIcon
              v-if="currentTrack"
              :icon="Volume2"
              tone="current"
              :label="`目前播放：${currentTrack.title}`"
              decorative
            />
          </div>

          <template v-if="currentTrack">
            <div class="studio-context-inspector__current-identity">
              <UiTrackThumb
                class="studio-context-inspector__current-artwork"
                :track="currentTrack"
                size="var(--ui-track-artwork-size-preview)"
              />
              <div class="studio-context-inspector__current-copy">
                <h4>{{ currentTrack.title }}</h4>
                <p>{{ currentTrack.artist || '未知演出者' }}</p>
              </div>
            </div>

            <dl v-if="currentTrackFacts.length > 0">
              <div v-for="fact in currentTrackFacts" :key="fact.id">
                <dt>{{ fact.label }}</dt>
                <dd>{{ fact.value }}</dd>
              </div>
            </dl>
          </template>
          <UiHint v-else>目前沒有播放中的歌曲</UiHint>
        </section>

        <section
          class="studio-context-inspector__section studio-context-inspector__queue"
          aria-labelledby="studio-context-queue-heading"
        >
          <div class="studio-context-inspector__section-heading">
            <h3 id="studio-context-queue-heading">接下來</h3>
            <UiChip v-if="upcomingTracks.length > 0" tone="neutral">
              {{ upcomingTracks.length }} 首
            </UiChip>
          </div>

          <UiHint v-if="upcomingTracks.length === 0">佇列中沒有下一首</UiHint>
          <ol
            v-else
            class="studio-context-inspector__queue-list"
            aria-label="接下來的播放佇列"
          >
            <li
              v-for="(track, index) in upcomingTracks"
              :key="track.id ?? `${track.title}-${index}`"
              class="studio-context-inspector__queue-item"
            >
              <span
                class="studio-context-inspector__queue-index"
                aria-hidden="true"
              >
                {{ index + 1 }}
              </span>
              <UiTrackThumb
                :track="track"
                size="var(--ui-track-artwork-size-dense)"
              />
              <div class="studio-context-inspector__queue-copy">
                <h4>{{ track.title }}</h4>
                <p>{{ track.artist || '未知演出者' }}</p>
              </div>
              <span class="studio-context-inspector__queue-duration">
                {{ formatDuration(track.duration) }}
              </span>
            </li>
          </ol>
        </section>
      </div>
    </div>

    <UiIconButton
      v-if="!open"
      class="studio-context-inspector__expand"
      :icon="PanelRightOpen"
      label="展開播放資訊"
      :aria-expanded="false"
      aria-controls="studio-library-inspector-content"
      shape="inherit"
      stretch
      @click="emit('toggle')"
    />
  </aside>
</template>

<style scoped>
.studio-context-inspector {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  background: var(--ui-color-surface-raised);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
}

.studio-context-inspector--open {
  display: flex;
  flex-direction: column;
  width: var(--ui-inspector-width);
  height: 100%;
}

.studio-context-inspector--collapsed {
  display: grid;
  width: var(--ui-inspector-rail-width);
  height: 100%;
}

.studio-context-inspector__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.studio-context-inspector__content[hidden] {
  display: none;
}

.studio-context-inspector__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-context-inspector__identity {
  min-width: 0;
}

.studio-context-inspector__identity h2,
.studio-context-inspector__identity p,
.studio-context-inspector__section h3,
.studio-context-inspector__section h4,
.studio-context-inspector__section p,
.studio-context-inspector__section dl,
.studio-context-inspector__section dt,
.studio-context-inspector__section dd,
.studio-context-inspector__queue-list {
  margin: 0;
}

.studio-context-inspector__identity h2 {
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.studio-context-inspector__identity p {
  overflow: hidden;
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__scroll {
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.studio-context-inspector__section {
  padding: var(--ui-space-4);
}

.studio-context-inspector__section + .studio-context-inspector__section {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.studio-context-inspector__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}

.studio-context-inspector__section-heading :deep(.ui-chip) {
  -webkit-user-select: none;
  user-select: none;
}

.studio-context-inspector__section :deep(.ui-hint) {
  -webkit-user-select: text;
  user-select: text;
}

.studio-context-inspector__section h3 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-context-inspector__current-identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-3);
}

.studio-context-inspector__current-artwork {
  box-shadow: var(--ui-shadow-contact);
}

.studio-context-inspector__current-copy,
.studio-context-inspector__queue-copy {
  min-width: 0;
}

.studio-context-inspector__current-copy h4 {
  overflow: hidden;
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__current-copy p,
.studio-context-inspector__queue-copy p,
.studio-context-inspector__queue-duration,
.studio-context-inspector__queue-index,
.studio-context-inspector__section dt,
.studio-context-inspector__section dd {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-context-inspector__current-copy p,
.studio-context-inspector__queue-copy p,
.studio-context-inspector__section dt,
.studio-context-inspector__queue-index {
  color: var(--ui-color-text-muted);
}

.studio-context-inspector__current dl {
  display: grid;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
}

.studio-context-inspector__current dl div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--ui-space-3);
}

.studio-context-inspector__section dd {
  overflow: hidden;
  max-width: 10rem;
  font-weight: var(--ui-font-weight-semibold);
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__queue-list {
  display: grid;
  gap: var(--ui-space-1);
  padding: 0;
  list-style: none;
}

.studio-context-inspector__queue-item {
  display: grid;
  grid-template-columns: 1.5rem auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-track-row-min-height);
  padding-block: var(--ui-space-1);
}

.studio-context-inspector__queue-copy h4,
.studio-context-inspector__queue-copy p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-context-inspector__queue-copy h4 {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.studio-context-inspector__queue-duration,
.studio-context-inspector__queue-index {
  font-variant-numeric: tabular-nums;
}

.studio-context-inspector__identity p,
.studio-context-inspector__current-copy,
.studio-context-inspector__current dl dd,
.studio-context-inspector__queue-copy {
  -webkit-user-select: text;
  user-select: text;
}

.studio-context-inspector__identity h2,
.studio-context-inspector__section h3,
.studio-context-inspector__section dt,
.studio-context-inspector__queue-duration,
.studio-context-inspector__queue-index {
  -webkit-user-select: none;
  user-select: none;
}

/* Paired with AppArchiveFrame's temporary context plane. Keep the literal in
   sync through AppArchiveFrame.behavior.test.js rather than inventing a token
   that CSS media queries cannot consume. */
@media (max-width: 70rem) {
  .studio-context-inspector--open {
    width: min(
      var(--ui-inspector-width),
      calc(100vw - var(--ui-inspector-rail-width))
    );
    box-shadow: var(--ui-shadow-overlay);
  }
}
</style>

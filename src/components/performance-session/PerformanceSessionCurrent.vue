<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Check, Play, Pause, Square } from '../../icons/index.js';
import QueueSection from '../queue/QueueSection.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  current: { type: Object, default: null },
  playerTrack: { type: Object, default: null },
  tracks: { type: Array, default: () => [] },
  phase: { type: String, default: 'idle' },
  confirmed: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  canStart: { type: Boolean, default: false },
});
const emit = defineEmits(['startFirst', 'toggle', 'complete', 'stop']);
const selectedTrackId = shallowRef(null);
const menuAnchor = shallowRef(null);
const track = computed(() => {
  if (!props.current) return props.playerTrack;
  const canonical = props.tracks.find(
    (track) => track.id === props.current.trackId,
  );
  return {
    ...canonical,
    id: props.current.trackId ?? props.current.itemId,
    title: props.current.displayTitle,
    artist: props.current.displayArtist,
  };
});
const manual = computed(() => props.current?.mode === 'manual');
const playbackDisabled = computed(
  () => props.busy || manual.value || props.phase === 'ended',
);
const phaseLabel = computed(() =>
  manual.value
    ? '手動進行中'
    : ({
        playing: '播放中',
        paused: '已暫停',
        buffering: '載入中',
        seeking: '定位中',
        ended: '播放結束',
        error: '播放失敗',
        idle: '準備播放',
      }[props.phase] ?? '準備播放'),
);
const playbackLabel = computed(
  () =>
    `${props.phase === 'playing' ? '暫停' : '播放'}：${track.value?.title ?? ''}`,
);
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'current',
      items: [
        ...(!manual.value
          ? [
              {
                id: 'toggle',
                kind: 'action',
                value: 'toggle',
                label: props.phase === 'playing' ? '暫停' : '播放',
                icon: props.phase === 'playing' ? Pause : Play,
                disabled: playbackDisabled.value,
              },
            ]
          : []),
        ...(props.current
          ? [
              {
                id: 'complete',
                kind: 'action',
                value: 'complete',
                label: '標記完成',
                icon: Check,
                disabled: props.busy || !props.confirmed,
              },
              {
                id: 'stop',
                kind: 'action',
                value: 'stop',
                label: '停止',
                icon: Square,
              },
            ]
          : []),
      ],
    },
  ],
}));
function toggle() {
  if (track.value && !playbackDisabled.value) emit('toggle');
}
function openMenu({ event }) {
  event.preventDefault?.();
  event.stopPropagation?.();
  menuAnchor.value =
    event.type === 'contextmenu'
      ? { kind: 'point', x: event.clientX ?? 0, y: event.clientY ?? 0 }
      : { kind: 'element', element: event.currentTarget };
}
function selectAction(action) {
  menuAnchor.value = null;
  if (action === 'toggle') toggle();
  if (action === 'stop' && props.current) emit('stop');
  if (action === 'complete' && props.current && props.confirmed && !props.busy)
    emit('complete');
}
watch(
  () => props.current?.itemId ?? props.playerTrack?.id,
  () => {
    menuAnchor.value = null;
    selectedTrackId.value = null;
  },
);
</script>

<template>
  <div class="performance-session-current">
    <QueueSection
      title="現正播放"
      menu-context="arrangement-current"
      empty-text="尚未開始播放"
      :tracks="track ? [track] : []"
      :artist-text="current ? current.displayArtist : undefined"
      :selected-track-id="selectedTrackId"
      :current-track-id="track?.id"
      :playing-track-id="track?.id"
      :player-playing="!manual && phase === 'playing'"
      :playback-disabled="playbackDisabled"
      :playback-label="playbackLabel"
      :open-menu-key="
        menuAnchor && track ? `arrangement-current:${track.id}` : ''
      "
      @select-track="selectedTrackId = $event.id"
      @activate-track="toggle"
      @toggle-track-playback="toggle"
      @open-track-menu="openMenu"
    >
      <template #actions>
        <span
          v-if="track"
          class="performance-session-current__phase"
          role="status"
          aria-live="polite"
          >{{ phaseLabel }}</span
        >
      </template>
    </QueueSection>
    <div v-if="current || !track" class="performance-session-current__actions">
      <template v-if="current">
        <UiButton :icon="Square" @click="emit('stop')">停止</UiButton>
        <UiButton
          :icon="Check"
          variant="accent"
          :disabled="busy || !confirmed"
          @click="emit('complete')"
          >標記完成</UiButton
        >
      </template>
      <UiButton
        v-else
        :icon="Play"
        variant="accent"
        :disabled="busy || !canStart"
        @click="emit('startFirst')"
        >播放第一首</UiButton
      >
    </div>
    <UiActionMenu
      :open="!!menuAnchor"
      :anchor="menuAnchor"
      :content="menuContent"
      aria-label="目前播放操作"
      @select="selectAction"
      @close="menuAnchor = null"
    />
  </div>
</template>

<style scoped>
.performance-session-current {
  display: grid;
  gap: var(--ui-side-panel-content-gap);
  min-inline-size: 0;
}
.performance-session-current__phase {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.performance-session-current__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
</style>

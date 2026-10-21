<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Check, Play, Pause, Square } from '../../icons/index.js';
import QueueSection from '../queue/QueueSection.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'dock',
    validator: (value) => ['dock', 'workspace'].includes(value),
  },
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
  <div
    class="performance-session-current"
    :class="[
      `performance-session-current--${variant}`,
      { 'performance-session-current--empty': !track },
    ]"
  >
    <section
      v-if="variant === 'workspace'"
      class="performance-session-current__workspace"
      aria-label="目前項目"
    >
      <ul v-if="track" class="performance-session-current__identity">
        <UiTrackRow
          :track="track"
          :artist="track.artist || phaseLabel"
          current
          hide-duration
          overflow="ellipsis"
        >
          <template #artist>
            <span v-if="track.artist">{{ track.artist }} · </span>
            <span
              class="performance-session-current__phase"
              role="status"
              aria-live="polite"
              >{{ phaseLabel }}</span
            >
          </template>
        </UiTrackRow>
      </ul>
      <UiHint v-else>尚未開始播放</UiHint>
    </section>
    <QueueSection
      v-else
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
    <div
      v-if="current || !track || variant === 'workspace'"
      class="performance-session-current__actions"
    >
      <UiButton
        v-if="variant === 'workspace' && track && !manual"
        :icon="phase === 'playing' ? Pause : Play"
        :disabled="playbackDisabled"
        @click="toggle"
        >{{ phase === 'playing' ? '暫停' : '播放' }}</UiButton
      >
      <template v-if="current">
        <UiIconButton
          v-if="variant === 'dock'"
          :icon="Square"
          label="停止"
          @click="emit('stop')"
        />
        <UiButton v-else :icon="Square" @click="emit('stop')">停止</UiButton>
        <UiButton
          :icon="Check"
          variant="accent"
          :disabled="busy || !confirmed"
          @click="emit('complete')"
          >標記完成</UiButton
        >
      </template>
      <UiIconButton
        v-else-if="!track && variant === 'dock'"
        :icon="Play"
        variant="accent"
        :disabled="busy || !canStart"
        label="開始播放"
        @click="emit('startFirst')"
      />
      <UiButton
        v-else-if="!track"
        :icon="Play"
        variant="accent"
        :disabled="busy || !canStart"
        @click="emit('startFirst')"
        >開始播放</UiButton
      >
      <slot name="options" />
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
  align-items: center;
  gap: var(--ui-space-2);
}

.performance-session-current--workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-3);
}
.performance-session-current__workspace {
  min-inline-size: 0;
}
.performance-session-current__identity {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.performance-session-current--dock .performance-session-current__actions,
.performance-session-current--workspace .performance-session-current__actions {
  justify-content: flex-end;
}
@container performance-session-workspace (max-width: 32rem) {
  .performance-session-current--workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
@container performance-session-workspace (min-width:24rem) and (max-width:32rem) {
  .performance-session-current--workspace.performance-session-current--empty {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>

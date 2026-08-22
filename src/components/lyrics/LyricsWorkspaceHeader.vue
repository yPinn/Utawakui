<script setup>
import { ListMusic, RefreshCw } from '../../icons/index.js';
import SeparationPresetControl from '../separation/SeparationPresetControl.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  track: { type: Object, default: null },
  trackMeta: { type: String, default: '' },
  reloadStatus: { type: String, default: '' },
  isReloading: { type: Boolean, default: false },
  separationPresetOptions: { type: Array, default: () => [] },
  selectedSeparationPresetId: { type: String, required: true },
  separationPresetTitle: { type: String, default: '' },
  separationInFlight: { type: Boolean, default: false },
  separationProgressPercent: { type: Number, default: 0 },
  separationHasResult: { type: Boolean, default: false },
  separationError: { type: String, default: '' },
});

const emit = defineEmits([
  'selectTrack',
  'refresh',
  'separationPresetChange',
  'generateSeparation',
]);

function lyricsStatusLabel() {
  const status = props.track?.lyrics?.status;
  if (status === 'available') return '有歌詞';
  if (status === 'missing') return '無歌詞';
  return '未掃描歌詞';
}

function lyricsStatusTone() {
  return props.track?.lyrics?.status === 'available' ? 'accent' : 'muted';
}

function lyricsStatusOverrides() {
  if (props.track?.lyrics?.status) return {};
  return {
    background: 'var(--ui-color-surface-hover)',
    color: 'var(--ui-color-text)',
  };
}
</script>

<template>
  <header class="lyrics-workspace-header">
    <div class="lyrics-workspace-header__text">
      <div class="lyrics-workspace-header__title-row">
        <h2 class="lyrics-workspace-header__title">
          {{ track?.title || '未選取歌曲' }}
        </h2>
        <UiChip
          v-if="track"
          class="lyrics-workspace-header__status-badge"
          :tone="lyricsStatusTone()"
          v-bind="lyricsStatusOverrides()"
        >
          {{ lyricsStatusLabel() }}
        </UiChip>
      </div>
      <p v-if="trackMeta" class="lyrics-workspace-header__meta">
        {{ trackMeta }}
      </p>
      <p
        v-if="reloadStatus"
        class="lyrics-workspace-header__reload-status"
        role="status"
      >
        {{ reloadStatus }}
      </p>
    </div>

    <div class="lyrics-workspace-header__controls">
      <SeparationPresetControl
        :has-track="Boolean(track)"
        :preset-options="separationPresetOptions"
        :selected-preset-id="selectedSeparationPresetId"
        :preset-title="separationPresetTitle"
        :in-flight="separationInFlight"
        :progress-percent="separationProgressPercent"
        :has-result="separationHasResult"
        :error="separationError"
        @preset-change="emit('separationPresetChange', $event)"
        @generate="emit('generateSeparation')"
      />

      <span class="lyrics-workspace-header__divider" aria-hidden="true"></span>

      <div class="lyrics-workspace-header__actions">
        <UiButton
          :icon="ListMusic"
          title="選擇歌詞曲目"
          aria-label="選擇歌詞曲目"
          @click="emit('selectTrack')"
        >
          選曲
        </UiButton>
        <UiButton
          :icon="RefreshCw"
          :active="isReloading"
          title="重新掃描歌詞"
          aria-label="重新掃描歌詞"
          @click="emit('refresh')"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
.lyrics-workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-workspace-header__text {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-workspace-header__title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.lyrics-workspace-header__title,
.lyrics-workspace-header__meta,
.lyrics-workspace-header__reload-status {
  margin: 0;
}

.lyrics-workspace-header__title {
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-headline);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-workspace-header__meta,
.lyrics-workspace-header__reload-status {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-workspace-header__meta {
  color: var(--ui-color-text-muted);
}

.lyrics-workspace-header__reload-status {
  color: var(--ui-color-accent);
}

.lyrics-workspace-header__status-badge {
  flex: 0 0 auto;
  padding: var(--ui-space-1) var(--ui-space-2);
}

.lyrics-workspace-header__controls,
.lyrics-workspace-header__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.lyrics-workspace-header__divider {
  width: var(--ui-border-width);
  height: var(--ui-control-height);
  flex: 0 0 var(--ui-border-width);
  background: var(--ui-color-border);
}

@container (max-width: 48rem) {
  .lyrics-workspace-header {
    align-items: stretch;
    flex-direction: column;
  }

  .lyrics-workspace-header__controls {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>

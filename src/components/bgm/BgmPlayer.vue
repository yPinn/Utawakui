<script setup>
import { computed, nextTick, shallowRef, useId, useTemplateRef } from 'vue';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useBgmStandbyPlan } from '../../composables/useBgmStandbyPlan.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { projectBgmOperationalStatus } from './bgmPresentation.js';
import BgmCurrentSource from './BgmCurrentSource.vue';
import BgmPlayerTransport from './BgmPlayerTransport.vue';
import BgmTrackPicker from './BgmTrackPicker.vue';
defineProps({
  variant: {
    type: String,
    default: 'session',
    validator: (value) => ['session', 'dock'].includes(value),
  },
});
const {
  state,
  handoffState,
  deckState,
  currentTrack,
  settings,
  playBgm,
  pauseBgm,
  emergencyCut,
  seekBgm,
  commitBgmPosition,
  setDimmed,
  previewVolume,
  setVolume,
  setMuted,
} = useBgmSession();
const { state: planState, setTrack } = useBgmStandbyPlan();
const { state: library } = useLibrary();
const pickerExpanded = shallowRef(false),
  searchQuery = shallowRef('');
const sourceControl = useTemplateRef('sourceControl');
const picker = useTemplateRef('picker');
const pickerId = 'session-bgm-picker-' + useId();
const error = computed(
  () => state.error || handoffState.error || deckState.error || '',
);
const operationalStatus = computed(() =>
  projectBgmOperationalStatus({
    phase: handoffState.phase,
    restorePending: handoffState.restorePending,
    error: error.value,
  }),
);
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return library.tracks
    .filter(
      (track) =>
        track.id !== planState.plan.currentTrackId &&
        [track.title, track.artist].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(query),
        ),
    )
    .slice(0, 8);
});
async function changeTrack(trackId) {
  const active = globalThis.document?.activeElement;
  const restoreFocus = Boolean(picker.value?.$el?.contains(active));
  if (await setTrack(trackId)) {
    searchQuery.value = '';
    pickerExpanded.value = false;
    await nextTick();
    if (
      restoreFocus &&
      (document.activeElement === active ||
        document.activeElement === document.body)
    )
      sourceControl.value?.focusPicker();
  }
}
</script>
<template>
  <section
    class="bgm-player"
    :class="{ 'bgm-player--dock': variant === 'dock' }"
    :aria-label="variant === 'dock' ? '場間音樂快捷' : '場間音樂'"
  >
    <div class="bgm-player__main">
      <BgmCurrentSource
        ref="sourceControl"
        :track="currentTrack"
        :status="operationalStatus"
        :picker-expanded="pickerExpanded"
        :picker-controls="pickerId"
        @toggle-picker="pickerExpanded = !pickerExpanded"
      />
      <BgmPlayerTransport
        :variant="variant"
        :phase="handoffState.phase"
        :audible-lane="handoffState.audibleLane"
        :current-track="currentTrack"
        :is-dimmed="deckState.isDimmed"
        :is-muted="settings.isMuted"
        :dim-db="settings.dimDb"
        :volume="settings.volume"
        :current-time="deckState.currentTime"
        :duration="deckState.duration"
        @play="playBgm"
        @pause="pauseBgm"
        @cut="emergencyCut"
        @set-dimmed="setDimmed"
        @set-muted="setMuted"
        @preview-volume="previewVolume"
        @commit-volume="setVolume"
        @seek="seekBgm"
        @commit-position="commitBgmPosition"
      />
    </div>
    <BgmTrackPicker
      v-if="pickerExpanded"
      :id="pickerId"
      ref="picker"
      class="bgm-player__picker"
      :search-query="searchQuery"
      :search-results="searchResults"
      :is-loading="library.isLoading"
      :is-saving="planState.isSaving"
      :error="planState.validationError?.message ?? planState.error ?? ''"
      @update:search-query="searchQuery = $event"
      @select="changeTrack"
    />
  </section>
</template>
<style scoped>
.bgm-player {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
  min-block-size: 0;
}
.bgm-player__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}
.bgm-player__picker {
  max-block-size: calc(var(--ui-track-row-min-height) * 3 + var(--ui-space-7));
}
.bgm-player--dock .bgm-player__main {
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-1);
  align-items: center;
}
@container performance-session-workspace (max-width:28rem) {
  .bgm-player:not(.bgm-player--dock) .bgm-player__main {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
</style>

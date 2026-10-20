<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const queue = computed(() => props.scene?.queue ?? []);
const currentTrack = computed(
  () => queue.value.find((item) => item.state === 'current') ?? null,
);
const completedTracks = computed(() =>
  queue.value.filter((item) => item.state === 'played'),
);
const setlistHistoryViewport = useTemplateRef('setlistHistoryViewport');
const setlistHistoryList = useTemplateRef('setlistHistoryList');
const setlistHistoryOverflow = ref(false);
const setlistHistoryScrollDistance = ref(0);
const setlistHistoryScrollDuration = ref(0);
const setlistHistoryStyle = computed(() => ({
  '--ui-setlist-scroll-distance': `${setlistHistoryScrollDistance.value}px`,
  '--ui-setlist-scroll-duration': `${setlistHistoryScrollDuration.value}s`,
}));

function measureSetlistHistory() {
  if (!setlistHistoryViewport.value || !setlistHistoryList.value) {
    setlistHistoryOverflow.value = false;
    setlistHistoryScrollDistance.value = 0;
    setlistHistoryScrollDuration.value = 0;
    return;
  }

  const contentHeight = setlistHistoryViewport.value.scrollHeight;
  const viewportHeight = setlistHistoryViewport.value.clientHeight;
  const distance = Math.max(0, Math.ceil(contentHeight - viewportHeight));
  setlistHistoryOverflow.value = distance > 0;
  setlistHistoryScrollDistance.value = distance;
  setlistHistoryScrollDuration.value = distance
    ? Math.max(12, Math.ceil((distance / 18 + 4) * 10) / 10)
    : 0;
}

watch(
  [setlistHistoryViewport, setlistHistoryList],
  ([viewport, list], _previous, onCleanup) => {
    if (!viewport || !list) return;
    if (typeof ResizeObserver === 'undefined') {
      void nextTick(measureSetlistHistory);
      return;
    }

    const resizeObserver = new ResizeObserver(measureSetlistHistory);
    resizeObserver.observe(viewport);
    resizeObserver.observe(list);
    void nextTick(measureSetlistHistory);
    onCleanup(() => resizeObserver.disconnect());
  },
  { immediate: true },
);

watch([completedTracks, () => props.size], async () => {
  setlistHistoryOverflow.value = false;
  await nextTick();
  measureSetlistHistory();
});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--setlist"
  >
    <span class="obs-template-mockup__setlist-current">
      <span class="obs-template-mockup__setlist-header">
        <span class="obs-template-mockup__setlist-label">Now Singing</span>
        <strong class="obs-template-mockup__setlist-source">{{
          scene.sourceName ?? ''
        }}</strong>
      </span>
      <span class="obs-template-mockup__setlist-current-track">
        <strong class="obs-template-mockup__setlist-current-title">
          {{ currentTrack?.title }}
        </strong>
        <span class="obs-template-mockup__setlist-current-artist">
          {{ currentTrack?.artist }}
        </span>
      </span>
    </span>

    <span class="obs-template-mockup__setlist-history">
      <span class="obs-template-mockup__setlist-header">
        <span class="obs-template-mockup__setlist-label">Set List</span>
        <span class="obs-template-mockup__setlist-caption">已唱紀錄</span>
      </span>
      <span
        ref="setlistHistoryViewport"
        class="obs-template-mockup__setlist-history-viewport"
        :data-history-motion="animated ? 'running' : 'paused'"
        :data-history-overflow="setlistHistoryOverflow ? 'true' : 'false'"
        :style="setlistHistoryStyle"
      >
        <ol
          ref="setlistHistoryList"
          class="obs-template-mockup__setlist-history-list"
        >
          <li
            v-for="item in completedTracks"
            :key="`${item.number}-${item.title}`"
            class="obs-template-mockup__setlist-history-row"
          >
            <span class="obs-template-mockup__queue-number">
              {{ item.number }}
            </span>
            <strong class="obs-template-mockup__queue-title">
              {{ item.title }}
            </strong>
            <span class="obs-template-mockup__setlist-artist">
              {{ item.artist }}
            </span>
          </li>
        </ol>
      </span>
    </span>
  </div>
</template>

<style src="./QueueBoardPreview.css"></style>

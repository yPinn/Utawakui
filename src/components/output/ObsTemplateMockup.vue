<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import {
  mangaFrameLengthTier,
  mangaFrameSideForLine,
  mangaFrameTextLayout,
} from '../../../shared/presentation/mangaFrameContract.mjs';
import {
  kineticPopBurstDelaySeconds,
  kineticPopRestPose,
} from '../../../shared/presentation/kineticPopMotion.mjs';
import {
  adaptKineticPopLyricsPresentation,
  adaptKtvLyricsPresentation,
  adaptLiveStageLyricsPresentation,
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
  parseKtvDisplayPhrases,
} from '../../../shared/presentation/lyricsPresentation.mjs';
import MangaFrameSvg from './MangaFrameSvg.vue';
import OrnateVerticalPreview from './OrnateVerticalPreview.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
  size: {
    type: String,
    default: 'detail',
    validator: (value) => ['thumbnail', 'detail'].includes(value),
  },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
const nextTrack = computed(() => props.scene?.nextTrack ?? {});
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
const lyrics = computed(() => props.scene?.lyrics ?? {});
const kineticPreviewArrangement = computed(
  () => lyrics.value.kinetic?.arrangement ?? 'straight',
);
const kineticPreviewLine = computed(() => {
  const samples = lyrics.value.kinetic?.samples ?? [];
  const text = samples[1] ?? 'すてっぷ';
  const presentation = adaptKineticPopLyricsPresentation(text, {
    kineticMaterial: 'candy-rim',
  });
  let unitIndex = 0;
  return {
    ...presentation,
    rows: presentation.rows.map((row) => {
      return {
        ...row,
        units: row.units.map((unit) => {
          const restPose = kineticPopRestPose(
            unitIndex,
            kineticPreviewArrangement.value,
          );
          const previewUnit = {
            delay: `${kineticPopBurstDelaySeconds(unitIndex)}s`,
            restRotation: `${restPose.rotation}deg`,
            restScale: String(restPose.scale),
            restX: `${restPose.xEm}em`,
            restY: `${restPose.yEm}em`,
            text: unit.text,
          };
          unitIndex += 1;
          return previewUnit;
        }),
      };
    }),
  };
});
const mangaLyrics = computed(() => lyrics.value.manga ?? lyrics.value);
const mangaSide = computed(() => mangaFrameSideForLine(lyrics.value.lineIndex));
const lyricsSourceAnalysis = computed(() =>
  analyzeLyricsSource(lyrics.value.current),
);
const liveStageLines = computed(
  () => adaptLiveStageLyricsPresentation(lyricsSourceAnalysis.value).lines,
);
const ktvCurrentSource = computed(() =>
  adaptKtvLyricsPresentation(lyricsSourceAnalysis.value, {
    language: lyrics.value.language,
  }),
);
const ktvNextAnalysis = computed(() => analyzeLyricsSource(lyrics.value.next));
const ktvNextSource = computed(() =>
  adaptKtvLyricsPresentation(ktvNextAnalysis.value, {
    language: lyrics.value.language,
  }),
);
const ktvDisplayPhrases = computed(() => [
  ...parseKtvDisplayPhrases(lyricsSourceAnalysis.value, {
    language: lyrics.value.language,
  }).map((phrase) => ({ ...phrase, role: ktvCurrentSource.value.role })),
  ...parseKtvDisplayPhrases(ktvNextAnalysis.value, {
    language: lyrics.value.language,
  }).map((phrase) => ({ ...phrase, role: ktvNextSource.value.role })),
]);
const ktvCurrent = computed(
  () =>
    ktvDisplayPhrases.value[0] ?? {
      text: ktvCurrentSource.value.text,
      role: ktvCurrentSource.value.role,
    },
);
const ktvNext = computed(
  () =>
    ktvDisplayPhrases.value[1] ?? {
      text: ktvNextSource.value.text,
      role: ktvNextSource.value.role,
    },
);
const mangaBubbles = computed(() => {
  const analysis = analyzeLyricsSource(mangaLyrics.value.current);
  const bubbles = adaptMangaLyricsPresentation(analysis, {
    language: mangaLyrics.value.language,
  }).bubbles;
  return bubbles.map((bubble) => ({
    ...bubble,
    layout: mangaFrameTextLayout(bubble.text, bubbles.length, {
      language: mangaLyrics.value.language,
      readingLine: mangaLyrics.value.reading,
      sourceRanges: bubble.sourceRanges,
    }),
  }));
});
</script>

<template>
  <div
    class="obs-template-mockup"
    :data-kind="preset?.kind ?? 'generic'"
    :data-size="size"
    :data-template-id="preset?.id ?? 'generic'"
    :data-tone="preset?.tone"
    :data-motion="animated ? 'playing' : 'paused'"
    aria-hidden="true"
  >
    <div
      v-if="preset?.kind === 'setlist'"
      class="obs-template-mockup__content obs-template-mockup__content--setlist"
    >
      <span class="obs-template-mockup__setlist-current">
        <span class="obs-template-mockup__setlist-header">
          <span class="obs-template-mockup__setlist-label">Now Singing</span>
          <strong class="obs-template-mockup__setlist-source">Tonight</strong>
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

    <div
      v-else-if="preset?.kind === 'lyrics'"
      class="obs-template-mockup__content obs-template-mockup__content--lyrics"
    >
      <template v-if="preset?.id === 'live-stage'">
        <span class="obs-template-mockup__live-stage-brand">
          <strong>U</strong>
          <span>UTAWAKUI<br />LIVE STAGE</span>
        </span>
        <strong class="obs-template-mockup__live-stage-channel">UW</strong>
        <strong
          class="obs-template-mockup__live-stage-caption obs-template-mockup__animated-primary"
        >
          <span v-for="line in liveStageLines" :key="line">{{ line }}</span>
        </strong>
        <span
          class="obs-template-mockup__live-stage-card obs-template-mockup__animated-primary"
        >
          <span class="obs-template-mockup__live-stage-card-mark">
            <strong>U</strong>
            <span>LIVE</span>
          </span>
          <span class="obs-template-mockup__live-stage-card-copy">
            <strong>{{ track.title }}</strong>
            <span>{{ track.artist }}</span>
          </span>
        </span>
      </template>

      <template v-else-if="preset?.id === 'kinetic-pop'">
        <span class="obs-template-mockup__kinetic-stage">
          <strong
            class="obs-template-mockup__kinetic-line"
            :data-kinetic-material="kineticPreviewLine.material"
            :data-kinetic-arrangement="kineticPreviewArrangement"
          >
            <span
              v-for="(row, rowIndex) in kineticPreviewLine.rows"
              :key="`${kineticPreviewLine.material}-row-${rowIndex}`"
              class="obs-template-mockup__kinetic-row"
            >
              <span
                v-for="(unit, unitIndex) in row.units"
                :key="`${kineticPreviewLine.material}-${rowIndex}-${unitIndex}`"
                class="obs-template-mockup__kinetic-unit"
                :data-text="unit.text"
                :style="{
                  '--kinetic-unit-delay': unit.delay,
                  '--kinetic-rest-x': unit.restX,
                  '--kinetic-rest-y': unit.restY,
                  '--kinetic-rest-rotation': unit.restRotation,
                  '--kinetic-rest-scale': unit.restScale,
                }"
              >
                {{ unit.text }}
              </span>
            </span>
          </strong>
        </span>
      </template>

      <template v-else-if="preset?.id === 'ornate-vertical'">
        <OrnateVerticalPreview :animated="animated" :scene="lyrics.ornate" />
      </template>

      <template v-else-if="preset?.id === 'manga-frame'">
        <span
          class="obs-template-mockup__manga-bubbles"
          :data-manga-count="mangaBubbles.length"
          :data-manga-side="mangaSide"
        >
          <span
            v-for="(bubble, index) in mangaBubbles"
            :key="`${bubble.kind}-${index}`"
            class="obs-template-mockup__manga-bubble"
            :data-lyric-kind="bubble.kind"
            :data-manga-length="mangaFrameLengthTier(bubble.text)"
            :data-manga-language="bubble.layout.language"
            :data-manga-script="bubble.layout.script"
            :data-manga-columns="bubble.layout.columnCount"
            :style="{
              '--ui-manga-frame-required-block-size': `${bubble.layout.requiredBlockSizeEm}em`,
            }"
          >
            <MangaFrameSvg
              class="obs-template-mockup__manga-frame"
              frame-id="spoken"
            />
            <strong
              class="obs-template-mockup__title obs-template-mockup__title--manga"
            >
              <template
                v-for="(column, columnIndex) in bubble.layout.columnTokens"
                :key="columnIndex"
              >
                <br v-if="columnIndex > 0" />
                <template
                  v-for="(token, tokenIndex) in column"
                  :key="tokenIndex"
                >
                  <ruby v-if="token.reading">
                    {{ token.text }}<rt>{{ token.reading }}</rt>
                  </ruby>
                  <template v-else>{{ token.text }}</template>
                </template>
              </template>
            </strong>
          </span>
        </span>
      </template>

      <template v-else-if="preset?.id === 'karaoke-stack'">
        <span class="obs-template-mockup__ktv-lines">
          <span
            class="obs-template-mockup__ktv-count-in"
            :data-ktv-role="ktvCurrent.role"
            aria-hidden="true"
          >
            <span class="obs-template-mockup__ktv-count-in-dot" />
            <span class="obs-template-mockup__ktv-count-in-dot" />
            <span class="obs-template-mockup__ktv-count-in-dot" />
            <span class="obs-template-mockup__ktv-count-in-dot" />
          </span>
          <strong
            class="obs-template-mockup__ktv-line"
            data-ktv-lane="a"
            :data-ktv-role="ktvCurrent.role"
          >
            <span class="obs-template-mockup__ktv-line-base">
              {{ ktvCurrent.text }}
            </span>
            <span class="obs-template-mockup__ktv-line-fill" aria-hidden="true">
              {{ ktvCurrent.text }}
            </span>
          </strong>
          <strong
            class="obs-template-mockup__ktv-line"
            data-ktv-held="true"
            data-ktv-lane="b"
            :data-ktv-role="ktvNext.role"
          >
            {{ ktvNext.text }}
          </strong>
        </span>
      </template>

      <template v-else-if="preset?.id === 'reading-aid'">
        <span class="obs-template-mockup__reading">{{ lyrics.reading }}</span>
        <strong
          class="obs-template-mockup__title obs-template-mockup__animated-primary"
        >
          {{ lyrics.current }}
        </strong>
        <span class="obs-template-mockup__secondary">{{ lyrics.next }}</span>
      </template>

      <template v-else-if="preset?.id === 'quiet-caption'">
        <strong
          class="obs-template-mockup__title obs-template-mockup__title--quiet obs-template-mockup__animated-primary"
        >
          {{ lyrics.current }}
        </strong>
        <span class="obs-template-mockup__secondary">{{ lyrics.next }}</span>
      </template>

      <template v-else>
        <span class="obs-template-mockup__eyebrow">
          {{ track.title }} · {{ track.artist }}
        </span>
        <strong
          class="obs-template-mockup__title obs-template-mockup__animated-primary"
        >
          {{ lyrics.current }}
        </strong>
        <span class="obs-template-mockup__secondary">{{ lyrics.next }}</span>
      </template>
    </div>

    <div
      v-else-if="['art-card', 'cover-player'].includes(preset?.id)"
      class="obs-template-mockup__content obs-template-mockup__content--artwork"
    >
      <template v-if="preset?.id === 'cover-player'">
        <span class="obs-template-mockup__cover-player">
          <span
            class="obs-template-mockup__artwork obs-template-mockup__animated-primary"
          >
            {{ track.title?.slice(0, 1) }}
          </span>
          <span class="obs-template-mockup__cover-player-copy">
            <span class="obs-template-mockup__metadata">
              <strong class="obs-template-mockup__title">{{
                track.title
              }}</strong>
              <span class="obs-template-mockup__secondary">{{
                track.artist
              }}</span>
            </span>
            <span class="obs-template-mockup__progress">
              <span class="obs-template-mockup__progress-fill" />
            </span>
            <span class="obs-template-mockup__timeline">
              <span>0:23</span>
              <span>-3:27</span>
            </span>
            <span class="obs-template-mockup__transport">⇄ ◀ ▶ ▶| ↻</span>
          </span>
        </span>
      </template>
      <template v-else>
        <span class="obs-template-mockup__vinyl-stage">
          <span class="obs-template-mockup__vinyl-album">
            <span class="obs-template-mockup__vinyl-sleeve">
              <span class="obs-template-mockup__vinyl-artwork">
                {{ track.title?.slice(0, 1) }}
              </span>
              <span class="obs-template-mockup__vinyl-copy">
                <strong class="obs-template-mockup__title">
                  {{ track.title }}
                </strong>
                <span class="obs-template-mockup__secondary">
                  {{ track.artist }}
                </span>
              </span>
            </span>
          </span>
          <span class="obs-template-mockup__vinyl-turntable">
            <span class="obs-template-mockup__vinyl-deck-light" />
            <span class="obs-template-mockup__vinyl-platter">
              <span class="obs-template-mockup__vinyl-record">
                <span class="obs-template-mockup__vinyl-record-grooves" />
                <span class="obs-template-mockup__vinyl-label">UW</span>
              </span>
              <span class="obs-template-mockup__vinyl-spindle" />
            </span>
            <svg
              class="obs-template-mockup__vinyl-tonearm"
              viewBox="0 0 100 240"
              focusable="false"
            >
              <circle
                class="obs-template-mockup__vinyl-tonearm-pivot-edge"
                cx="66"
                cy="28"
                r="21"
              />
              <circle
                class="obs-template-mockup__vinyl-tonearm-pivot"
                cx="66"
                cy="28"
                r="18"
              />
              <path
                class="obs-template-mockup__vinyl-tonearm-pivot-highlight"
                d="M53 23 A14 14 0 0 1 72 16"
              />
              <circle
                class="obs-template-mockup__vinyl-tonearm-pivot-core"
                cx="66"
                cy="28"
                r="8"
              />
              <circle
                class="obs-template-mockup__vinyl-tonearm-pivot-pin"
                cx="66"
                cy="28"
                r="2.5"
              />
              <g class="obs-template-mockup__vinyl-tonearm-assembly">
                <rect
                  class="obs-template-mockup__vinyl-tonearm-counterweight-edge"
                  x="52"
                  y="0"
                  width="28"
                  height="15"
                  rx="7.5"
                />
                <rect
                  class="obs-template-mockup__vinyl-tonearm-counterweight"
                  x="53"
                  y="1"
                  width="26"
                  height="13"
                  rx="6.5"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-counterweight-highlight"
                  d="M58 4h14"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-counterweight-cap"
                  d="M76.5 3v9"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-rail-edge"
                  d="M66 28 C69 78 42 134 11.5 179"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-rail"
                  d="M66 28 C69 78 42 134 11.5 179"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-rail-highlight"
                  d="M65 28 C67.5 73 46 122 20 165"
                />
                <g
                  class="obs-template-mockup__vinyl-tonearm-head"
                  transform="translate(11.5 179) rotate(17)"
                >
                  <rect
                    class="obs-template-mockup__vinyl-tonearm-head-edge"
                    x="-7"
                    y="-5"
                    width="30"
                    height="15"
                    rx="4"
                  />
                  <rect
                    class="obs-template-mockup__vinyl-tonearm-head-body"
                    x="-6"
                    y="-4"
                    width="28"
                    height="13"
                    rx="3"
                  />
                  <path
                    class="obs-template-mockup__vinyl-tonearm-head-highlight"
                    d="M-2 -1h18"
                  />
                  <circle
                    class="obs-template-mockup__vinyl-tonearm-head-screw"
                    cx="16"
                    cy="5"
                    r="1.6"
                  />
                  <path
                    class="obs-template-mockup__vinyl-stylus obs-template-mockup__vinyl-stylus-cantilever"
                    d="M5 9v10"
                  />
                  <path
                    class="obs-template-mockup__vinyl-stylus-tip"
                    d="M5 19v4"
                  />
                </g>
              </g>
              <g class="obs-template-mockup__vinyl-tonearm-rest">
                <rect
                  class="obs-template-mockup__vinyl-tonearm-rest-base"
                  x="85"
                  y="116"
                  width="12"
                  height="6"
                  rx="2"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-rest-post"
                  d="M91 117v-12"
                />
                <path
                  class="obs-template-mockup__vinyl-tonearm-rest-cradle"
                  d="M84.5 108 Q91 114 97.5 108"
                />
              </g>
            </svg>
          </span>
        </span>
      </template>
    </div>

    <div
      v-else
      class="obs-template-mockup__content obs-template-mockup__content--now-playing"
    >
      <span class="obs-template-mockup__now-player">
        <span class="obs-template-mockup__now-player-shell">
          <span class="obs-template-mockup__now-disc">
            <span class="obs-template-mockup__now-disc-label">UW</span>
          </span>
          <span class="obs-template-mockup__now-spindle" />
          <span class="obs-template-mockup__now-pickup" />
          <span class="obs-template-mockup__now-controls">
            <span />
            <span />
            <span />
          </span>
        </span>
      </span>
      <span class="obs-template-mockup__now-information">
        <span class="obs-template-mockup__now-current">
          <strong
            class="obs-template-mockup__title obs-template-mockup__animated-primary"
          >
            {{ track.title }}
          </strong>
          <span class="obs-template-mockup__secondary">{{ track.artist }}</span>
        </span>
        <span class="obs-template-mockup__now-next">
          下一首
          <strong>{{ nextTrack.title }}</strong>
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./ObsTemplateMockup.base.css"></style>
<style scoped src="./ObsTemplateMockup.now-playing.css"></style>
<style scoped src="./ObsTemplateMockup.live-stage.css"></style>
<style scoped src="./ObsTemplateMockup.setlist.css"></style>
<style scoped src="./ObsTemplateMockup.cover-player.css"></style>
<style scoped src="./ObsTemplateMockup.karaoke.css"></style>
<style scoped src="./ObsTemplateMockup.kinetic-pop.css"></style>
<style scoped src="./ObsTemplateMockup.manga.css"></style>
<style scoped src="./ObsTemplateMockup.motion.css"></style>
<style scoped src="./ObsTemplateMockup.thumbnail.css"></style>
<!-- Keyframes stay unscoped: Vue only renames an animation reference when its
  @keyframes sit in the same scoped block, and these are split from their users.
  The names are unique to this component. -->
<style src="./ObsTemplateMockup.keyframes.css"></style>
<style scoped src="./ObsTemplateMockup.reduced-motion.css"></style>

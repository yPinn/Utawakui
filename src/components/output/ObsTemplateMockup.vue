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

<style scoped>
@font-face {
  font-family: 'Utawakui Open Huninn';
  src: url('../../../shared/assets/fonts/jf-open-huninn-2.1.ttf')
    format('truetype');
  font-display: swap;
  font-style: normal;
  font-weight: 400;
}

@font-face {
  font-family: 'Utawakui M PLUS Rounded 1c';
  src: url('../../../shared/assets/fonts/MPLUSRounded1c-ExtraBold.ttf')
    format('truetype');
  font-display: swap;
  font-style: normal;
  font-weight: 800;
}

@font-face {
  font-family: 'Utawakui Keifont';
  src: url('../../../shared/assets/fonts/Keifont.ttf') format('truetype');
  font-display: swap;
  font-style: normal;
  font-weight: 900;
}

@font-face {
  font-family: 'Utawakui GenEi Antique';
  src: url('../../../shared/assets/fonts/GenEiAntiqueNv6-M.ttf')
    format('truetype');
  font-display: swap;
  font-style: normal;
  font-weight: 500;
}

.obs-template-mockup {
  --obs-preview-bg: var(--ui-output-preview-canvas);
  --obs-preview-surface: var(--ui-output-preview-surface);
  --obs-preview-ink: var(--ui-output-preview-text);
  --obs-preview-muted: var(--ui-output-preview-text-muted);
  --obs-preview-accent: var(--ui-output-preview-accent);

  width: 100%;
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  min-width: 0;
  overflow: hidden;
  display: grid;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--obs-preview-bg);
  color: var(--obs-preview-ink);
  contain: layout paint;
}

.obs-template-mockup[data-size='detail'] {
  max-inline-size: var(--ui-output-gallery-preview-max-width);
  justify-self: center;
}

.obs-template-mockup[data-tone='stage'] {
  --obs-preview-bg: var(--ui-output-preview-stage-canvas);
  --obs-preview-accent: var(--ui-output-preview-stage-accent);
}

.obs-template-mockup[data-template-id='karaoke-stack'] {
  --obs-preview-bg: var(--ui-output-preview-ktv-canvas);
}

.obs-template-mockup[data-template-id='kinetic-pop'] {
  --obs-preview-bg: var(--ui-output-preview-canvas);
}

.obs-template-mockup[data-tone='lyrics'] {
  --obs-preview-bg: var(--ui-output-preview-lyrics-canvas);
  --obs-preview-surface: var(--ui-output-preview-lyrics-surface);
}

.obs-template-mockup[data-template-id='reading-aid'] {
  --obs-preview-bg: var(--ui-output-preview-reading-canvas);
  --obs-preview-accent: var(--ui-output-preview-reading-accent);
}

.obs-template-mockup[data-tone='manga'] {
  --obs-preview-bg: var(--ui-output-preview-manga-canvas);
  --obs-preview-ink: var(--ui-output-preview-manga-ink);
  --obs-preview-muted: var(--ui-output-preview-manga-ink);
}

.obs-template-mockup__content {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  text-align: left;
}

.obs-template-mockup__content--now-playing {
  grid-template-columns: repeat(10, minmax(0, 1fr));
  align-items: center;
  gap: 0;
}

.obs-template-mockup__now-player {
  grid-column: 1 / span 3;
  min-width: 0;
  display: grid;
  place-items: center;
  padding-inline-end: var(--ui-space-2);
}

.obs-template-mockup__now-player-shell {
  position: relative;
  width: min(100%, var(--ui-output-template-detail-artwork-size));
  aspect-ratio: 1;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background:
    linear-gradient(
      145deg,
      var(--obs-preview-surface),
      transparent 42%,
      var(--obs-preview-accent)
    ),
    var(--obs-preview-surface);
}

.obs-template-mockup__now-player-shell::before,
.obs-template-mockup__now-player-shell::after {
  position: absolute;
  content: '';
}

.obs-template-mockup__now-player-shell::before {
  inset: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
}

.obs-template-mockup__now-player-shell::after {
  inset-inline: 12%;
  inset-block-end: 8%;
  height: var(--ui-output-preview-player-track-size);
  border-radius: var(--ui-radius-xs);
  background: var(--obs-preview-accent);
}

.obs-template-mockup__now-disc {
  position: relative;
  width: 72%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 50%;
  background:
    radial-gradient(
      circle at center,
      var(--obs-preview-bg) 0 13%,
      transparent 13.5% 20%,
      var(--obs-preview-surface) 20.5% 27%,
      transparent 27.5%
    ),
    conic-gradient(
      from 24deg,
      var(--obs-preview-muted),
      transparent 14%,
      var(--obs-preview-accent) 24%,
      transparent 38%,
      var(--obs-preview-ink) 52%,
      transparent 66%,
      var(--obs-preview-accent) 82%,
      transparent 94%,
      var(--obs-preview-muted)
    );
}

.obs-template-mockup__now-disc::before {
  position: absolute;
  inset: 8%;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 50%;
  content: '';
}

.obs-template-mockup__now-disc-label {
  position: relative;
  z-index: 1;
  width: 27%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--obs-preview-bg);
  color: var(--obs-preview-ink);
  font-size: var(--ui-output-template-thumb-caption-font-size);
  font-weight: var(--ui-font-weight-heavy);
  letter-spacing: -0.03em;
}

.obs-template-mockup__now-spindle {
  position: absolute;
  inset-inline-start: 50%;
  inset-block-start: 50%;
  width: var(--ui-space-1);
  aspect-ratio: 1;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 50%;
  background: var(--obs-preview-muted);
  transform: translate(-50%, -50%);
}

.obs-template-mockup__now-pickup {
  position: absolute;
  inset-inline-end: 15%;
  inset-block-start: 15%;
  width: 31%;
  height: var(--ui-output-preview-player-track-size);
  border-radius: var(--ui-radius-xs);
  background: var(--obs-preview-ink);
  transform: rotate(43deg);
  transform-origin: 100% 50%;
}

.obs-template-mockup__now-pickup::after {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 50%;
  width: var(--ui-space-2);
  aspect-ratio: 1;
  border-radius: var(--ui-radius-xs);
  background: var(--obs-preview-accent);
  content: '';
  transform: translate(-35%, -50%);
}

.obs-template-mockup__now-controls {
  position: absolute;
  inset-inline-start: 11%;
  inset-block-end: 8%;
  display: flex;
  gap: var(--ui-space-1);
}

.obs-template-mockup__now-controls > span {
  width: var(--ui-space-1);
  aspect-ratio: 1;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 50%;
  background: var(--obs-preview-surface);
}

.obs-template-mockup__now-information {
  grid-column: 5 / span 6;
  min-width: 0;
  min-height: 68%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-content: center;
  padding-inline: var(--ui-space-3) var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-template-mockup__now-current {
  min-width: 0;
  align-self: center;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-template-mockup__now-information .obs-template-mockup__title {
  font-size: var(--ui-font-size-xl);
}

.obs-template-mockup__now-next {
  min-width: 0;
  display: flex;
  gap: var(--ui-space-1);
  padding-block-start: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--obs-preview-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
}

.obs-template-mockup__now-next strong {
  min-width: 0;
  overflow: hidden;
  color: var(--obs-preview-ink);
  text-overflow: ellipsis;
}

.obs-template-mockup__content--lyrics {
  align-content: end;
}

.obs-template-mockup[data-template-id='manga-frame']
  .obs-template-mockup__content--lyrics {
  align-content: center;
  justify-items: stretch;
}

.obs-template-mockup[data-template-id='live-stage']
  .obs-template-mockup__content--lyrics {
  position: relative;
  padding: 0;
}

.obs-template-mockup__live-stage-brand,
.obs-template-mockup__live-stage-channel,
.obs-template-mockup__live-stage-caption,
.obs-template-mockup__live-stage-card {
  position: absolute;
}

.obs-template-mockup__live-stage-brand {
  inset-block-start: 8%;
  inset-inline-start: 6.25%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-output-template-thumb-caption-font-size);
  font-weight: var(--ui-font-weight-heavy);
  line-height: 1;
}

.obs-template-mockup__live-stage-brand > strong {
  width: var(--ui-space-5);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: var(--obs-preview-accent);
  color: var(--ui-output-preview-accent-contrast);
  font-size: var(--ui-font-size-md);
}

.obs-template-mockup__live-stage-channel {
  inset-block-start: 8%;
  inset-inline-end: 5%;
  font-size: var(--ui-font-size-lg);
  line-height: 1;
}

.obs-template-mockup__live-stage-caption {
  inset-inline-start: 6.25%;
  inset-block-end: 8.333%;
  inline-size: 20%;
  overflow: hidden;
  display: grid;
  font-size: var(--ui-font-size-md);
  line-height: 1.08;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__live-stage-card {
  inset-inline-end: 5%;
  inset-block-end: 8.333%;
  inline-size: 38%;
  min-inline-size: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--obs-preview-surface);
  color: var(--obs-preview-ink);
  text-align: left;
}

.obs-template-mockup__live-stage-card-mark {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding-inline: var(--ui-space-2);
  background: var(--obs-preview-accent);
  color: var(--ui-output-preview-accent-contrast);
  font-size: var(--ui-output-template-thumb-caption-font-size);
  font-weight: var(--ui-font-weight-heavy);
}

.obs-template-mockup__live-stage-card-copy {
  min-inline-size: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  overflow: hidden;
  font-size: var(--ui-output-template-thumb-caption-font-size);
  white-space: nowrap;
}

.obs-template-mockup__live-stage-card-copy > strong,
.obs-template-mockup__live-stage-card-copy > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.obs-template-mockup__live-stage-card-copy > span {
  color: var(--obs-preview-accent);
}

.obs-template-mockup__content--setlist {
  --ui-setlist-preview-current-title-size: var(--ui-font-size-xl);
  --ui-setlist-preview-history-title-size: var(--ui-font-size-md);
  --ui-setlist-preview-current-artist-size: var(--ui-font-size-sm);
  --ui-setlist-preview-history-artist-size: var(--ui-font-size-sm);
  --ui-setlist-preview-label-size: var(--ui-font-size-sm);
  --ui-setlist-preview-counter-size: var(--ui-font-size-sm);

  grid-template-rows: minmax(0, 2fr) minmax(0, 8fr);
  gap: var(--ui-space-3);
}

.obs-template-mockup__setlist-history {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.obs-template-mockup__setlist-history-viewport {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  padding-block-start: var(--ui-space-3);
}

.obs-template-mockup__setlist-history-list {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  row-gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.obs-template-mockup__setlist-history-viewport[data-history-overflow='true'][data-history-motion='running']
  .obs-template-mockup__setlist-history-list {
  animation: obs-template-setlist-scroll var(--ui-setlist-scroll-duration, 12s)
    linear infinite alternate;
}

.obs-template-mockup__setlist-header {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-block-end: var(--ui-space-1);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-template-mockup__setlist-label,
.obs-template-mockup__setlist-caption,
.obs-template-mockup__setlist-source {
  flex: 0 0 auto;
  color: var(--obs-preview-muted);
  font-size: var(--ui-setlist-preview-label-size);
  font-weight: var(--ui-font-weight-strong);
  letter-spacing: 0.06em;
  line-height: 1;
}

.obs-template-mockup__setlist-caption,
.obs-template-mockup__setlist-source {
  min-width: 0;
  overflow: hidden;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__setlist-history-row {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-space-5);
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: start;
  column-gap: var(--ui-space-1);
  padding-block: var(--ui-space-1);
  padding-inline: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  text-align: start;
}

.obs-template-mockup__setlist-history-row .obs-template-mockup__queue-number {
  grid-row: 1 / span 2;
  align-self: center;
  color: var(--obs-preview-muted);
  font-size: var(--ui-setlist-preview-counter-size);
  font-variant-numeric: tabular-nums;
}

.obs-template-mockup__content--setlist .obs-template-mockup__queue-title {
  grid-column: 2;
  grid-row: 1;
  font-size: var(--ui-setlist-preview-history-title-size);
}

.obs-template-mockup__setlist-artist {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  overflow: hidden;
  color: var(--obs-preview-muted);
  font-size: var(--ui-setlist-preview-history-artist-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__setlist-current {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.obs-template-mockup__setlist-current-track {
  min-width: 0;
  align-self: start;
  justify-self: stretch;
  display: grid;
  gap: var(--ui-space-1);
  padding-block-start: var(--ui-space-3);
  padding-inline: var(--ui-space-2);
  text-align: start;
}

.obs-template-mockup__setlist-current-title,
.obs-template-mockup__setlist-current-artist {
  min-width: 0;
  overflow: hidden;
}

.obs-template-mockup__setlist-current-title,
.obs-template-mockup__content--setlist .obs-template-mockup__queue-title {
  display: -webkit-box;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.obs-template-mockup__setlist-current-artist,
.obs-template-mockup__setlist-artist {
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__setlist-current-title {
  font-size: var(--ui-setlist-preview-current-title-size);
  letter-spacing: -0.02em;
  line-height: var(--ui-line-height-title);
}

.obs-template-mockup__setlist-current-artist {
  font-size: var(--ui-setlist-preview-current-artist-size);
}

.obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
  align-content: end;
  align-items: center;
  gap: var(--ui-space-3);
}

.obs-template-mockup[data-template-id='art-card']
  .obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  align-content: center;
  padding-block: var(--ui-space-2);
}

.obs-template-mockup__vinyl-stage {
  position: relative;
  width: min(94%, 28rem);
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-template-mockup__vinyl-album {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
}

.obs-template-mockup__vinyl-turntable {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  justify-self: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background:
    linear-gradient(
      128deg,
      transparent 0 42%,
      color-mix(
          in srgb,
          var(--ui-output-preview-vinyl-deck-metal-highlight) 24%,
          transparent
        )
        49%,
      transparent 56%
    ),
    repeating-linear-gradient(
      90deg,
      var(--ui-output-preview-vinyl-deck-metal) 0 1px,
      color-mix(
          in srgb,
          var(--ui-output-preview-vinyl-deck-metal-highlight) 30%,
          var(--ui-output-preview-vinyl-deck-metal)
        )
        1px 2px
    );
  box-shadow: inset 0 0 0 var(--ui-border-width)
    color-mix(
      in srgb,
      var(--ui-output-preview-vinyl-deck-metal-highlight) 48%,
      transparent
    );
}

.obs-template-mockup__vinyl-deck-light {
  position: absolute;
  z-index: 3;
  inset-inline-end: 8%;
  inset-block-end: 8%;
  width: var(--ui-space-3);
  height: var(--ui-space-3);
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    var(--ui-output-preview-vinyl-dark) 0 46%,
    var(--ui-color-border) 48% 54%,
    var(--ui-output-preview-vinyl-deck-metal-highlight) 56% 65%,
    var(--ui-output-preview-vinyl-deck-metal) 68%
  );
  box-shadow:
    inset 1px 1px 1px
      color-mix(
        in srgb,
        var(--ui-output-preview-vinyl-deck-metal-highlight) 72%,
        transparent
      ),
    inset -1px -1px 1px
      color-mix(in srgb, var(--ui-output-preview-vinyl-dark) 76%, transparent);
}

.obs-template-mockup__vinyl-deck-light::before,
.obs-template-mockup__vinyl-deck-light::after {
  grid-area: 1 / 1;
  place-self: center;
  border-radius: 50%;
  content: '';
}

.obs-template-mockup__vinyl-deck-light::before {
  width: 125%;
  height: 125%;
  background: color-mix(
    in srgb,
    var(--ui-output-preview-vinyl-sleeve-paper) 54%,
    transparent
  );
  filter: blur(var(--ui-space-1));
}

.obs-template-mockup__vinyl-deck-light::after {
  width: 38%;
  height: 38%;
  border-radius: 50%;
  background: var(--ui-output-preview-vinyl-sleeve-paper);
  box-shadow: 0 0 var(--ui-space-2)
    color-mix(
      in srgb,
      var(--ui-output-preview-vinyl-sleeve-paper) 62%,
      transparent
    );
  content: '';
}

.obs-template-mockup__vinyl-platter {
  position: absolute;
  inset-inline-start: 5%;
  inset-block-start: 50%;
  width: 82%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-output-preview-surface-muted);
  border-radius: 50%;
  background:
    repeating-radial-gradient(
      circle at center,
      transparent 0 9%,
      color-mix(in srgb, var(--ui-output-preview-vinyl-dark) 22%, transparent)
        9.5% 10.25%,
      color-mix(
          in srgb,
          var(--ui-output-preview-vinyl-highlight) 12%,
          transparent
        )
        10.5% 11%,
      transparent 11.5% 14%
    ),
    var(--ui-output-preview-vinyl-platter-rim);
  box-shadow:
    inset 0 0 0 var(--ui-space-1) var(--ui-output-preview-vinyl-dark),
    var(--ui-shadow-overlay);
  transform: translateY(-50%);
}

.obs-template-mockup__vinyl-record {
  position: relative;
  width: 90%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-output-preview-surface-muted);
  border-radius: 50%;
  background: conic-gradient(
    from 18deg,
    color-mix(
      in srgb,
      var(--ui-output-preview-vinyl-neutral-accent) 24%,
      var(--ui-output-preview-vinyl-dark)
    ),
    color-mix(
        in srgb,
        var(--ui-output-preview-vinyl-neutral-accent) 18%,
        var(--ui-output-preview-vinyl-highlight)
      )
      11%,
    var(--ui-output-preview-vinyl-dark) 24%,
    color-mix(
        in srgb,
        var(--ui-output-preview-vinyl-neutral-accent) 18%,
        var(--ui-output-preview-vinyl-highlight)
      )
      36%,
    var(--ui-output-preview-vinyl-dark) 51%,
    var(--ui-output-preview-vinyl-mid) 66%,
    var(--ui-output-preview-vinyl-dark) 81%,
    var(--ui-output-preview-vinyl-mid) 92%,
    var(--ui-output-preview-vinyl-dark)
  );
  box-shadow: inset 0 0 var(--ui-space-3) var(--ui-output-preview-vinyl-dark);
  animation: obs-preview-vinyl-spin 18s linear infinite;
  animation-play-state: paused;
}

.obs-template-mockup__vinyl-record-grooves {
  position: absolute;
  z-index: 1;
  inset: 7%;
  border: var(--ui-border-width) solid var(--ui-output-preview-vinyl-dark);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    transparent 0 15%,
    var(--ui-output-preview-surface-muted) 15.5% 16%,
    transparent 16.5% 41%,
    var(--ui-output-preview-vinyl-highlight) 41.5% 42%,
    transparent 42.5% 65%,
    var(--ui-output-preview-vinyl-dark) 65.5% 66%,
    transparent 66.5%
  );
  box-shadow:
    inset 0 0 0 var(--ui-border-width) var(--ui-output-preview-vinyl-highlight),
    inset 0 0 var(--ui-space-3) var(--ui-output-preview-vinyl-dark);
  pointer-events: none;
}

.obs-template-mockup__vinyl-label {
  position: relative;
  z-index: 2;
  width: 31%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-output-preview-surface-muted);
  border-radius: 50%;
  background: var(--ui-output-preview-vinyl-sleeve-paper);
  color: var(--ui-output-preview-vinyl-copy-ink);
  font-size: var(--ui-output-template-thumb-caption-font-size);
  font-weight: var(--ui-font-weight-heavy);
  letter-spacing: 0.08em;
}

.obs-template-mockup__vinyl-spindle {
  position: absolute;
  inset-inline-start: 50%;
  inset-block-start: 50%;
  width: var(--ui-space-1);
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--ui-output-preview-text);
  transform: translate(-50%, -50%);
}

.obs-template-mockup__vinyl-tonearm {
  position: absolute;
  z-index: 2;
  inset-inline-end: 2%;
  inset-block-start: 8%;
  width: 30%;
  height: 74%;
  overflow: visible;
}

.obs-template-mockup__vinyl-tonearm-pivot {
  fill: var(--ui-output-preview-vinyl-deck-metal);
}

.obs-template-mockup__vinyl-tonearm-pivot-edge {
  fill: var(--ui-color-border);
}

.obs-template-mockup__vinyl-tonearm-pivot-highlight {
  fill: none;
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-linecap: round;
  stroke-width: 2.5;
}

.obs-template-mockup__vinyl-tonearm-pivot-core {
  fill: var(--ui-output-preview-vinyl-dark);
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 2;
}

.obs-template-mockup__vinyl-tonearm-pivot-pin {
  fill: var(--ui-output-preview-vinyl-sleeve-paper);
  stroke: var(--ui-color-border);
  stroke-width: 1;
}

.obs-template-mockup__vinyl-tonearm-counterweight {
  fill: var(--ui-output-preview-vinyl-deck-metal);
}

.obs-template-mockup__vinyl-tonearm-counterweight-edge {
  fill: var(--ui-color-border);
}

.obs-template-mockup__vinyl-tonearm-counterweight-highlight,
.obs-template-mockup__vinyl-tonearm-counterweight-cap {
  fill: none;
  stroke-linecap: round;
}

.obs-template-mockup__vinyl-tonearm-counterweight-highlight {
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 1.5;
}

.obs-template-mockup__vinyl-tonearm-counterweight-cap {
  stroke: var(--ui-output-preview-vinyl-dark);
  stroke-width: 2;
}

.obs-template-mockup__vinyl-tonearm-rail-edge,
.obs-template-mockup__vinyl-tonearm-rail,
.obs-template-mockup__vinyl-tonearm-rail-highlight {
  fill: none;
  stroke-linecap: round;
}

.obs-template-mockup__vinyl-tonearm-rail-edge {
  stroke: var(--ui-output-preview-vinyl-dark);
  stroke-width: 10;
}

.obs-template-mockup__vinyl-tonearm-rail {
  stroke: var(--ui-output-preview-text-muted);
  stroke-width: 7;
}

.obs-template-mockup__vinyl-tonearm-rail-highlight {
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 2;
}

.obs-template-mockup__vinyl-tonearm-head-edge {
  fill: var(--ui-output-preview-canvas);
}

.obs-template-mockup__vinyl-tonearm-head-body {
  fill: var(--ui-output-preview-text);
}

.obs-template-mockup__vinyl-tonearm-head-highlight {
  fill: none;
  stroke: color-mix(in srgb, var(--ui-output-preview-text) 72%, transparent);
  stroke-linecap: round;
  stroke-width: 1.5;
}

.obs-template-mockup__vinyl-tonearm-head-screw {
  fill: var(--ui-output-preview-vinyl-dark);
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 0.8;
}

.obs-template-mockup__vinyl-stylus-cantilever,
.obs-template-mockup__vinyl-stylus-tip,
.obs-template-mockup__vinyl-tonearm-rest-post,
.obs-template-mockup__vinyl-tonearm-rest-cradle {
  fill: none;
  stroke-linecap: round;
}

.obs-template-mockup__vinyl-stylus-cantilever {
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 2.5;
}

.obs-template-mockup__vinyl-stylus-tip {
  stroke: var(--ui-output-preview-vinyl-dark);
  stroke-width: 3.5;
}

.obs-template-mockup__vinyl-tonearm-rest-base {
  fill: var(--ui-output-preview-vinyl-deck-metal);
  stroke: var(--ui-color-border);
  stroke-width: 1.5;
}

.obs-template-mockup__vinyl-tonearm-rest-post {
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 5;
}

.obs-template-mockup__vinyl-tonearm-rest-cradle {
  stroke: var(--ui-output-preview-vinyl-deck-metal-highlight);
  stroke-width: 4;
}

.obs-template-mockup[data-template-id='art-card']
  .obs-template-mockup__vinyl-sleeve {
  position: relative;
  z-index: 1;
  width: 100%;
  aspect-ratio: 1;
  container-type: inline-size;
  overflow: hidden;
  justify-self: start;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-output-preview-vinyl-sleeve-paper);
}

.obs-template-mockup__vinyl-sleeve::before,
.obs-template-mockup__vinyl-sleeve::after {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
  content: '';
}

.obs-template-mockup__vinyl-sleeve::before {
  border: calc(2 * var(--ui-border-width)) solid
    color-mix(
      in srgb,
      var(--ui-output-preview-vinyl-sleeve-paper) 86%,
      var(--ui-color-border)
    );
  box-shadow: inset 0 0 0 var(--ui-border-width)
    color-mix(in srgb, var(--ui-output-preview-canvas) 24%, transparent);
}

.obs-template-mockup__vinyl-sleeve::after {
  background:
    linear-gradient(
      94deg,
      transparent 0 38%,
      color-mix(
          in srgb,
          var(--ui-output-preview-vinyl-sleeve-paper) 46%,
          transparent
        )
        49%,
      transparent 58%
    ),
    repeating-linear-gradient(
      8deg,
      color-mix(
          in srgb,
          var(--ui-output-preview-vinyl-sleeve-paper) 34%,
          transparent
        )
        0 var(--ui-border-width),
      transparent var(--ui-border-width) var(--ui-space-1)
    );
  mix-blend-mode: soft-light;
  opacity: 0.035;
}

.obs-template-mockup__vinyl-artwork,
.obs-template-mockup__vinyl-copy {
  position: absolute;
  inset: 0;
}

.obs-template-mockup__vinyl-artwork {
  display: grid;
  place-items: center;
  background: var(--ui-output-preview-vinyl-sleeve-paper);
  color: var(--ui-output-preview-vinyl-copy-muted);
  font-size: var(--ui-font-size-2xl);
  font-weight: var(--ui-font-weight-heavy);
}

.obs-template-mockup__vinyl-copy {
  z-index: 3;
  display: grid;
  align-content: end;
  gap: var(--ui-output-template-thumb-tight-gap);
  padding: 30% var(--ui-space-2) var(--ui-space-2);
  background: linear-gradient(
    to bottom,
    transparent 42%,
    color-mix(
        in srgb,
        var(--ui-output-preview-vinyl-sleeve-paper) 24%,
        transparent
      )
      58%,
    color-mix(
        in srgb,
        var(--ui-output-preview-vinyl-sleeve-paper) 94%,
        transparent
      )
      100%
  );
  text-align: left;
}

.obs-template-mockup__vinyl-copy .obs-template-mockup__title {
  color: var(--ui-output-preview-vinyl-copy-ink);
  font-size: var(--ui-output-preview-vinyl-title-size);
  line-height: var(--ui-line-height-label);
}

.obs-template-mockup__vinyl-copy .obs-template-mockup__secondary {
  color: var(--ui-output-preview-vinyl-copy-muted);
  font-size: var(--ui-output-preview-vinyl-artist-size);
  font-weight: var(--ui-output-preview-vinyl-artist-weight);
}

.obs-template-mockup[data-motion='playing'] .obs-template-mockup__vinyl-record {
  animation-play-state: running;
}

.obs-template-mockup[data-template-id='cover-player']
  .obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 1fr);
  place-content: center;
  justify-items: center;
}

.obs-template-mockup__cover-player {
  width: 38%;
  min-width: 0;
  overflow: hidden;
  display: grid;
  gap: 0;
  padding: 0;
  border-radius: var(--ui-radius-sm);
  background: var(--obs-preview-surface);
}

.obs-template-mockup__cover-player-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2) var(--ui-space-2);
}

.obs-template-mockup__cover-player-copy .obs-template-mockup__metadata {
  gap: 0;
}

.obs-template-mockup__cover-player-copy .obs-template-mockup__title {
  font-size: var(--ui-output-template-thumb-title-font-size);
  line-height: var(--ui-line-height-label);
}

.obs-template-mockup__cover-player-copy .obs-template-mockup__secondary {
  font-size: var(--ui-output-template-thumb-caption-font-size);
}

.obs-template-mockup__cover-player-copy .obs-template-mockup__progress {
  height: var(--ui-output-preview-player-track-size);
}

.obs-template-mockup__timeline {
  display: flex;
  justify-content: space-between;
  color: var(--obs-preview-muted);
  font-size: var(--ui-output-template-thumb-caption-font-size);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.obs-template-mockup__transport {
  overflow: hidden;
  color: var(--obs-preview-ink);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  letter-spacing: var(--ui-space-1);
  text-align: center;
  white-space: nowrap;
}

.obs-template-mockup__artwork {
  width: 100%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: var(--ui-radius-sm);
  background: var(--obs-preview-accent);
  color: var(--ui-output-preview-accent-contrast);
  font-size: var(--ui-font-size-2xl);
  font-weight: var(--ui-font-weight-heavy);
}

.obs-template-mockup__metadata {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.obs-template-mockup__eyebrow,
.obs-template-mockup__secondary,
.obs-template-mockup__reading {
  min-width: 0;
  overflow: hidden;
  color: var(--obs-preview-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__reading {
  color: var(--obs-preview-accent);
}

.obs-template-mockup__title,
.obs-template-mockup__section-title {
  min-width: 0;
  overflow: hidden;
  font-weight: var(--ui-font-weight-heavy);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__title {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.obs-template-mockup__section-title {
  margin-block-end: var(--ui-space-1);
  color: var(--obs-preview-accent);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-template-mockup__next {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  display: flex;
  gap: var(--ui-space-1);
  margin-block-start: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-xs);
  background: var(--obs-preview-surface);
  color: var(--obs-preview-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__next strong {
  overflow: hidden;
  color: var(--obs-preview-ink);
  text-overflow: ellipsis;
}

.obs-template-mockup__queue-number {
  font-variant-numeric: tabular-nums;
}

.obs-template-mockup__queue-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup[data-template-id='karaoke-stack']
  .obs-template-mockup__content--lyrics {
  padding: 0;
}

.obs-template-mockup__ktv-lines {
  position: relative;
  width: 94%;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, auto));
  justify-self: center;
  gap: 0.16em;
  padding-block-end: 5%;
}

.obs-template-mockup__ktv-line {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-solo);

  position: relative;
  max-width: 94%;
  box-sizing: border-box;
  overflow: hidden;
  margin: -0.11em -0.16em -0.18em -0.11em;
  padding: 0.11em 0.16em 0.18em 0.11em;
  color: var(--ui-output-preview-ktv-fill-unsung);
  font-family: 'Utawakui Open Huninn', 'Microsoft JhengHei', sans-serif;
  font-size: 2.6rem;
  font-weight: 900;
  letter-spacing: 0.015em;
  line-height: 1.08;
  text-overflow: ellipsis;
  text-shadow: none;
  white-space: nowrap;
  -webkit-text-stroke: 0.075em var(--ui-output-preview-ktv-stroke-unsung);
  paint-order: stroke fill;
}

.obs-template-mockup__ktv-line[data-ktv-role='male'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-male);
}

.obs-template-mockup__ktv-line[data-ktv-role='female'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-female);
}

.obs-template-mockup__ktv-line[data-ktv-role='group'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-group);
}

.obs-template-mockup__ktv-count-in {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-solo);

  position: absolute;
  inset-block-start: -1.35rem;
  inset-inline-start: 0.2rem;
  display: flex;
  align-items: center;
  gap: 0.32rem;
}

.obs-template-mockup__ktv-count-in[data-ktv-role='male'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-male);
}

.obs-template-mockup__ktv-count-in[data-ktv-role='female'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-female);
}

.obs-template-mockup__ktv-count-in[data-ktv-role='group'] {
  --ui-output-preview-ktv-fill-sung: var(--ui-output-preview-ktv-fill-group);
}

.obs-template-mockup__ktv-count-in-dot {
  width: 1rem;
  aspect-ratio: 1;
  box-sizing: border-box;
  border: 0.08rem solid var(--ui-output-preview-ktv-stroke-sung);
  border-radius: 50%;
  background: var(--ui-output-preview-ktv-fill-sung);
}

.obs-template-mockup__ktv-line[data-ktv-held='true'] {
  color: var(--ui-output-preview-ktv-fill-sung);
  -webkit-text-stroke: 0.085em var(--ui-output-preview-ktv-stroke-sung);
}

.obs-template-mockup__ktv-line[data-ktv-lane='a'] {
  grid-row: 1;
  justify-self: start;
  text-align: left;
}

.obs-template-mockup__ktv-line[data-ktv-lane='b'] {
  grid-row: 2;
  justify-self: end;
  text-align: right;
}

.obs-template-mockup__ktv-line-fill {
  position: absolute;
  inset: 0.11em 0.16em 0 0.11em;
  display: block;
  overflow: visible;
  clip-path: inset(-0.2em 38% -0.2em 0);
  color: var(--ui-output-preview-ktv-fill-sung);
  white-space: nowrap;
  -webkit-text-stroke: 0.085em var(--ui-output-preview-ktv-stroke-sung);
  paint-order: stroke fill;
}

.obs-template-mockup__title--quiet {
  font-weight: var(--ui-font-weight-strong);
}

.obs-template-mockup[data-template-id='kinetic-pop']
  .obs-template-mockup__content--lyrics {
  align-items: end;
  padding: 0 4% 6%;
}

.obs-template-mockup[data-template-id='ornate-vertical']
  .obs-template-mockup__content--lyrics {
  --ui-output-preview-ornate-font-size: var(
    --ui-output-preview-ornate-detail-font-size
  );

  position: relative;
  min-height: 0;
  overflow: hidden;
  align-content: stretch;
  inline-size: 100%;
  padding: 0;
}

.obs-template-mockup[data-size='thumbnail'][data-template-id='ornate-vertical']
  .obs-template-mockup__content--lyrics {
  --ui-output-preview-ornate-font-size: var(
    --ui-output-preview-ornate-thumbnail-font-size
  );
}

.obs-template-mockup__kinetic-stage {
  display: grid;
  place-items: center;
  inline-size: 100%;
  min-width: 0;
  font-family:
    'Utawakui M PLUS Rounded 1c', 'M PLUS Rounded 1c', 'Noto Sans CJK JP',
    sans-serif;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.obs-template-mockup__kinetic-line {
  position: relative;
  grid-area: 1 / 1;
  display: grid;
  justify-items: center;
  inline-size: 100%;
  row-gap: 0.02em;
  color: var(--ui-output-preview-kinetic-yellow);
  line-height: 0.96;
  opacity: 1;
}

.obs-template-mockup__kinetic-row {
  display: flex;
  justify-content: center;
  inline-size: 100%;
  white-space: nowrap;
}

.obs-template-mockup__kinetic-unit {
  --kinetic-preview-enter-x: 0;
  --kinetic-preview-enter-y: 0.22em;
  --kinetic-preview-enter-rotation: -5deg;
  --kinetic-preview-enter-scale: 0.78;
  --kinetic-preview-exit-y: -0.14em;
  --kinetic-preview-exit-rotation: 5deg;
  --kinetic-preview-exit-scale: 1.08;

  display: inline-block;
  color: inherit;
  paint-order: stroke fill;
}

.obs-template-mockup__kinetic-line[data-kinetic-arrangement='subtle-offset']
  .obs-template-mockup__kinetic-unit {
  transform: translate(var(--kinetic-rest-x), var(--kinetic-rest-y))
    scale(var(--kinetic-rest-scale)) rotate(var(--kinetic-rest-rotation));
}

.obs-template-mockup__kinetic-unit:nth-child(even) {
  --kinetic-preview-enter-x: 0;
  --kinetic-preview-enter-y: -0.18em;
  --kinetic-preview-enter-rotation: 5deg;
  --kinetic-preview-enter-scale: 1.14;
  --kinetic-preview-exit-y: 0.12em;
  --kinetic-preview-exit-rotation: -5deg;
  --kinetic-preview-exit-scale: 0.9;
}

.obs-template-mockup__kinetic-line[data-kinetic-material='solid-outline']
  .obs-template-mockup__kinetic-unit {
  color: var(--ui-output-preview-kinetic-yellow);
  -webkit-text-stroke: 0.085em var(--ui-output-preview-kinetic-ink);
}

.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim'] {
  font-family:
    'Utawakui Keifont', 'Utawakui M PLUS Rounded 1c', 'Noto Sans CJK JP',
    sans-serif;
  font-size: 1.18em;
  font-weight: 900;
  line-height: 1.12;
}

.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']
  .obs-template-mockup__kinetic-unit {
  position: relative;
  isolation: isolate;
  color: transparent;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 0;
  text-shadow: none;
}

.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']
  .obs-template-mockup__kinetic-unit::before,
.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']
  .obs-template-mockup__kinetic-unit::after {
  position: absolute;
  inset: 0;
  display: block;
  content: attr(data-text);
  pointer-events: none;
  white-space: pre;
}

.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']
  .obs-template-mockup__kinetic-unit::before {
  z-index: 0;
  color: var(--ui-output-preview-kinetic-paper);
  -webkit-text-fill-color: var(--ui-output-preview-kinetic-paper);
  -webkit-text-stroke: 0.03em var(--ui-output-preview-kinetic-paper);
  paint-order: fill stroke;
  text-shadow: 0.07em 0.09em 0 var(--ui-output-preview-kinetic-ink);
}

.obs-template-mockup__kinetic-line[data-kinetic-material='candy-rim']
  .obs-template-mockup__kinetic-unit::after {
  z-index: 1;
  color: var(--ui-output-preview-kinetic-red);
  background: linear-gradient(
    to bottom left,
    var(--ui-output-preview-kinetic-candy-deep),
    var(--ui-output-preview-kinetic-candy-light)
  );
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 0.0125em var(--ui-output-preview-kinetic-paper);
  paint-order: fill stroke;
}

.obs-template-mockup__kinetic-line[data-kinetic-material='chromatic-depth']
  .obs-template-mockup__kinetic-unit {
  color: var(--ui-output-preview-kinetic-paper);
  -webkit-text-stroke: 0.045em var(--ui-output-preview-kinetic-ink);
  text-shadow:
    0.065em 0.075em 0 var(--ui-output-preview-kinetic-cyan),
    0.12em 0.14em 0 var(--ui-output-preview-kinetic-magenta);
}

.obs-template-mockup[data-motion='playing'] .obs-template-mockup__kinetic-unit {
  animation: obs-preview-kinetic-unit-cycle 3.2s cubic-bezier(0.16, 1, 0.3, 1)
    infinite both;
  animation-delay: var(--kinetic-unit-delay);
}

.obs-template-mockup__manga-bubbles {
  position: relative;
  width: 32%;
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-1);
}

.obs-template-mockup__manga-bubbles[data-manga-count='2'] {
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.obs-template-mockup__manga-bubbles[data-manga-count='2']
  .obs-template-mockup__manga-bubble {
  font-size: 0.81em;
}

.obs-template-mockup__manga-bubbles[data-manga-count='3'] {
  grid-template-rows: repeat(3, minmax(0, 1fr));
}

.obs-template-mockup__manga-bubbles[data-manga-count='3']
  .obs-template-mockup__manga-bubble {
  font-size: 0.66em;
}

.obs-template-mockup__manga-bubbles[data-manga-side='left'] {
  justify-self: start;
  margin-inline-start: var(--ui-space-3);
}

.obs-template-mockup__manga-bubbles[data-manga-side='right'] {
  justify-self: end;
  margin-inline-end: var(--ui-space-3);
}

.obs-template-mockup__manga-bubble {
  position: relative;
  box-sizing: border-box;
  height: min(
    max(36%, var(--ui-manga-frame-required-block-size)),
    56%,
    var(--ui-output-template-detail-artwork-size)
  );
  max-width: 100%;
  aspect-ratio: 2 / 3;
  justify-self: center;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--ui-output-preview-manga-ink);
  --manga-frame-ink: var(--ui-output-preview-manga-ink);
  --manga-frame-paper: var(--ui-output-preview-manga-paper);
  text-align: center;
}

.obs-template-mockup__manga-bubbles[data-manga-side='left']
  .obs-template-mockup__manga-bubble:nth-child(odd),
.obs-template-mockup__manga-bubbles[data-manga-side='right']
  .obs-template-mockup__manga-bubble:nth-child(even) {
  justify-self: start;
}

.obs-template-mockup__manga-bubbles[data-manga-side='left']
  .obs-template-mockup__manga-bubble:nth-child(even),
.obs-template-mockup__manga-bubbles[data-manga-side='right']
  .obs-template-mockup__manga-bubble:nth-child(odd) {
  justify-self: end;
}

.obs-template-mockup__manga-bubbles[data-manga-count='1']
  .obs-template-mockup__manga-bubble,
.obs-template-mockup__manga-bubbles[data-manga-count='3']
  .obs-template-mockup__manga-bubble:nth-child(3) {
  justify-self: center;
}

.obs-template-mockup__manga-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.obs-template-mockup__title--manga {
  position: relative;
  z-index: 1;
  inline-size: max-content;
  min-inline-size: 0;
  max-inline-size: 72%;
  block-size: fit-content;
  min-block-size: 0;
  max-block-size: 72%;
  display: block;
  overflow: hidden;
  color: var(--ui-output-preview-manga-ink);
  font-size: 1em;
  line-height: 1.16;
  overflow-wrap: anywhere;
  text-align: start;
  text-orientation: mixed;
  text-wrap: balance;
  white-space: pre-wrap;
  writing-mode: vertical-rl;
}

.obs-template-mockup__manga-bubble[data-manga-language='ja']
  .obs-template-mockup__title--manga {
  font-family:
    'Utawakui GenEi Antique', 'Noto Sans CJK JP', 'Yu Gothic UI', sans-serif;
}

.obs-template-mockup__title--manga ruby {
  ruby-align: center;
  ruby-position: over;
}

.obs-template-mockup__title--manga rt {
  font-family: inherit;
  font-size: 0.4em;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
  text-orientation: upright;
}

.obs-template-mockup__manga-bubble[data-manga-script='latin']
  .obs-template-mockup__title--manga {
  font-size: 0.82em;
}

.obs-template-mockup__manga-bubble[data-lyric-kind='aside']
  .obs-template-mockup__title--manga {
  font-size: 0.78em;
}

.obs-template-mockup__progress {
  height: var(--ui-space-1);
  overflow: hidden;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-output-preview-surface-muted);
}

.obs-template-mockup__progress-fill {
  width: 62%;
  height: 100%;
  display: block;
  border-radius: inherit;
  background: var(--obs-preview-accent);
  transform-origin: left;
}

.obs-template-mockup[data-motion='playing']
  .obs-template-mockup__animated-primary {
  animation: obs-preview-line-cycle var(--ui-output-preview-cycle-duration)
    var(--ui-output-preview-cycle-ease) infinite;
}

.obs-template-mockup[data-motion='playing']
  .obs-template-mockup__progress-fill {
  animation: obs-preview-progress-cycle var(--ui-output-preview-cycle-duration)
    linear infinite;
}

.obs-template-mockup[data-motion='playing']
  .obs-template-mockup__ktv-line-fill {
  animation: obs-preview-ktv-fill var(--ui-output-preview-cycle-duration) linear
    infinite;
}

.obs-template-mockup[data-motion='playing'] .obs-template-mockup__ktv-count-in {
  animation: obs-preview-ktv-count-in var(--ui-output-preview-cycle-duration)
    step-end infinite;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__content {
  box-sizing: border-box;
  width: var(--ui-output-template-thumb-content-width);
  height: 100%;
  place-content: center;
  justify-items: center;
  justify-self: center;
  gap: var(--ui-output-template-thumb-tight-gap);
  padding: var(--ui-output-template-thumb-content-padding);
  text-align: center;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--now-playing {
  place-content: stretch;
  align-items: center;
  justify-items: stretch;
  gap: 0;
  text-align: left;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__now-player {
  padding-inline-end: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__now-information {
  min-height: 58%;
  padding-inline: var(--ui-space-2) var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__now-next {
  padding-block-start: var(--ui-space-1);
  font-size: var(--ui-output-template-thumb-caption-font-size);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--setlist {
  --ui-setlist-preview-current-title-size: var(
    --ui-output-template-thumb-title-font-size
  );
  --ui-setlist-preview-history-title-size: var(
    --ui-output-template-thumb-title-font-size
  );
  --ui-setlist-preview-current-artist-size: var(
    --ui-output-template-thumb-caption-font-size
  );
  --ui-setlist-preview-history-artist-size: var(
    --ui-output-template-thumb-caption-font-size
  );
  --ui-setlist-preview-label-size: var(
    --ui-output-template-thumb-caption-font-size
  );
  --ui-setlist-preview-counter-size: var(
    --ui-output-template-thumb-caption-font-size
  );

  width: var(--ui-output-template-thumb-content-width);
  place-content: stretch;
  justify-items: stretch;
  gap: 0;
  text-align: left;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-current {
  gap: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-current-track {
  padding-block-start: var(--ui-space-1);
  padding-inline: 0;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-history-viewport {
  padding-block-start: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-history-list {
  row-gap: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-current-title,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__queue-title {
  display: block;
  overflow-wrap: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-line-clamp: unset;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-current-artist,
.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-artist {
  display: none;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--artwork {
  grid-template-columns: auto minmax(0, 1fr);
  justify-items: start;
  gap: var(--ui-output-template-thumb-group-gap);
  text-align: left;
}

.obs-template-mockup[data-size='thumbnail'][data-template-id='art-card']
  .obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  padding-block: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__vinyl-stage {
  width: 96%;
  gap: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail'][data-template-id='cover-player']
  .obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  text-align: left;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__cover-player {
  width: 42%;
  gap: 0;
  padding: 0;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__cover-player-copy {
  gap: 0;
  padding: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__cover-player-copy
  .obs-template-mockup__timeline {
  display: none;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__artwork {
  width: var(--ui-output-template-thumb-artwork-size);
  font-size: var(--ui-output-template-thumb-title-font-size);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__cover-player
  .obs-template-mockup__artwork {
  width: 100%;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__cover-player
  .obs-template-mockup__transport {
  font-size: var(--ui-output-template-thumb-caption-font-size);
  letter-spacing: 0;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__metadata {
  justify-items: start;
  gap: var(--ui-output-template-thumb-tight-gap);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__content > * {
  max-inline-size: 100%;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__manga-bubbles {
  width: 48%;
  margin-inline: var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__manga-bubble {
  height: 92%;
  min-width: 0;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__ktv-lines {
  gap: 0.12em;
}

.obs-template-mockup[data-size='thumbnail'][data-template-id='karaoke-stack']
  .obs-template-mockup__content--lyrics {
  align-content: end;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__ktv-line {
  font-size: 0.875rem;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__kinetic-stage {
  font-size: 0.78rem;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__title,
.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-history-row,
.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__section-title {
  font-size: var(--ui-output-template-thumb-title-font-size);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__eyebrow {
  display: none;
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__secondary,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__next,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__reading {
  font-size: var(--ui-output-template-thumb-caption-font-size);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__next {
  margin-block-start: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__section-title {
  margin-block-end: 0;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__setlist-history-row {
  grid-template-rows: auto;
  padding: 0 var(--ui-space-1);
}

@keyframes obs-preview-vinyl-spin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes obs-template-setlist-scroll {
  0%,
  10% {
    transform: translateY(0);
  }

  90%,
  100% {
    transform: translateY(calc(-1 * var(--ui-setlist-scroll-distance, 0px)));
  }
}

@keyframes obs-preview-kinetic-unit-cycle {
  0%,
  100% {
    opacity: 0;
    transform: translate(
        var(--kinetic-preview-enter-x),
        var(--kinetic-preview-enter-y)
      )
      scale(var(--kinetic-preview-enter-scale))
      rotate(var(--kinetic-preview-enter-rotation));
  }

  2.6% {
    opacity: 1;
    transform: translate(var(--kinetic-rest-x), var(--kinetic-rest-y))
      scale(1.07) rotate(var(--kinetic-rest-rotation));
  }

  4.2%,
  78%,
  90% {
    opacity: 1;
    transform: translate(var(--kinetic-rest-x), var(--kinetic-rest-y))
      scale(var(--kinetic-rest-scale)) rotate(var(--kinetic-rest-rotation));
  }

  93%,
  99% {
    opacity: 0;
    transform: translate(0, var(--kinetic-preview-exit-y))
      scale(var(--kinetic-preview-exit-scale))
      rotate(var(--kinetic-preview-exit-rotation));
  }
}

@keyframes obs-preview-line-cycle {
  0%,
  12% {
    opacity: 0.45;
    transform: translateY(var(--ui-space-1));
  }

  24%,
  76% {
    opacity: 1;
    transform: translateY(0);
  }

  90%,
  100% {
    opacity: 0.72;
    transform: translateY(calc(var(--ui-space-1) / -2));
  }
}

@keyframes obs-preview-progress-cycle {
  0%,
  12% {
    transform: scaleX(0.08);
  }

  76%,
  100% {
    transform: scaleX(1);
  }
}

@keyframes obs-preview-ktv-fill {
  0%,
  12% {
    clip-path: inset(-0.2em 92% -0.2em 0);
  }

  76%,
  100% {
    clip-path: inset(-0.2em 0 -0.2em 0);
  }
}

@keyframes obs-preview-ktv-count-in {
  0%,
  10% {
    clip-path: inset(0 0 0 0);
  }

  20% {
    clip-path: inset(0 25% 0 0);
  }

  30% {
    clip-path: inset(0 50% 0 0);
  }

  40% {
    clip-path: inset(0 75% 0 0);
  }

  50%,
  100% {
    clip-path: inset(0 100% 0 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .obs-template-mockup__setlist-history-viewport[data-history-overflow='true'][data-history-motion='running']
    .obs-template-mockup__setlist-history-list,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__animated-primary,
  .obs-template-mockup__vinyl-record,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__ktv-line-fill,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__ktv-count-in,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__progress-fill,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__kinetic-unit {
    animation: none;
  }

  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__kinetic-line {
    opacity: 1;
  }
}
</style>

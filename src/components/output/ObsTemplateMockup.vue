<script setup>
import { computed } from 'vue';
import MangaFrameSvg from './MangaFrameSvg.vue';

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
const lyrics = computed(() => props.scene?.lyrics ?? {});
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
      <strong class="obs-template-mockup__section-title">今晚歌單</strong>
      <span
        v-for="item in queue"
        :key="`${item.number}-${item.title}`"
        class="obs-template-mockup__queue-line"
        :class="{
          'obs-template-mockup__queue-line--current': item.state === 'current',
        }"
      >
        <span class="obs-template-mockup__queue-number">{{ item.number }}</span>
        <span class="obs-template-mockup__queue-title">{{ item.title }}</span>
        <span
          v-if="item.state === 'current'"
          class="obs-template-mockup__queue-state"
        >
          現正
        </span>
      </span>
    </div>

    <div
      v-else-if="preset?.kind === 'lyrics'"
      class="obs-template-mockup__content obs-template-mockup__content--lyrics"
    >
      <template v-if="preset?.id === 'manga-frame'">
        <span
          class="obs-template-mockup__manga-bubble obs-template-mockup__animated-bubble"
        >
          <MangaFrameSvg
            class="obs-template-mockup__manga-frame"
            frame-id="spoken"
          />
          <strong
            class="obs-template-mockup__title obs-template-mockup__title--manga"
          >
            {{ lyrics.current }}
          </strong>
        </span>
      </template>

      <template v-else-if="preset?.id === 'karaoke-stack'">
        <span class="obs-template-mockup__eyebrow">正在演唱</span>
        <strong
          class="obs-template-mockup__title obs-template-mockup__title--karaoke obs-template-mockup__animated-primary"
        >
          {{ lyrics.current }}
        </strong>
        <span class="obs-template-mockup__progress" aria-hidden="true">
          <span class="obs-template-mockup__progress-fill" />
        </span>
        <span class="obs-template-mockup__secondary">{{ lyrics.next }}</span>
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
      v-else-if="preset?.kind === 'artwork'"
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
        <span
          class="obs-template-mockup__artwork obs-template-mockup__animated-primary"
        >
          {{ track.title?.slice(0, 1) }}
        </span>
        <span class="obs-template-mockup__metadata">
          <span class="obs-template-mockup__eyebrow">正在演唱</span>
          <strong class="obs-template-mockup__title">{{ track.title }}</strong>
          <span class="obs-template-mockup__secondary">{{ track.artist }}</span>
        </span>
      </template>
    </div>

    <div
      v-else
      class="obs-template-mockup__content obs-template-mockup__content--now-playing"
    >
      <span class="obs-template-mockup__eyebrow">正在演唱</span>
      <strong
        class="obs-template-mockup__title obs-template-mockup__animated-primary"
      >
        {{ track.title }}
      </strong>
      <span class="obs-template-mockup__secondary">{{ track.artist }}</span>
      <span class="obs-template-mockup__next">
        下一首
        <strong>{{ nextTrack.title }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
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
  align-content: end;
}

.obs-template-mockup__content--lyrics {
  align-content: end;
}

.obs-template-mockup[data-template-id='manga-frame']
  .obs-template-mockup__content--lyrics {
  place-content: center;
  justify-items: center;
}

.obs-template-mockup__content--setlist {
  align-content: start;
}

.obs-template-mockup__content--artwork {
  grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
  align-content: end;
  align-items: center;
  gap: var(--ui-space-3);
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

.obs-template-mockup__queue-line {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--obs-preview-surface);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.obs-template-mockup__queue-line--current {
  background: var(--obs-preview-accent);
  color: var(--ui-output-preview-accent-contrast);
}

.obs-template-mockup__queue-number,
.obs-template-mockup__queue-state {
  font-variant-numeric: tabular-nums;
}

.obs-template-mockup__queue-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-template-mockup__queue-state {
  font-size: var(--ui-output-template-thumb-caption-font-size);
}

.obs-template-mockup__title--karaoke {
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--obs-preview-surface);
}

.obs-template-mockup__title--quiet {
  font-weight: var(--ui-font-weight-strong);
}

.obs-template-mockup__manga-bubble {
  position: relative;
  width: min(30%, var(--ui-output-template-detail-artwork-size));
  min-width: var(--ui-output-template-thumb-artwork-size);
  aspect-ratio: 2 / 3;
  display: grid;
  place-items: center;
  padding: var(--ui-space-4) var(--ui-space-3);
  background: transparent;
  color: var(--ui-output-preview-manga-ink);
  --manga-frame-ink: var(--ui-output-preview-manga-ink);
  --manga-frame-paper: var(--ui-output-preview-manga-paper);
  text-align: center;
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
  width: 62%;
  height: 68%;
  display: block;
  color: var(--ui-output-preview-manga-ink);
  line-height: var(--ui-line-height-body);
  overflow-wrap: anywhere;
  text-align: center;
  text-orientation: upright;
  writing-mode: vertical-rl;
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
  .obs-template-mockup__animated-bubble {
  animation: obs-preview-bubble-cycle var(--ui-output-preview-cycle-duration)
    var(--ui-output-preview-cycle-ease) infinite;
}

.obs-template-mockup[data-motion='playing']
  .obs-template-mockup__progress-fill {
  animation: obs-preview-progress-cycle var(--ui-output-preview-cycle-duration)
    linear infinite;
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
  .obs-template-mockup__content--setlist {
  justify-items: stretch;
  text-align: left;
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--artwork {
  grid-template-columns: auto minmax(0, 1fr);
  justify-items: start;
  gap: var(--ui-output-template-thumb-group-gap);
  text-align: left;
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

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__manga-bubble {
  width: 40%;
  min-width: var(--ui-output-template-thumb-artwork-size);
  box-sizing: border-box;
  padding: var(--ui-space-3) var(--ui-space-2);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__title,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__queue-line,
.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__section-title {
  font-size: var(--ui-output-template-thumb-title-font-size);
}

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__eyebrow,
.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__queue-state {
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

.obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__queue-line {
  padding: 0 var(--ui-space-1);
}

.obs-template-mockup[data-size='thumbnail']
  .obs-template-mockup__content--setlist
  .obs-template-mockup__queue-line:nth-of-type(n + 3) {
  display: none;
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

@keyframes obs-preview-bubble-cycle {
  0%,
  12%,
  88%,
  100% {
    opacity: 0;
  }

  24%,
  76% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__animated-primary,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__animated-bubble,
  .obs-template-mockup[data-motion='playing']
    .obs-template-mockup__progress-fill {
    animation: none;
  }
}
</style>

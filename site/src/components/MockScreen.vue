<script setup>
// The two sides of the before/after story, drawn with app tokens: what the operator
// reads (lyrics reader with player) and what viewers see on the stream.
defineProps({
  kind: {
    type: String,
    required: true,
    validator: (v) => ['operator', 'stream'].includes(v),
  },
});

const lyrics = ['把今晚的歌', '一首一首唱給你聽', '燈光亮起的時候'];
</script>

<template>
  <div class="mock" :class="`mock--${kind}`" aria-hidden="true">
    <template v-if="kind === 'operator'">
      <div class="reader">
        <p class="lyric">{{ lyrics[0] }}</p>
        <p class="lyric lyric--current">
          <span class="lyric__marker">一首一首<u>唱給</u>你聽</span>
        </p>
        <p class="lyric">{{ lyrics[2] }}</p>
      </div>
      <div class="player">
        <span class="art" />
        <span class="meta">
          <b>今晚的歌</b>
          <span class="progress"><span /></span>
        </span>
      </div>
    </template>

    <template v-else>
      <div class="scene">
        <span class="spot spot--a" />
        <span class="spot spot--b" />
        <span class="avatar" />
      </div>
      <div class="np">
        <span class="art" />
        <span class="meta">
          <b>今晚的歌</b>
          <small>Utawakui Demo</small>
        </span>
      </div>
      <p class="caption"><span class="caption__sung">一首一首</span>唱給你聽</p>
    </template>
  </div>
</template>

<style scoped>
.mock {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: var(--ui-font-family-base);
}

.art {
  flex: none;
  width: var(--ui-space-7);
  aspect-ratio: 1;
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-folder-primary);
}

.meta {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.meta b {
  font-weight: var(--ui-font-weight-semibold);
}

/* Operator: lyrics reader with the amber line marker and blue active-chunk underline. */
.mock--operator {
  display: grid;
  grid-template-rows: 1fr auto;
  background: var(--ui-palette-warm-neutral-50);
  color: var(--ui-color-text);
}

.reader {
  display: grid;
  align-content: center;
  gap: var(--ui-space-5);
  text-align: center;
}

.lyric {
  color: var(--ui-color-text-muted);
  font-size: var(--site-type-statement);
  line-height: var(--ui-type-body-line-height);
}

.lyric--current {
  color: var(--ui-color-text);
}

.lyric__marker {
  padding: 0 var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-palette-amber-300) 70%, transparent);
}

.lyric u {
  text-decoration: underline 3px var(--ui-color-accent);
  text-underline-offset: 0.25em;
}

.player {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  width: min(36rem, 86%);
  margin: 0 auto var(--ui-space-7);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--site-radius);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--site-shadow-soft);
}

.player .meta {
  flex: 1;
}

.progress {
  display: block;
  height: 4px;
  border-radius: var(--site-radius-pill);
  background: var(--ui-color-border);
}

.progress span {
  display: block;
  width: 45%;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-color-current);
}

/* Stream scene: now-playing card and a caption in the display face. */
.mock--stream {
  background: var(--ui-palette-indigo-950);
}

.scene {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    var(--ui-palette-indigo-950),
    var(--ui-palette-indigo-800) 70%,
    var(--ui-palette-plum-700)
  );
}

.spot {
  position: absolute;
  width: 40%;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(36px);
  opacity: 0.5;
}

.spot--a {
  top: -10%;
  left: 10%;
  background: var(--ui-palette-indigo-400);
}

.spot--b {
  top: 5%;
  right: 5%;
  background: var(--ui-palette-amber-300);
}

.avatar {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 24%;
  height: 62%;
  border-radius: 50% 50% 18% 18%;
  background: color-mix(
    in srgb,
    var(--ui-palette-warm-neutral-50) 85%,
    transparent
  );
  transform: translateX(-50%);
}

.np {
  position: absolute;
  top: 6%;
  left: 4%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-4) var(--ui-space-2)
    var(--ui-space-2);
  border-radius: var(--site-radius);
  background: color-mix(
    in srgb,
    var(--ui-palette-warm-neutral-50) 92%,
    transparent
  );
  color: var(--ui-palette-neutral-900);
  font-size: var(--ui-type-caption-size);
}

.np small {
  color: var(--ui-palette-neutral-600);
}

.caption {
  position: absolute;
  inset: auto 6% 12%;
  color: var(--ui-palette-warm-neutral-50);
  font-family: var(--site-font-display);
  font-weight: var(--site-weight-display);
  font-size: var(--site-type-statement);
  text-align: center;
  text-shadow: 0 2px 6px rgb(0 0 0 / 45%);
}

.caption__sung {
  color: var(--ui-palette-amber-300);
}
</style>

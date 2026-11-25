<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import MockScreen from '../components/MockScreen.vue';
import {
  EASE_ENTER,
  EASE_STANDARD,
  gsap,
  useSectionMotion,
} from '../motion.js';

const root = ref(null);

let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    const q = gsap.utils.selector(root.value);
    // Scroll-scrubbed and reversible; the reference's scroll gate is intentionally left out.
    gsap
      .timeline({
        defaults: { ease: EASE_ENTER },
        scrollTrigger: {
          scroller,
          trigger: root.value,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
        },
      })
      .from(q('.ba__before-copy > *'), {
        y: 32,
        autoAlpha: 0,
        stagger: 0.1,
        duration: 0.6,
      })
      .to(
        q('.ba__mask'),
        { scaleY: 1, duration: 0.8, ease: EASE_STANDARD },
        '+=0.6',
      )
      .fromTo(
        q('.ba__stripe'),
        { xPercent: -130 },
        { xPercent: 130, duration: 1, stagger: 0.12, ease: EASE_STANDARD },
      )
      .set(q('.ba__before'), { autoAlpha: 0 }, '<0.5')
      .from(q('.ba__after'), { scale: 1.12, autoAlpha: 0, duration: 0.8 }, '<')
      .to(
        q('.ba__mask'),
        { scaleY: 0, duration: 0.6, ease: EASE_STANDARD },
        '<0.2',
      )
      .from(q('.ba__badge'), { scale: 0.6, autoAlpha: 0, duration: 0.6 })
      .from(
        q('.ba__after-copy > *'),
        { y: 32, autoAlpha: 0, stagger: 0.1, duration: 0.6 },
        '<0.2',
      )
      .to({}, { duration: 0.8 });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section ref="root" class="chapter ba" aria-labelledby="ba-title">
    <h2 id="ba-title" class="visually-hidden">演唱時，你和觀眾看到的畫面</h2>
    <div class="scroll-scene ba__scene">
      <div class="ba__layer ba__before">
        <MockScreen kind="operator" />
        <div class="ba__before-copy">
          <span class="ba__tag type-caption">你的 Utawakui 畫面</span>
          <p class="ba__plate type-heading">跟著歌詞唱，隨時切歌</p>
        </div>
      </div>
      <div class="ba__layer ba__after">
        <MockScreen kind="stream" />
        <div class="ba__after-copy">
          <span class="ba__tag type-caption">觀眾看到的直播畫面</span>
          <p class="ba__plate type-heading">
            <span class="marker">讓觀眾跟上正在唱的歌</span>
          </p>
          <p class="ba__note type-body">在自己的直播版面上顯示曲名和歌詞。</p>
        </div>
      </div>
      <span class="ba__badge display" aria-hidden="true">LIVE</span>
      <span class="ba__mask ba__mask--top" aria-hidden="true" />
      <span class="ba__mask ba__mask--bottom" aria-hidden="true" />
      <div class="ba__stripes" aria-hidden="true">
        <span class="ba__stripe" />
        <span class="ba__stripe" />
        <span class="ba__stripe" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ba {
  --ba-mask-height: 14vh;
  background: var(--site-ground-dark);
}

@media (prefers-reduced-motion: no-preference) {
  .ba {
    min-block-size: calc(var(--site-viewport-height) * 3.6);
  }
}

.ba__layer {
  position: absolute;
  inset: 0;
}

.ba__before-copy,
.ba__after-copy {
  position: absolute;
  display: grid;
  gap: var(--ui-space-3);
  justify-items: start;
}

/* Above the letterbox band, so the closing mask never covers the line. */
.ba__before-copy {
  inset: auto 5vw calc(var(--ba-mask-height) + var(--ui-space-5));
}

/* Sits between the now-playing card and the caption so the footage stays readable. */
.ba__after-copy {
  top: 22vh;
  left: 5vw;
  max-width: min(46vw, 40rem);
}

.ba__tag {
  padding: var(--ui-space-1) var(--ui-space-3);
  border: 1px solid var(--ui-color-border-strong);
  border-radius: var(--site-radius-pill);
  background: var(--site-paper);
  color: var(--site-text);
}

.ba__plate {
  padding: var(--ui-space-2) var(--ui-space-5);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow);
  color: var(--site-text);
}

.ba__note {
  max-width: 24em;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--site-radius);
  background: color-mix(in srgb, var(--ui-palette-indigo-950) 78%, transparent);
  color: var(--ui-color-chrome-text);
}

/* One accent per screen: the badge uses the app accent, not a second highlight colour. */
.ba__badge {
  position: absolute;
  pointer-events: none;
  right: 7vw;
  bottom: 28vh;
  display: grid;
  place-items: center;
  width: clamp(6rem, 12vw, 9rem);
  aspect-ratio: 1;
  border: var(--ui-space-1) solid var(--site-paper);
  border-radius: 50%;
  background: var(--site-accent);
  box-shadow: var(--site-shadow);
  color: var(--site-accent-contrast);
  font-size: var(--site-type-statement);
  letter-spacing: 0.06em;
}

@media (max-width: 759.98px) {
  .ba__after-copy {
    top: 16vh;
    max-width: 90vw;
  }

  .ba__badge {
    width: 5rem;
  }
}

/* Letterbox bars that close over the console before the cut. */
.ba__mask {
  position: absolute;
  pointer-events: none;
  left: 0;
  right: 0;
  height: var(--ba-mask-height);
  background: var(--site-ground-dark);
  transform: scaleY(0);
}

.ba__mask--top {
  top: 0;
  transform-origin: top;
}

.ba__mask--bottom {
  bottom: 0;
  transform-origin: bottom;
}

/* Folder-material sweep that carries the cut. */
.ba__stripes {
  position: absolute;
  inset: -20% -10%;
  display: grid;
  align-content: center;
  gap: 2vh;
  transform: rotate(-12deg);
  pointer-events: none;
}

.ba__stripe {
  height: 22vh;
  background: var(--ui-color-folder-primary);
}

.ba__stripe:nth-child(2) {
  background: var(--ui-color-folder-secondary);
}

.ba__stripe:nth-child(3) {
  background: var(--ui-color-folder-tertiary);
}

/* Without motion both states sit one above the other. */
@media (prefers-reduced-motion: reduce) {
  .ba__scene {
    height: auto;
  }

  .ba__layer {
    position: relative;
    block-size: var(--site-viewport-height);
  }

  .ba__stripes,
  .ba__mask,
  .ba__badge {
    display: none;
  }
}
</style>

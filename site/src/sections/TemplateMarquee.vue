<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import WaveEdge from '../components/WaveEdge.vue';
import { TEMPLATES } from '../content/templates.js';
import {
  getTemplateMotion,
  getTemplateThumbnail,
} from '../content/thumbnails.js';
import { gsap, reveal, ScrollTrigger, useSectionMotion } from '../motion.js';

const tiles = TEMPLATES.map((t) => ({
  ...t,
  src: getTemplateThumbnail(t.id),
  motion: getTemplateMotion(t.id),
}));
const failedThumbnails = reactive(new Set());
const failedMotion = reactive(new Set());
const visibleTiles = reactive(new Set());
const pageVisible = ref(false);
const half = Math.ceil(tiles.length / 2);
const rows = [tiles.slice(0, half), tiles.slice(half)];

function previewSource(tile, key) {
  if (
    pageVisible.value &&
    visibleTiles.has(key) &&
    tile.motion &&
    !failedMotion.has(tile.id)
  ) {
    return tile.motion;
  }
  return failedThumbnails.has(tile.id) ? undefined : tile.src;
}

function previewFailed(tile, { currentTarget }) {
  if (currentTarget.getAttribute('src') === tile.motion) {
    failedMotion.add(tile.id);
  } else {
    failedThumbnails.add(tile.id);
  }
}

const root = ref(null);
const band = ref(null);
let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    const q = gsap.utils.selector(root.value);
    reveal(scroller, q('.wonder__title, .wonder__copy'), { stagger: 0.1 });

    function syncPageVisibility() {
      pageVisible.value = !document.hidden;
    }
    const visibilityThreshold = 0.15;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting, intersectionRatio } of entries) {
          const key = target.dataset.previewKey;
          if (isIntersecting && intersectionRatio >= visibilityThreshold) {
            visibleTiles.add(key);
          } else {
            visibleTiles.delete(key);
          }
        }
      },
      { root: scroller, threshold: visibilityThreshold },
    );
    for (const tile of q('.tile')) observer.observe(tile);
    syncPageVisibility();
    document.addEventListener('visibilitychange', syncPageVisibility);

    // Two equal groups include a trailing gap so 50% lands at the next copy.
    const loops = q('.wonder__row').map((row, i) =>
      gsap.fromTo(
        row,
        { xPercent: i % 2 ? -50 : 0 },
        {
          xPercent: i % 2 ? 0 : -50,
          duration: 48 + i * 10,
          ease: 'none',
          paused: true,
          repeat: -1,
        },
      ),
    );
    function syncPlayback({ isActive }) {
      for (const loop of loops) loop.paused(!isActive);
    }
    ScrollTrigger.create({
      scroller,
      trigger: band.value,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: syncPlayback,
      onRefresh: syncPlayback,
    });
    return () => {
      document.removeEventListener('visibilitychange', syncPageVisibility);
      observer.disconnect();
      visibleTiles.clear();
      pageVisible.value = false;
    };
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    class="chapter chapter--wave wonder on-material texture-dots"
    aria-labelledby="wonder-title"
  >
    <WaveEdge color="var(--site-ground-secondary)" />
    <div class="wonder__head">
      <h2 id="wonder-title" class="wonder__title display display--chapter">
        選一款直播畫面
      </h2>
      <p class="wonder__copy type-body">
        為歌詞、播放資訊和已唱曲目挑選適合你直播的樣式。
      </p>
    </div>
    <div ref="band" class="wonder__band" aria-label="畫面輸出模板">
      <div class="wonder__strip">
        <div v-for="(row, r) in rows" :key="r" class="wonder__row">
          <div
            v-for="copy in 2"
            :key="copy"
            class="wonder__group"
            :class="{ 'wonder__group--repeat': copy === 2 }"
            :aria-hidden="copy === 2"
          >
            <figure
              v-for="t in row"
              :key="t.id"
              class="tile"
              :data-preview-key="`${t.id}:${copy}`"
            >
              <img
                v-if="previewSource(t, `${t.id}:${copy}`)"
                class="tile__screen"
                :src="previewSource(t, `${t.id}:${copy}`)"
                alt=""
                decoding="async"
                fetchpriority="low"
                width="1280"
                height="720"
                @error="previewFailed(t, $event)"
              />
              <span v-else class="tile__screen tile__screen--name display">{{
                t.name
              }}</span>
              <figcaption class="type-caption">
                <span>{{ t.kind }}</span>
                <b>{{ t.name }}</b>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wonder {
  --chapter-top-gap: var(--ui-space-6);
  --site-on-material: var(--ui-color-folder-secondary-foreground);
  background-color: var(--site-ground-secondary);
}

.wonder__head {
  display: grid;
  gap: var(--ui-space-4);
  justify-items: end;
  padding: 0 6vw;
  text-align: right;
}

.wonder__band {
  overflow: clip;
  padding-block: calc(6vw + var(--ui-space-4));
}

.wonder__strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-6);
  transform: rotate(-6deg);
}

.wonder__row {
  display: flex;
  width: max-content;
}

.wonder__group {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--ui-space-6);
  padding-inline-end: var(--ui-space-6);
}

.tile {
  flex: none;
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
}

/* Gallery cards share the app thumbnail ratio (16:9). */
.tile__screen {
  display: block;
  width: clamp(14rem, 22vw, 20rem);
  /* The img height attribute would otherwise override the ratio. */
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 1px solid color-mix(in srgb, var(--site-on-material) 30%, transparent);
  border-radius: var(--site-radius);
  box-shadow: var(--site-shadow);
}

.tile__screen--name {
  display: grid;
  place-items: center;
  background: var(--ui-palette-indigo-950);
  color: var(--ui-palette-warm-neutral-50);
  font-size: var(--ui-font-size-xl);
}

.tile figcaption {
  display: flex;
  gap: var(--ui-space-2);
  justify-self: start;
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--site-radius-pill);
  background: var(--site-paper);
  color: var(--site-text);
}

.tile figcaption span {
  color: var(--site-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .wonder__band {
    inline-size: var(--content-width);
    margin-inline: auto;
    padding-block: var(--ui-space-6) var(--ui-space-8);
  }

  .wonder__strip {
    transform: none;
  }

  .wonder__row {
    display: block;
    width: auto;
  }

  .wonder__group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    padding-inline-end: 0;
  }

  .wonder__group--repeat {
    display: none;
  }

  .tile__screen {
    width: 100%;
  }
}
</style>

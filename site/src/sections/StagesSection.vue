<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import StageIllustration from '../components/StageIllustration.vue';
import WaveEdge from '../components/WaveEdge.vue';
import {
  DURATION_SLOW,
  EASE_ENTER,
  gsap,
  ScrollTrigger,
  useSectionMotion,
} from '../motion.js';

// The three app destinations, each on one folder material.
const stages = [
  {
    key: 'library',
    name: '曲庫',
    copy: '把電腦裡的歌曲、歌詞和封面一起整理好。',
    material: 'primary',
  },
  {
    key: 'performance',
    name: '演唱工具',
    copy: '練唱時跟著歌詞，演出時照歌單切歌。',
    material: 'secondary',
  },
  {
    key: 'output',
    name: '畫面輸出',
    copy: '把目前曲名、歌詞和已唱曲目加入觀眾看到的直播畫面。',
    material: 'tertiary',
  },
];

const root = ref(null);
const range = ref(null);
const scene = ref(null);
const track = ref(null);

// Vertical scroll drives horizontal travel at half speed, as in the reference.
const SCROLL_PER_PIXEL = 2;

let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    const stageRange = range.value;
    const viewport = scene.value;
    const rail = track.value;
    let distance;
    function updateRange() {
      const next = Math.max(0, rail.scrollWidth - viewport.clientWidth);
      if (next === distance) return false;
      distance = next;
      stageRange.style.setProperty(
        '--stage-scroll',
        `${distance * SCROLL_PER_PIXEL}px`,
      );
      return true;
    }

    updateRange();
    const travel = gsap.to(track.value, {
      x: () => -distance,
      ease: 'none',
      scrollTrigger: {
        scroller,
        trigger: stageRange,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onRefreshInit: updateRange,
        invalidateOnRefresh: true,
      },
    });
    for (const el of rail.querySelectorAll('.stage')) {
      gsap.from(el, {
        opacity: 0.65,
        duration: DURATION_SLOW * 2,
        ease: EASE_ENTER,
        scrollTrigger: {
          scroller,
          trigger: el,
          containerAnimation: travel,
          start: 'left 85%',
          once: true,
        },
      });
    }

    const resize = new ResizeObserver(() => {
      if (updateRange()) ScrollTrigger.refresh();
    });
    resize.observe(rail);
    resize.observe(viewport);
    return () => {
      resize.disconnect();
      stageRange.style.removeProperty('--stage-scroll');
    };
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    class="chapter chapter--wave stages on-material texture-dots"
    aria-labelledby="stages-title"
  >
    <WaveEdge color="var(--site-ground-primary)" />
    <div ref="range" class="stages__range">
      <div ref="scene" class="scroll-scene stages__scene">
        <div ref="track" class="stages__track">
          <div class="stages__intro">
            <h2 id="stages-title" class="display display--chapter">
              從準備歌曲到上台
            </h2>
          </div>
          <article
            v-for="stage in stages"
            :key="stage.key"
            class="stage"
            :class="`stage--${stage.material}`"
          >
            <StageIllustration :kind="stage.key" />
            <div class="stage__card">
              <h3 class="type-heading">{{ stage.name }}</h3>
              <p class="type-body">{{ stage.copy }}</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stages {
  background-color: var(--site-ground-primary);
}

.stages__range {
  min-block-size: calc(var(--site-viewport-height) + var(--stage-scroll, 0px));
}

.stages__track {
  display: flex;
  align-items: center;
  gap: 8vw;
  width: max-content;
  height: 100%;
  padding: 0 8vw;
}

.stages__intro {
  flex: none;
  inline-size: min(22rem, 76vw);
}

.stage {
  flex: none;
  display: grid;
  grid-template-columns: auto 22rem;
  gap: var(--ui-space-5);
  align-items: center;
}

.stage__card {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-6);
  border-top: var(--ui-space-1) solid var(--material);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow);
  color: var(--site-text);
}

.stage--primary {
  --material: var(--ui-palette-indigo-700);
}

.stage--secondary {
  --material: var(--ui-color-folder-secondary);
}

.stage--tertiary {
  --material: var(--ui-color-folder-tertiary);
}

@media (max-width: 759.98px) {
  .stage {
    grid-template-columns: 82vw;
    gap: var(--ui-space-4);
    justify-items: center;
  }

  .stage__card {
    width: 100%;
    padding: var(--ui-space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .stages__range {
    min-block-size: 0;
  }

  .stages__scene {
    height: auto;
    padding: var(--ui-space-8) 0;
  }

  .stages__track {
    flex-direction: column;
    width: auto;
    gap: var(--ui-space-7);
  }

  .stages__intro {
    inline-size: auto;
    text-align: center;
  }
}
</style>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { gsap, useSectionMotion } from '../motion.js';

// Ambient brand visual standing in for an intro film: sheets and folder tabs drifting.
const pieces = [
  { kind: 'sheet', x: '6%', y: '12%', w: '26%', r: -8 },
  { kind: 'sheet', x: '58%', y: '6%', w: '30%', r: 6 },
  { kind: 'sheet', x: '34%', y: '46%', w: '28%', r: -3 },
  { kind: 'tab', m: 'primary', x: '24%', y: '8%', r: -6 },
  { kind: 'tab', m: 'secondary', x: '78%', y: '44%', r: 8 },
  { kind: 'tab', m: 'tertiary', x: '12%', y: '58%', r: 4 },
  { kind: 'tab', m: 'primary', x: '66%', y: '72%', r: -4 },
];

const root = ref(null);
let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, () => {
    gsap.utils
      .selector(root.value)('.piece')
      .forEach((el, i) => {
        gsap.to(el, {
          x: i % 2 ? 18 : -18,
          y: i % 3 ? -14 : 14,
          duration: 6 + i,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <div ref="root" class="brand" aria-hidden="true">
    <span
      v-for="(p, i) in pieces"
      :key="i"
      class="piece"
      :class="[`piece--${p.kind}`, p.m && `piece--${p.m}`]"
      :style="{ left: p.x, top: p.y, width: p.w, '--r': `${p.r}deg` }"
    >
      <template v-if="p.kind === 'sheet'">
        <i /><i class="is-marked" /><i />
      </template>
    </span>
  </div>
</template>

<style scoped>
.brand {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 70% 20%,
      color-mix(in srgb, var(--ui-palette-indigo-600) 45%, transparent),
      transparent 55%
    ),
    radial-gradient(
      circle at 15% 85%,
      color-mix(in srgb, var(--ui-palette-plum-700) 40%, transparent),
      transparent 50%
    ),
    var(--site-ground-dark);
}

.piece {
  position: absolute;
  rotate: var(--r);
}

/* Ruled sheet with one marked line, echoing the lyrics reader. */
.piece--sheet {
  display: grid;
  gap: var(--ui-space-4);
  aspect-ratio: 3 / 4;
  padding: var(--ui-space-7) var(--ui-space-6);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--ui-shadow-dialog);
  opacity: 0.92;
}

.piece--sheet i {
  display: block;
  height: 0.6rem;
  border-radius: var(--site-radius-pill);
  background: var(--ui-color-border);
}

.piece--sheet i.is-marked {
  height: 1rem;
  background: color-mix(in srgb, var(--ui-palette-amber-300) 85%, transparent);
}

.piece--tab {
  width: 9rem;
  height: 3rem;
  border-radius: var(--site-radius) var(--site-radius) 0 0;
  box-shadow: var(--ui-shadow-overlay);
}

.piece--primary {
  background: var(--ui-color-folder-primary);
}

.piece--secondary {
  background: var(--ui-color-folder-secondary);
}

.piece--tertiary {
  background: var(--ui-color-folder-tertiary);
}

@media (max-width: 759.98px) {
  .piece--sheet {
    padding: var(--ui-space-5) var(--ui-space-4);
  }

  .piece--tab {
    width: 5rem;
    height: 1.75rem;
  }
}
</style>

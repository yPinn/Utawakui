<script setup>
// A phone-shaped frame whose screen hosts the slot. The screen keeps the
// iPhone 9:19.5 proportion and the bezel wraps it. Inside a size container
// the phone fills the available width, narrowing only when the height
// cannot hold it. Geometry is a component recipe over foundation tokens plus
// one device value for the iPhone-like outer corner.
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import {
  BatteryFull,
  ICON_SIZE,
  Navigation,
  Signal,
  Wifi,
} from '../../icons/index.js';

defineProps({
  label: { type: String, required: true },
});

// The status bar shows this computer's time, 24-hour like the phone's.
const formatTime = (date) =>
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
const time = shallowRef(formatTime(new Date()));
let clockTimer = null;

function tick() {
  const now = new Date();
  time.value = formatTime(now);
  clockTimer = setTimeout(tick, (60 - now.getSeconds()) * 1000);
}

onMounted(tick);
onBeforeUnmount(() => clearTimeout(clockTimer));
</script>

<template>
  <figure class="companion-phone-frame" :aria-label="label">
    <div class="companion-phone-frame__screen">
      <!-- Decorative status bar, left to right: time and location arrow,
           the island with its camera lens, then signal, Wi-Fi and battery.
           Each side group is centred in its equal half beside the island. -->
      <div class="companion-phone-frame__status" aria-hidden="true">
        <span class="companion-phone-frame__group">
          <span class="companion-phone-frame__time">{{ time }}</span>
          <Navigation :size="ICON_SIZE" fill="currentColor" />
        </span>
        <span class="companion-phone-frame__island">
          <span class="companion-phone-frame__lens"></span>
        </span>
        <span class="companion-phone-frame__group">
          <Signal :size="ICON_SIZE" />
          <Wifi :size="ICON_SIZE" />
          <BatteryFull :size="ICON_SIZE" />
        </span>
      </div>
      <div class="companion-phone-frame__content">
        <slot />
      </div>
    </div>
  </figure>
</template>

<style scoped>
.companion-phone-frame {
  /* The outer corner is the device value --ui-companion-phone-radius (from
     tokens.css, outside the radius scale); the screen corner stays
     concentric inside the bezel. */
  --ui-companion-phone-bezel: var(--ui-space-2);
  --ui-companion-phone-screen-radius: calc(
    var(--ui-companion-phone-radius) - var(--ui-companion-phone-bezel)
  );
  /* Bezel plus outline on each side of the screen. */
  --ui-companion-phone-edge: calc(
    var(--ui-companion-phone-bezel) + var(--ui-border-width)
  );
  --ui-companion-phone-island-block-size: var(--ui-space-4);
  /* Device material: the bezel and island stay dark in either app theme. */
  --ui-companion-phone-material: var(--ui-palette-neutral-950);
  /* One screen inset for the status bar and the content beside it. */
  --ui-companion-phone-screen-inset: var(--ui-space-3);
  --ui-companion-phone-status-inset-block-start: var(--ui-space-2);

  box-sizing: border-box;
  /* Full width, unless the height only fits a narrower 9:19.5 screen. */
  inline-size: min(
    100cqi,
    calc(
      (100cqb - 2 * var(--ui-companion-phone-edge)) * 9 / 19.5 + 2 *
        var(--ui-companion-phone-edge)
    )
  );
  margin: 0;
  padding: var(--ui-companion-phone-bezel);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-companion-phone-radius);
  background: var(--ui-companion-phone-material);
  box-shadow: var(--ui-shadow-overlay);
}

/* iPhone screen proportion (9:19.5); the bezel adds outside it. */
.companion-phone-frame__screen {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  aspect-ratio: 9 / 19.5;
  overflow: hidden;
  border-radius: var(--ui-companion-phone-screen-radius);
  background: var(--ui-color-surface-raised);
}

/* Time and indicators sit centred in the space either side of the island.
   The bar is exactly the island's height, so text, island and icons share
   one centre line; side insets match the screen content's. */
.companion-phone-frame__status {
  position: absolute;
  inset-block-start: var(--ui-companion-phone-status-inset-block-start);
  inset-inline: var(--ui-companion-phone-screen-inset);
  z-index: var(--ui-layer-raised);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-rows: var(--ui-companion-phone-island-block-size);
  align-items: center;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* Both side groups centre in their equal halves with the same item gap. */
.companion-phone-frame__group {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

/* Icons are ICON_SIZE (1rem), the island's height; block display drops the
   inline baseline gap so they centre exactly. */
.companion-phone-frame__group > svg {
  display: block;
  flex: none;
}

.companion-phone-frame__island {
  position: relative;
  inline-size: var(--ui-artwork-size-md);
  block-size: var(--ui-companion-phone-island-block-size);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-companion-phone-material);
}

/* The camera lens sits at the island's end, inset equally on every side so
   it stays concentric with the pill's rounded end. */
.companion-phone-frame__lens {
  --ui-companion-phone-lens-inset: calc(
    (var(--ui-companion-phone-island-block-size) - var(--ui-status-dot-size)) /
      2
  );

  position: absolute;
  inset-block-start: var(--ui-companion-phone-lens-inset);
  inset-inline-end: var(--ui-companion-phone-lens-inset);
  box-sizing: border-box;
  inline-size: var(--ui-status-dot-size);
  block-size: var(--ui-status-dot-size);
  border: var(--ui-border-width) solid var(--ui-palette-neutral-700);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-palette-neutral-800);
}

/* Content starts below the status bar (its offset, the island and one screen
   inset), keeps the screen inset at the sides and clears the rounded corners
   at the bottom; a long note scrolls inside the screen instead of stretching
   the phone. */
.companion-phone-frame__content {
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  align-content: safe center;
  overflow-y: auto;
  justify-items: center;
  gap: var(--ui-companion-phone-screen-inset);
  padding: calc(
      var(--ui-companion-phone-status-inset-block-start) +
        var(--ui-companion-phone-island-block-size) +
        var(--ui-companion-phone-screen-inset)
    )
    var(--ui-companion-phone-screen-inset)
    var(--ui-companion-phone-screen-radius);
  text-align: center;
}
</style>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--artwork"
  >
    <span class="obs-template-mockup__vinyl-stage">
      <span class="obs-template-mockup__vinyl-album">
        <span class="obs-template-mockup__vinyl-sleeve">
          <span class="obs-template-mockup__vinyl-artwork">
            {{ track.title?.slice(0, 1) }}
          </span>
          <span class="obs-template-mockup__vinyl-copy">
            <strong class="obs-template-mockup__vinyl-title">
              {{ track.title }}
            </strong>
            <span class="obs-template-mockup__vinyl-artist">
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
              <path class="obs-template-mockup__vinyl-stylus-tip" d="M5 19v4" />
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
  </div>
</template>

<style src="./ArtCardPreview.css"></style>

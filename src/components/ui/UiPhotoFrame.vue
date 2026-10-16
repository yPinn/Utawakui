<script setup>
import { computed } from 'vue';

// Full-width scripts take one em; Latin and digits about 0.6 of one.
const FULL_WIDTH_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
const MIN_LABEL_UNITS = 4;

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  fit: {
    type: String,
    default: 'cover',
    validator: (value) => ['cover', 'contain'].includes(value),
  },
  filtered: { type: Boolean, default: false },
  intrinsic: { type: Boolean, default: false },
  // Print stock, shared by the thumbnail and the expanded presentation.
  frame: {
    type: String,
    default: 'print',
    validator: (value) => ['print', 'archival', 'instant'].includes(value),
  },
  // One short line written on instant film's lower margin.
  label: { type: String, default: '' },
  labelLang: { type: String, default: undefined },
  // Print shape for the cover crop; contain keeps the intrinsic ratio.
  ratio: {
    type: String,
    default: 'landscape',
    validator: (value) =>
      ['landscape', 'portrait', 'square', 'wide', 'tall'].includes(value),
  },
});

// The marker line shrinks with its length so it always fits the margin.
const labelStyle = computed(() => {
  const units = [...props.label].reduce(
    (total, character) =>
      total + (FULL_WIDTH_PATTERN.test(character) ? 1 : 0.6),
    0,
  );
  return {
    '--ui-photo-frame-label-units': Math.max(MIN_LABEL_UNITS, units).toFixed(2),
  };
});
</script>

<template>
  <figure
    class="ui-photo-frame"
    :class="[
      `ui-photo-frame--${fit}`,
      {
        'ui-photo-frame--filtered': filtered,
        'ui-photo-frame--intrinsic': intrinsic,
      },
    ]"
    :data-photo-frame="frame"
    :data-photo-ratio="ratio"
  >
    <img
      class="ui-photo-frame__image"
      :src="src"
      :alt="alt"
      draggable="false"
    />
    <figcaption
      v-if="label && frame === 'instant'"
      class="ui-photo-frame__label"
      :lang="labelLang"
      :style="labelStyle"
    >
      <span class="ui-photo-frame__label-text">{{ label }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.ui-photo-frame {
  --ui-photo-frame-padding-block-end: var(--ui-photo-frame-padding);
  /* A plain print may fill the media bounds; other stocks scale them down
     or cap the enlargement of a small object. */
  --ui-photo-frame-expanded-scale: 1;
  --ui-photo-frame-expanded-max-size: 100vmax;

  position: relative;
  box-sizing: border-box;
  min-inline-size: 0;
  inline-size: 100%;
  display: grid;
  margin: 0;
  padding: var(--ui-photo-frame-padding);
  padding-block-end: var(--ui-photo-frame-padding-block-end);
  border: var(--ui-border-width) solid var(--ui-photo-frame-border-color);
  background-color: var(--ui-photo-frame-bg);
  box-shadow: var(--ui-photo-frame-shadow);
}

.ui-photo-frame__image {
  display: block;
  min-inline-size: 0;
  min-block-size: 0;
  inline-size: 100%;
  block-size: 100%;
  object-position: center;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.ui-photo-frame--cover .ui-photo-frame__image {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.ui-photo-frame--cover[data-photo-ratio='portrait'] .ui-photo-frame__image {
  aspect-ratio: 3 / 4;
}

.ui-photo-frame--cover[data-photo-ratio='square'] .ui-photo-frame__image {
  aspect-ratio: 1;
}

.ui-photo-frame--cover[data-photo-ratio='wide'] .ui-photo-frame__image {
  aspect-ratio: 16 / 9;
}

.ui-photo-frame--cover[data-photo-ratio='tall'] .ui-photo-frame__image {
  aspect-ratio: 9 / 16;
}

/* A dark archival print: same frame mechanics, restated tokens only. */
.ui-photo-frame[data-photo-frame='archival'] {
  --ui-photo-frame-padding: var(--ui-space-1);
  --ui-photo-frame-bg: var(--ui-photo-frame-archival-bg);
  --ui-photo-frame-border-color: var(--ui-photo-frame-archival-border-color);
  --ui-photo-frame-filter: grayscale(0.85) contrast(1.05);
  --ui-photo-frame-expanded-scale: var(
    --ui-photo-frame-archival-expanded-scale
  );
}

.ui-photo-frame[data-photo-frame='instant'] {
  --ui-photo-frame-padding-block-end: var(
    --ui-photo-frame-instant-padding-block-end
  );
  --ui-photo-frame-expanded-max-size: var(
    --ui-photo-frame-instant-expanded-max-size
  );
}

/* A bold marker line in the lower margin. Its width is fixed by the insets,
   so it can be the size container: the text scales with the print and
   shrinks as the line grows longer. */
.ui-photo-frame__label {
  position: absolute;
  inset-inline: var(--ui-photo-frame-padding);
  inset-block-end: 0;
  block-size: var(--ui-photo-frame-padding-block-end);
  margin: 0;
  align-content: center;
  overflow: hidden;
  container-type: inline-size;
}

.ui-photo-frame__label-text {
  display: block;
  overflow: hidden;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-display);
  font-size: min(
    var(--ui-photo-frame-label-max-size),
    calc(96cqi / var(--ui-photo-frame-label-units))
  );
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-photo-frame--contain .ui-photo-frame__image {
  object-fit: contain;
}

.ui-photo-frame--filtered .ui-photo-frame__image {
  filter: var(--ui-photo-frame-filter);
}

.ui-photo-frame--intrinsic {
  inline-size: fit-content;
}

.ui-photo-frame--intrinsic .ui-photo-frame__image {
  inline-size: auto;
  block-size: auto;
  /* auto sizing already stops at the image's own pixels; never upscale. */
  max-inline-size: calc(
    min(
        var(--ui-media-max-inline-size) * var(--ui-photo-frame-expanded-scale),
        var(--ui-photo-frame-expanded-max-size)
      ) -
      (var(--ui-photo-frame-padding) * 2) - (var(--ui-border-width) * 2)
  );
  max-block-size: calc(
    min(
        var(--ui-media-max-block-size) * var(--ui-photo-frame-expanded-scale),
        var(--ui-photo-frame-expanded-max-size)
      ) -
      var(--ui-photo-frame-padding) - var(--ui-photo-frame-padding-block-end) -
      (var(--ui-border-width) * 2)
  );
}

@media (forced-colors: active) {
  .ui-photo-frame {
    border-color: CanvasText;
    background-color: Canvas;
  }

  .ui-photo-frame__image {
    filter: none;
  }
}
</style>

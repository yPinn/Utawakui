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
  // Sizes the print from its real stock in millimetres: the page scale for a
  // thumbnail, the expanded scale for an intrinsic preview.
  scaled: { type: Boolean, default: false },
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
        'ui-photo-frame--scaled': scaled,
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
/* Real stocks in millimetres. A print's long edge is its paper's long edge;
   portrait and tall shapes narrow it, and a square uses the short edge. */
.ui-photo-frame {
  --ui-photo-frame-long-mm: var(--ui-photo-print-long-mm);
  --ui-photo-frame-short-mm: var(--ui-photo-print-short-mm);
  --ui-photo-frame-width-mm: var(--ui-photo-frame-long-mm);
  --ui-photo-frame-scale: var(--ui-photo-page-scale);
  --ui-photo-frame-expanded-max-size: 100vmax;

  position: relative;
  box-sizing: border-box;
  min-inline-size: 0;
  inline-size: 100%;
  display: grid;
  margin: 0;
  padding: var(--ui-photo-frame-padding);
  border: var(--ui-border-width) solid var(--ui-photo-frame-border-color);
  background-color: var(--ui-photo-frame-bg);
  box-shadow: var(--ui-photo-frame-shadow);
}

.ui-photo-frame[data-photo-ratio='portrait'] {
  --ui-photo-frame-width-mm: calc(var(--ui-photo-frame-long-mm) * 0.75);
}

.ui-photo-frame[data-photo-ratio='tall'] {
  --ui-photo-frame-width-mm: calc(var(--ui-photo-frame-long-mm) * 0.5625);
}

.ui-photo-frame[data-photo-ratio='square'] {
  --ui-photo-frame-width-mm: var(--ui-photo-frame-short-mm);
}

.ui-photo-frame--scaled {
  inline-size: calc(
    var(--ui-photo-frame-width-mm) * var(--ui-photo-mm) *
      var(--ui-photo-frame-scale)
  );
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

/* A dark archival print: a smaller 3R stock, restated tokens only. */
.ui-photo-frame[data-photo-frame='archival'] {
  --ui-photo-frame-padding: var(--ui-space-1);
  --ui-photo-frame-bg: var(--ui-photo-frame-archival-bg);
  --ui-photo-frame-border-color: var(--ui-photo-frame-archival-border-color);
  --ui-photo-frame-filter: grayscale(0.85) contrast(1.05);
  --ui-photo-frame-long-mm: var(--ui-photo-archival-long-mm);
  --ui-photo-frame-short-mm: var(--ui-photo-archival-short-mm);
}

/* Instant film is laid out from its own sheet: the margins and image area
   are fractions of the film, so it scales as one object at every size.
   mini carries portrait, SQUARE square and WIDE landscape photos. */
.ui-photo-frame[data-photo-frame='instant'] {
  --ui-photo-frame-film-mm: var(--ui-photo-instant-wide-film-mm);
  --ui-photo-frame-film-image-mm: var(--ui-photo-instant-wide-image-mm);
  --ui-photo-frame-width-mm: var(--ui-photo-frame-film-mm);

  grid-template-columns:
    calc(
      (var(--ui-photo-frame-film-mm) - var(--ui-photo-frame-film-image-mm)) /
        2 / var(--ui-photo-frame-film-mm) * 100%
    )
    minmax(0, 1fr)
    calc(
      (var(--ui-photo-frame-film-mm) - var(--ui-photo-frame-film-image-mm)) /
        2 / var(--ui-photo-frame-film-mm) * 100%
    );
  grid-template-rows:
    calc(
      var(--ui-photo-instant-top-mm) / var(--ui-photo-instant-film-block-mm) *
        100%
    )
    minmax(0, 1fr)
    calc(
      (
          var(--ui-photo-instant-film-block-mm) -
            var(--ui-photo-instant-image-block-mm) -
            var(--ui-photo-instant-top-mm)
        ) /
        var(--ui-photo-instant-film-block-mm) * 100%
    );
  padding: 0;
  aspect-ratio: var(--ui-photo-frame-film-mm) /
    var(--ui-photo-instant-film-block-mm);
}

.ui-photo-frame[data-photo-frame='instant'][data-photo-ratio='portrait'] {
  --ui-photo-frame-film-mm: var(--ui-photo-instant-mini-film-mm);
  --ui-photo-frame-film-image-mm: var(--ui-photo-instant-mini-image-mm);
}

.ui-photo-frame[data-photo-frame='instant'][data-photo-ratio='square'] {
  --ui-photo-frame-film-mm: var(--ui-photo-instant-square-film-mm);
  --ui-photo-frame-film-image-mm: var(--ui-photo-instant-square-image-mm);
}

/* The film's image area is the crop, in the page and in the preview. */
.ui-photo-frame[data-photo-frame='instant'] .ui-photo-frame__image {
  grid-area: 2 / 2;
  inline-size: 100%;
  block-size: 100%;
  max-inline-size: none;
  max-block-size: none;
  aspect-ratio: auto;
  object-fit: cover;
}

/* A bold marker line in the lower margin. The cell fixes its width, so it
   can be the size container: the text scales with the film and shrinks as
   the line grows longer. */
.ui-photo-frame__label {
  grid-area: 3 / 2;
  min-inline-size: 0;
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
  --ui-photo-frame-scale: var(--ui-photo-expanded-scale);

  inline-size: fit-content;
}

/* An expanded print's long edge stops at its real size × the expanded
   scale, within the media bounds; auto sizing never upscales the image. */
.ui-photo-frame--intrinsic.ui-photo-frame--scaled {
  --ui-photo-frame-expanded-max-size: calc(
    var(--ui-photo-frame-long-mm) * var(--ui-photo-mm) *
      var(--ui-photo-frame-scale)
  );
}

.ui-photo-frame--intrinsic .ui-photo-frame__image {
  inline-size: auto;
  block-size: auto;
  max-inline-size: calc(
    min(
        var(--ui-media-max-inline-size),
        var(--ui-photo-frame-expanded-max-size)
      ) -
      (var(--ui-photo-frame-padding) * 2) - (var(--ui-border-width) * 2)
  );
  max-block-size: calc(
    min(
        var(--ui-media-max-block-size),
        var(--ui-photo-frame-expanded-max-size)
      ) -
      (var(--ui-photo-frame-padding) * 2) - (var(--ui-border-width) * 2)
  );
}

/* Expanded film keeps its sheet: real width × the expanded scale, held
   inside the media bounds on both axes. */
.ui-photo-frame--intrinsic[data-photo-frame='instant'] {
  inline-size: min(
    var(--ui-photo-frame-film-mm) * var(--ui-photo-mm) *
      var(--ui-photo-frame-scale),
    var(--ui-media-max-inline-size),
    var(--ui-media-max-block-size) * var(--ui-photo-frame-film-mm) /
      var(--ui-photo-instant-film-block-mm)
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

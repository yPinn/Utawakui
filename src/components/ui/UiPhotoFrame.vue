<script setup>
defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  fit: {
    type: String,
    default: 'cover',
    validator: (value) => ['cover', 'contain'].includes(value),
  },
  filtered: { type: Boolean, default: false },
  intrinsic: { type: Boolean, default: false },
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
  >
    <img
      class="ui-photo-frame__image"
      :src="src"
      :alt="alt"
      draggable="false"
    />
  </figure>
</template>

<style scoped>
.ui-photo-frame {
  box-sizing: border-box;
  min-inline-size: 0;
  inline-size: 100%;
  display: grid;
  margin: 0;
  padding: var(--ui-photo-frame-padding);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
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
  max-inline-size: calc(
    var(--ui-media-max-inline-size) - (var(--ui-photo-frame-padding) * 2) -
      (var(--ui-border-width) * 2)
  );
  max-block-size: calc(
    var(--ui-media-max-block-size) - (var(--ui-photo-frame-padding) * 2) -
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

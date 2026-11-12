<script setup>
import { Disc3, MicVocal, Star } from '../../icons/index.js';
import '../../styles/folderStationeryShapes.css';

const motifs = { microphone: MicVocal, record: Disc3, star: Star };

defineProps({
  kind: {
    type: String,
    required: true,
    validator: (value) => ['stamp', 'postmark', 'ticket'].includes(value),
  },
  motif: {
    type: String,
    default: 'record',
    validator: (value) => ['microphone', 'record', 'star'].includes(value),
  },
  ink: {
    type: String,
    default: 'black',
    validator: (value) => ['black', 'blue', 'red'].includes(value),
  },
  date: { type: String, default: '' },
});
</script>

<template>
  <span
    class="ui-folder-decoration"
    :data-decoration="kind"
    :data-ink="ink"
    aria-hidden="true"
  >
    <span
      v-if="kind === 'stamp'"
      class="ui-folder-decoration__stamp ui-folder-stamp-edge"
    >
      <span class="ui-folder-decoration__print">
        <component :is="motifs[motif]" :stroke-width="1.5" />
      </span>
    </span>
    <span
      v-else-if="kind === 'postmark'"
      class="ui-folder-decoration__impression"
    >
      <span class="ui-folder-decoration__seal"
        ><span>{{ date }}</span></span
      >
      <span class="ui-folder-decoration__cancel"
        ><i v-for="line in 3" :key="line"></i
      ></span>
    </span>
    <span
      v-else
      class="ui-folder-decoration__ticket ui-folder-ticket-edge ticket-cut"
    ></span>
  </span>
</template>

<style scoped>
.ui-folder-decoration {
  --decoration-ink: var(--ui-color-paper-text);
  display: block;
  color: var(--decoration-ink);
  pointer-events: none;
  user-select: none;
}

.ui-folder-decoration[data-ink='blue'] {
  --decoration-ink: var(--ui-palette-indigo-900);
}

.ui-folder-decoration[data-ink='red'] {
  --decoration-ink: var(--ui-palette-red-700);
}

.ui-folder-decoration[data-decoration='stamp'],
.ui-folder-decoration[data-decoration='ticket'] {
  filter: drop-shadow(var(--ui-folder-stationery-tape-shadow));
}

.ui-folder-decoration[data-decoration='stamp'] {
  inline-size: var(
    --ui-folder-decoration-inline-size,
    var(--ui-artwork-size-sm)
  );
}

.ui-folder-decoration__stamp,
.ui-folder-decoration__ticket {
  display: grid;
  background-color: var(--ui-color-paper);
  background-image: url('../../../overlay/shared/paper-grain.svg?no-inline');
  background-blend-mode: soft-light;
}

.ui-folder-decoration__stamp {
  aspect-ratio: 4 / 5;
  padding: var(--ui-space-1);
}

.ui-folder-decoration__print {
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid currentColor;
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-paper);
  background: color-mix(in srgb, currentColor 11%, transparent);
}

.ui-folder-decoration__print > svg {
  display: block;
  inline-size: 66%;
  block-size: auto;
}

.ui-folder-decoration[data-decoration='postmark'] {
  inline-size: var(
    --ui-folder-decoration-inline-size,
    calc(var(--ui-artwork-size-lg) + var(--ui-space-4))
  );
  color: color-mix(in srgb, var(--decoration-ink) 58%, var(--ui-color-text));
}

.ui-folder-decoration[data-decoration='postmark'][data-ink='black'] {
  color: var(--ui-color-text-muted);
}

.ui-folder-decoration__impression {
  display: grid;
  grid-template-columns: 56% minmax(0, 1fr);
  align-items: center;
}

.ui-folder-decoration__seal {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border: var(--ui-border-width) solid currentColor;
  border-radius: 50%;
  font: var(--ui-type-label-weight) calc(var(--ui-type-caption-size) * 0.82) / 1
    var(--ui-font-family-utility);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ui-folder-decoration__seal::before {
  content: '';
  position: absolute;
  inset: var(--ui-space-1);
  border: var(--ui-border-width) dashed currentColor;
  border-radius: 50%;
  opacity: var(--ui-opacity-muted);
}

.ui-folder-decoration__cancel {
  display: grid;
  gap: var(--ui-space-1);
  padding-inline-start: var(--ui-space-1);
}

.ui-folder-decoration__cancel > i {
  border-block-start: var(--ui-border-width) solid currentColor;
  block-size: var(--ui-space-1);
  border-radius: 50%;
}

.ui-folder-decoration[data-decoration='ticket'] {
  inline-size: var(
    --ui-folder-decoration-inline-size,
    var(--ui-artwork-size-xl)
  );
}

.ui-folder-decoration__ticket {
  position: relative;
  aspect-ratio: 3 / 1;
  --ticket-ink: color-mix(in srgb, currentColor 62%, transparent);
}

.ui-folder-decoration__ticket::before,
.ui-folder-decoration__ticket::after {
  content: '';
  position: absolute;
  inset-block: var(--ui-space-1);
}

.ui-folder-decoration__ticket::before {
  inset-inline: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ticket-ink);
}

.ui-folder-decoration__ticket::after {
  inset-inline-start: 73%;
  border-inline-start: var(--ui-border-width) dashed var(--ticket-ink);
}
</style>

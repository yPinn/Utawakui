<script setup>
import { computed } from 'vue';
import { encode } from 'uqr';

const props = defineProps({
  value: { type: String, required: true },
  label: { type: String, required: true },
});

// One SVG path from the module matrix; dark modules on a fixed light field so
// phone cameras can read it in either app theme.
const qr = computed(() => {
  const { data, size } = encode(props.value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { path, size };
});
</script>

<template>
  <svg
    class="companion-pairing-qr"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <rect
      class="companion-pairing-qr__field"
      :width="qr.size"
      :height="qr.size"
    />
    <path class="companion-pairing-qr__modules" :d="qr.path" />
  </svg>
</template>

<style scoped>
.companion-pairing-qr {
  inline-size: min(100%, 12rem);
  block-size: auto;
  border-radius: var(--ui-radius-sm);
}

.companion-pairing-qr__field {
  fill: var(--ui-palette-neutral-50);
}

.companion-pairing-qr__modules {
  fill: var(--ui-palette-neutral-950);
}
</style>

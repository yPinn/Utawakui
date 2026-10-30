<script setup>
// One clearly labelled unadopted proposal per section; never production truth.
defineProps({
  note: { type: String, required: true },
});
</script>

<template>
  <section
    class="demo-specimens__section demo-proposal-specimen"
    data-demo-proposal
  >
    <h4>提案（未採用）</h4>
    <p class="demo-specimens__copy">{{ note }}</p>
    <div class="demo-proposal-specimen__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.demo-proposal-specimen__body {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) dashed var(--ui-color-border);
  border-radius: var(--ui-radius-md);
}
</style>

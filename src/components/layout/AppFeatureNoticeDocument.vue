<script setup>
import UiSeparator from '../ui/UiSeparator.vue';

defineProps({ feature: { type: Object, required: true } });
</script>

<template>
  <div class="feature-notice">
    <p class="feature-notice__summary">
      {{ feature.summary }}
    </p>

    <UiSeparator />

    <ol class="feature-notice__list">
      <li
        v-for="(line, index) in feature.body"
        :key="line"
        class="feature-notice__item"
      >
        <h3 class="feature-notice__section-title">
          {{ feature.bodyTitles[index] }}
        </h3>
        <p class="feature-notice__copy">{{ line }}</p>
      </li>
    </ol>

    <slot />
  </div>
</template>

<style scoped>
.feature-notice {
  display: grid;
  gap: var(--ui-modal-section-gap);
}

.feature-notice__summary {
  margin: 0;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}

.feature-notice__list {
  display: grid;
  gap: var(--ui-space-5);
  margin: 0;
  padding-inline-start: var(--ui-space-6);
  list-style-type: trad-chinese-informal;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}

.feature-notice__item {
  padding-inline-start: var(--ui-space-2);
}

.feature-notice__item::marker {
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-semibold);
}

.feature-notice__section-title {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-body-line-height);
}

.feature-notice__copy {
  margin: 0;
  font-family: var(--ui-font-family-base);
  overflow-wrap: anywhere;
}
</style>

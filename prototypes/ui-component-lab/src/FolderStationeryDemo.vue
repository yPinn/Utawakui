<script setup>
import UiFolderDecoration from '../../../src/components/ui/UiFolderDecoration.vue';

const stamps = [
  { motif: 'microphone', ink: 'black', label: '麥克風' },
  { motif: 'record', ink: 'blue', label: '唱片' },
  { motif: 'star', ink: 'red', label: '星星' },
];
</script>

<template>
  <section class="stationery-demo">
    <section class="stationery-demo__postage">
      <h2>郵票</h2>
      <div class="stationery-demo__samples">
        <figure
          v-for="stamp in stamps"
          :key="stamp.motif"
          class="stationery-demo__stamp"
        >
          <UiFolderDecoration
            kind="stamp"
            :motif="stamp.motif"
            :ink="stamp.ink"
          />
          <figcaption>{{ stamp.label }}</figcaption>
        </figure>
      </div>
    </section>

    <section class="stationery-demo__impressions">
      <h2>日期郵戳</h2>
      <UiFolderDecoration kind="postmark" date="11/06" ink="red" />
    </section>

    <section class="stationery-demo__tickets">
      <h2>空白票根</h2>
      <UiFolderDecoration kind="ticket" />
    </section>
  </section>
</template>

<style scoped>
.stationery-demo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-6);
  padding: var(--ui-space-6);
  background: var(--ui-color-surface);
}

.stationery-demo h2 {
  padding-block-end: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
}

.stationery-demo__postage {
  grid-row: span 2;
}

.stationery-demo__samples {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-6);
  margin-block-start: var(--ui-space-6);
}

.stationery-demo__stamp {
  --ui-folder-decoration-inline-size: var(--ui-artwork-size-lg);
  display: grid;
  justify-items: center;
  gap: var(--ui-space-3);
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.stationery-demo__impressions .ui-folder-decoration,
.stationery-demo__tickets .ui-folder-decoration {
  margin-block-start: var(--ui-space-4);
}

.stationery-demo__tickets .ui-folder-decoration {
  --ui-folder-decoration-inline-size: min(100%, var(--ui-artwork-size-3xl));
}

@media (max-width: 48rem) {
  .stationery-demo {
    grid-template-columns: minmax(0, 1fr);
  }

  .stationery-demo__postage {
    grid-row: auto;
  }
}
</style>

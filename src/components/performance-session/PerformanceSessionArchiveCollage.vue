<script setup>
import UiPhotoFrame from '../ui/UiPhotoFrame.vue';
import '../../styles/folderStationeryShapes.css';

defineProps({
  layout: { type: String, required: true },
  photos: { type: Array, required: true },
  caption: { type: String, required: true },
  time: { type: String, required: true },
});
</script>

<template>
  <div class="calendar-collage" :data-layout="layout" aria-hidden="true">
    <UiPhotoFrame
      v-for="(src, index) in photos"
      :key="src"
      :src="src"
      :class="[
        index ? 'calendar-collage__second' : 'calendar-collage__photo',
        { 'ui-folder-stamp-edge': layout === 'stamp' },
      ]"
      :frame="layout === 'instant' ? 'instant' : 'print'"
      :ratio="layout === 'wide' ? 'wide' : 'square'"
    />
    <span v-if="layout === 'wide'" class="calendar-collage__tape"></span>
    <span
      v-if="layout === 'ticket' || layout === 'note'"
      class="calendar-collage__paper"
      :class="{ 'ui-folder-ticket-edge ticket-cut': layout === 'ticket' }"
    >
      <span>{{ caption }}</span>
      <span class="calendar-collage__time">{{ time }}</span>
    </span>
  </div>
</template>

<style scoped>
.calendar-collage {
  position: absolute;
  inset: var(--ui-space-5) var(--ui-space-1) var(--ui-space-1);
  container: archive-collage / size;
  pointer-events: none;
}

.calendar-collage__photo,
.calendar-collage__second {
  --ui-photo-frame-background: var(--ui-color-paper);
  --ui-photo-frame-border-color: transparent;
  --ui-photo-frame-padding: var(--ui-space-1);
  position: absolute;
  inline-size: min(67%, 82cqb, var(--ui-artwork-size-lg));
  inset-block-start: var(--ui-space-1);
  inset-inline-start: 17%;
  transform: rotate(-6deg);
}

.calendar-collage[data-layout='instant'] .calendar-collage__photo {
  inline-size: min(67%, 75cqb, var(--ui-artwork-size-lg));
}

.calendar-collage[data-layout='wide'] .calendar-collage__photo {
  inline-size: min(90%, 145cqb);
  inset-inline-start: 5%;
  transform: rotate(3deg);
}

.calendar-collage__tape {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 32%;
  inline-size: var(--ui-space-6);
  block-size: var(--ui-space-3);
  background: var(--ui-folder-stationery-tape-paper);
  transform: rotate(-11deg);
}

.calendar-collage[data-layout='pair'] .calendar-collage__photo {
  inline-size: min(66%, 82cqb, var(--ui-artwork-size-lg));
  inset-inline-start: 5%;
}

.calendar-collage__second {
  inline-size: min(58%, 69cqb, var(--ui-artwork-size-lg));
  inset-block-start: 23%;
  inset-inline: auto 5%;
  transform: rotate(9deg);
}

.calendar-collage[data-layout='stamp'] .calendar-collage__photo {
  inset-inline-start: 22%;
  inline-size: min(60%, 82cqb, var(--ui-artwork-size-lg));
}

.calendar-collage[data-layout='ticket'] .calendar-collage__photo {
  inline-size: min(47%, 82cqb);
  inset-inline-start: 8%;
  transform: rotate(-8deg);
}

.calendar-collage__paper {
  position: absolute;
  inset: var(--ui-space-5) var(--ui-space-1) auto 25%;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-color-paper);
  color: var(--ui-color-paper-text);
  box-shadow: var(--ui-shadow-contact);
  transform: rotate(5deg);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

.calendar-collage[data-layout='note'] .calendar-collage__paper {
  inset: var(--ui-space-2) 8% auto 8%;
  transform: rotate(-4deg);
}

.calendar-collage__time {
  border-block-start: var(--ui-border-width) dashed currentColor;
  font-family: var(--ui-font-family-utility);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@container archive-collage (max-height: 4rem) {
  .calendar-collage__paper {
    inset-block-start: var(--ui-space-2);
  }

  .calendar-collage__paper > span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-collage__time {
    display: none;
  }
}
</style>

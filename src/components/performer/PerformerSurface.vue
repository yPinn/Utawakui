<script setup>
import PerformerCueStack from './PerformerCueStack.vue';
import PerformerActionBar from './PerformerActionBar.vue';
import PerformerNextTrack from './PerformerNextTrack.vue';
import PerformerTrackContext from './PerformerTrackContext.vue';

defineProps({
  frame: { type: Object, required: true },
  pending: { type: Boolean, default: false },
  mode: {
    type: String,
    default: 'prompter',
    validator: (value) => ['prompter', 'remote', 'combined'].includes(value),
  },
  readingScale: {
    type: String,
    default: 'desk',
    validator: (value) => ['near', 'desk', 'stage'].includes(value),
  },
});

defineEmits([
  'control',
  'sync-action',
  'update:readingScale',
  'display-boundary',
]);
</script>

<template>
  <main
    class="performer-surface"
    :data-mode="mode"
    :data-reading-scale="readingScale"
  >
    <div class="performer-surface__layout">
      <PerformerTrackContext class="performer-surface__track" :frame="frame" />
      <div class="performer-surface__cue-region">
        <PerformerCueStack
          :frame="frame"
          :reading-scale="readingScale"
          @display-boundary="$emit('display-boundary', $event)"
        />
      </div>
      <section class="performer-surface__utility-rail" aria-label="提詞工具">
        <PerformerNextTrack
          v-if="frame.nextTrack"
          class="performer-surface__next"
          :track="frame.nextTrack"
        />
        <PerformerActionBar
          :frame="frame"
          :reading-scale="readingScale"
          :pending="pending"
          @control="$emit('control', $event)"
          @sync-action="$emit('sync-action', $event)"
          @update:reading-scale="$emit('update:readingScale', $event)"
        />
      </section>
    </div>
  </main>
</template>

<style scoped>
.performer-surface {
  --ui-performer-lyrics-max-width: var(--ui-performer-lyrics-max-width-desk);
  --ui-performer-cue-gap: var(--ui-space-4);
  --ui-performer-cue-gap-comfortable: var(
    --ui-performer-cue-gap-comfortable-desk
  );
  --ui-performer-cue-current-font-size: var(
    --ui-performer-cue-current-size-desk
  );
  --ui-performer-cue-next-font-size: var(--ui-performer-cue-next-size-desk);
  --ui-performer-reading-font-size: var(--ui-performer-reading-size-desk);
  --ui-performer-next-ruby-font-size: var(--ui-performer-next-ruby-size-desk);

  container-name: performer-surface;
  container-type: size;
  min-width: 0;
  min-height: 0;
  height: 100%;
  -webkit-user-select: none;
  user-select: none;
}

.performer-surface__layout {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: var(--ui-space-3);
  padding: max(var(--ui-space-3), env(safe-area-inset-top))
    max(var(--ui-space-3), env(safe-area-inset-right))
    max(var(--ui-space-3), env(safe-area-inset-bottom))
    max(var(--ui-space-3), env(safe-area-inset-left));
  overflow: hidden;
  background: var(--ui-color-canvas);
}

.performer-surface[data-reading-scale='near'] {
  --ui-performer-lyrics-max-width: var(--ui-performer-lyrics-max-width-near);
  --ui-performer-cue-gap-comfortable: var(
    --ui-performer-cue-gap-comfortable-near
  );
  --ui-performer-cue-current-font-size: var(
    --ui-performer-cue-current-size-near
  );
  --ui-performer-cue-next-font-size: var(--ui-performer-cue-next-size-near);
  --ui-performer-reading-font-size: var(--ui-performer-reading-size-near);
  --ui-performer-next-ruby-font-size: var(--ui-performer-next-ruby-size-near);
}

.performer-surface[data-reading-scale='stage'] {
  --ui-performer-lyrics-max-width: var(--ui-performer-lyrics-max-width-stage);
  --ui-performer-cue-gap-comfortable: var(
    --ui-performer-cue-gap-comfortable-stage
  );
  --ui-performer-cue-current-font-size: var(
    --ui-performer-cue-current-size-stage
  );
  --ui-performer-cue-next-font-size: var(--ui-performer-cue-next-size-stage);
  --ui-performer-reading-font-size: var(--ui-performer-reading-size-stage);
  --ui-performer-next-ruby-font-size: var(--ui-performer-next-ruby-size-stage);
}

.performer-surface__cue-region {
  min-width: 0;
  min-height: 0;
  display: grid;
  align-items: center;
  overflow: auto;
  scrollbar-width: thin;
}

.performer-surface__utility-rail {
  min-width: 0;
  display: grid;
}

.performer-surface__utility-rail {
  gap: var(--ui-space-2);
}

@container performer-surface (min-width: 48rem) {
  .performer-surface__utility-rail {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-5);
  }
}

@container performer-surface (min-height: 30rem) {
  .performer-surface__layout {
    --ui-performer-cue-gap: var(--ui-performer-cue-gap-comfortable);

    gap: var(--ui-space-5);
    padding-block: max(var(--ui-space-5), env(safe-area-inset-top))
      max(var(--ui-space-5), env(safe-area-inset-bottom));
    padding-inline: max(var(--ui-space-5), env(safe-area-inset-left))
      max(var(--ui-space-5), env(safe-area-inset-right));
  }
}

@container performer-surface (min-width: 64rem) and (min-height: 36rem) {
  .performer-surface__layout {
    gap: var(--ui-space-5);
    padding: max(var(--ui-space-5), env(safe-area-inset-top))
      max(var(--ui-space-6), env(safe-area-inset-right))
      max(var(--ui-space-5), env(safe-area-inset-bottom))
      max(var(--ui-space-6), env(safe-area-inset-left));
  }
}

@container performer-surface (max-height: 24rem) {
  .performer-surface__layout {
    --ui-performer-cue-gap: var(--ui-space-4);

    gap: var(--ui-space-2);
    padding-block: max(var(--ui-space-2), env(safe-area-inset-top))
      max(var(--ui-space-2), env(safe-area-inset-bottom));
  }

  .performer-surface__utility-rail {
    gap: var(--ui-space-1);
  }
}

@media (pointer: coarse) {
  .performer-surface {
    --ui-performer-action-min-block-size: var(--ui-control-height-live);
  }
}
</style>

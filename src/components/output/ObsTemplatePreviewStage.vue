<script setup>
import { computed, ref, watch } from 'vue';
import { Pause, Play } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import ObsTemplateMockup from './ObsTemplateMockup.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
});

const isMotionPlaying = ref(true);
const motionIcon = computed(() => (isMotionPlaying.value ? Pause : Play));
const motionLabel = computed(() =>
  isMotionPlaying.value ? '暫停動態預覽' : '播放動態預覽',
);

watch(
  () => props.preset?.id,
  () => {
    isMotionPlaying.value = true;
  },
);

function toggleMotion() {
  isMotionPlaying.value = !isMotionPlaying.value;
}
</script>

<template>
  <section class="obs-template-preview-stage" aria-label="選中模板預覽">
    <header class="obs-template-preview-stage__toolbar">
      <div class="obs-template-preview-stage__labels">
        <UiChip tone="muted">{{ scene.label ?? '固定示例' }}</UiChip>
        <span class="obs-template-preview-stage__motion">
          {{ preset?.preview?.motionLabel ?? '靜態' }}
        </span>
      </div>
      <UiButton
        :icon="motionIcon"
        :active="isMotionPlaying"
        :aria-label="motionLabel"
        :title="motionLabel"
        @click="toggleMotion"
      />
    </header>

    <ObsTemplateMockup
      :preset="preset"
      :scene="scene"
      size="detail"
      :animated="isMotionPlaying"
    />
  </section>
</template>

<style scoped>
.obs-template-preview-stage {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__toolbar,
.obs-template-preview-stage__labels {
  min-width: 0;
  display: flex;
  align-items: center;
}

.obs-template-preview-stage__toolbar {
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__labels {
  gap: var(--ui-space-2);
  overflow: hidden;
}

.obs-template-preview-stage__motion {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

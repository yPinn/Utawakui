<script setup>
import { computed, ref, watch } from 'vue';
import { Pause, Play } from '../../icons/index.js';
import UiStack from '../ui/UiStack.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import ObsPreviewBackdropToggle from './ObsPreviewBackdropToggle.vue';
import ObsTemplateMockup from './ObsTemplateMockup.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
});

const captureSize = computed(() =>
  captureSizeForKind(props.preset?.kind, null, props.preset?.id),
);

const isMotionPlaying = ref(true);
const backdrop = ref('dark');
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
    <header
      class="obs-template-preview-stage__toolbar"
      data-output-preview-info
    >
      <ObsPreviewCaption
        :label="preset?.kind === 'lyrics' ? '固定' : captureSize.label"
        :width="captureSize.width"
        :height="captureSize.height"
      />
      <UiStack
        class="obs-template-preview-stage__actions"
        align="center"
        :gap="2"
      >
        <ObsPreviewBackdropToggle v-model="backdrop" />
        <UiIconButton
          :icon="motionIcon"
          :label="motionLabel"
          :active="isMotionPlaying"
          :aria-pressed="isMotionPlaying"
          @click="toggleMotion"
        />
      </UiStack>
      <UiStack
        class="obs-template-preview-stage__labels"
        align="center"
        :gap="2"
      >
        <UiChip tone="muted">{{ scene.label ?? '固定示例' }}</UiChip>
        <span class="obs-template-preview-stage__motion">
          {{ preset?.preview?.motionLabel ?? '靜態' }}
        </span>
      </UiStack>
    </header>

    <div class="obs-template-preview-stage__canvas-group">
      <ObsTemplateMockup
        :preset="preset"
        :scene="scene"
        size="detail"
        :animated="isMotionPlaying"
        :backdrop="backdrop"
      />
    </div>
  </section>
</template>

<style scoped>
.obs-template-preview-stage {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__canvas-group {
  box-sizing: border-box;
  padding: var(--ui-output-preview-inset);
  background: var(--ui-color-canvas);
  min-inline-size: 0;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__labels,
.obs-template-preview-stage__actions {
  min-width: 0;
}

.obs-template-preview-stage__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-template-preview-stage__labels {
  grid-column: 1 / -1;
  overflow: hidden;
}

.obs-template-preview-stage__actions {
  flex: 0 0 auto;
}

.obs-template-preview-stage__motion {
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

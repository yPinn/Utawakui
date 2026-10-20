<script setup>
// FFmpeg source picker — system-installed vs the app-managed Gyan download.
// Native choices share UiRadioGroup with the device picker. Selection edits
// the local draft; only the explicit apply action may change or download tools.
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { Download, ICON_SIZE, RefreshCw, Settings } from '../../icons/index.js';
import { FEATURE_DEPENDENCIES } from '../../constants/featureDependencies.js';
import { useFeatureDependencies } from '../../composables/useFeatureDependencies.js';
import { useAppDiagnostics } from '../../composables/useAppDiagnostics.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';

const FFMPEG_DEPENDENCY_ID = 'ffmpeg-gyan-essentials';
const managedDependency = FEATURE_DEPENDENCIES.find(
  (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
);

const selectedSource = shallowRef('managed');

const props = defineProps({
  open: { type: Boolean, default: false },
  // The caller's latest visibility-triggered detection avoids a blank first read.
  initialDetection: { type: Object, default: null },
});
const emit = defineEmits(['close']);

const {
  state: featureDependencyState,
  prepareDependency,
  refreshDependencies,
} = useFeatureDependencies();
const { recordError } = useAppDiagnostics();

const detection = shallowRef(props.initialDetection);
const isDetecting = shallowRef(false);
const isSwitching = shallowRef(false);
const switchError = shallowRef('');
const detectionError = shallowRef('');
const content = useTemplateRef('content');
watch([isDetecting, isSwitching], async ([detecting, switching]) => {
  if (detecting || switching || !props.open || typeof document === 'undefined')
    return;
  await nextTick();
  if (!props.open || document.activeElement !== document.body) return;
  const selected = content.value?.querySelector(
    'input[type="radio"]:checked:not(:disabled)',
  );
  (selected || content.value)?.focus();
});

function hasDetectBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.detectSystemFfmpeg === 'function'
  );
}

async function redetect() {
  if (isDetecting.value) return;
  isDetecting.value = true;
  try {
    await refreshDependencies?.();
    if (!hasDetectBridge()) {
      detectionError.value = '無法檢查系統 FFmpeg，請重新啟動後再試。';
      return;
    }
    detection.value = await window.Utawakui.detectSystemFfmpeg();
    detectionError.value = '';
  } catch {
    detectionError.value = '無法檢查系統 FFmpeg，請重新檢查。';
  } finally {
    isDetecting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    switchError.value = '';
    selectedSource.value = currentSource.value || 'managed';
    if (!detection.value) redetect();
  },
);

const currentDependency = computed(
  () => featureDependencyState.byId[FFMPEG_DEPENDENCY_ID],
);
const currentSource = computed(() =>
  !currentDependency.value || featureDependencyState.readError
    ? null
    : currentDependency.value.source === 'system'
      ? 'system'
      : 'managed',
);

watch(
  currentSource,
  (source) => {
    if (source) selectedSource.value = source;
  },
  { immediate: true },
);

const progress = computed(
  () => featureDependencyState.progressById[FFMPEG_DEPENDENCY_ID],
);
const managedProgressLabel = computed(() => {
  const value = progress.value;
  if (!value) return '';
  if (value.stage === 'downloading' && Number.isFinite(value.percent)) {
    return `下載中 ${value.percent}%`;
  }
  return '準備中…';
});
const systemSourceCaption = computed(() => {
  if (detectionError.value) return '無法讀取';
  if (isDetecting.value) return '檢查中';
  if (detection.value?.ok)
    return currentSource.value === 'system' &&
      currentDependency.value?.installed
      ? '已套用'
      : '可使用';
  if (detection.value) return '未找到可用版本';
  return '尚未檢查';
});
const systemSourceDetail = computed(() => {
  if (!detection.value) return '尚未檢查系統 FFmpeg';
  if (!detection.value.ok) return '未找到可用版本';
  return [
    detection.value.path,
    detection.value.version && `v${detection.value.version}`,
  ]
    .filter(Boolean)
    .join(' · ');
});
const managedSourceCaption = computed(() => {
  if (managedProgressLabel.value) return managedProgressLabel.value;
  if (currentSource.value === 'managed' && currentDependency.value?.installed)
    return '已套用';
  if (
    currentSource.value === 'managed' &&
    currentDependency.value?.installed === false
  )
    return '尚未下載；按「準備並使用」後下載。';
  return '由 Utawakui 下載並管理；尚未安裝時會先下載。';
});
const managedSourceDetail = computed(() =>
  [
    managedDependency?.name,
    managedDependency?.license,
    managedDependency?.displayVersion,
  ]
    .filter(Boolean)
    .join(' · '),
);

const isSystemSelectable = computed(
  () => !detectionError.value && Boolean(detection.value?.ok),
);
const isBusy = computed(
  () => isSwitching.value || featureDependencyState.preparingIds.size > 0,
);

async function chooseSystem() {
  if (
    !currentSource.value ||
    isDetecting.value ||
    !isSystemSelectable.value ||
    isBusy.value
  )
    return;
  isSwitching.value = true;
  switchError.value = '';
  try {
    await window.Utawakui.setFfmpegSource(true);
  } catch (err) {
    switchError.value = recordError(err, {
      code: 'FFMPEG_SOURCE_SWITCH_FAILED',
      title: '無法切換 FFmpeg 來源',
      message: '請再試一次。',
      source: 'settings',
      operation: 'set-ffmpeg-source',
      context: { retryable: true },
    }).message;
  } finally {
    isSwitching.value = false;
  }
}

async function chooseManaged() {
  if (!currentSource.value || isDetecting.value || isBusy.value) return;
  isSwitching.value = true;
  switchError.value = '';
  try {
    // setFfmpegSource(false) clears the opt-in path; prepareDependency is a
    // no-op if the managed copy is already on disk (ensureFfmpegDependency
    // checks fs.existsSync before downloading anything).
    await window.Utawakui.setFfmpegSource(false);
    await prepareDependency(FFMPEG_DEPENDENCY_ID);
  } catch (err) {
    switchError.value = recordError(err, {
      code: 'FFMPEG_SOURCE_SWITCH_FAILED',
      title: '無法切換 FFmpeg 來源',
      message: '請再試一次。',
      source: 'settings',
      operation: 'set-ffmpeg-source',
      context: { retryable: true },
    }).message;
  } finally {
    isSwitching.value = false;
  }
}
</script>

<template>
  <UiModal
    :open="open"
    title="音訊轉換工具"
    size="notice"
    max-block-size="small"
    @close="emit('close')"
  >
    <template #header-actions>
      <UiIconButton
        :icon="RefreshCw"
        label="重新檢查工具"
        :loading="isDetecting"
        :disabled="isBusy"
        @click="redetect"
      />
      <UiButton
        variant="accent"
        :disabled="
          isBusy ||
          isDetecting ||
          !currentSource ||
          (selectedSource === 'system' && !isSystemSelectable)
        "
        @click="selectedSource === 'system' ? chooseSystem() : chooseManaged()"
        >{{
          selectedSource === 'system' ? '使用此版本' : '準備並使用'
        }}</UiButton
      >
    </template>
    <div ref="content" class="ffmpeg-source-modal" tabindex="-1">
      <p class="ffmpeg-source-modal__description">
        選擇工具來源，再按「使用此版本」或「準備並使用」套用。
      </p>
      <UiRadioGroup
        v-model="selectedSource"
        name="ffmpeg-source"
        legend="工具來源"
        legend-hidden
        :disabled="isBusy || !currentSource"
        :items="[
          {
            id: 'system',
            label: '電腦上的 FFmpeg',
            description: systemSourceCaption,
            icon: Settings,
            disabled: !isSystemSelectable,
          },
          {
            id: 'managed',
            label: 'Utawakui 管理版本',
            description: managedSourceCaption,
            icon: Download,
          },
        ]"
      >
        <template #label="{ item }">
          <span class="ffmpeg-source-modal__option-label"
            ><component
              :is="item.icon"
              :size="ICON_SIZE"
              aria-hidden="true"
            />{{ item.label }}</span
          >
        </template>
      </UiRadioGroup>
      <UiHint v-if="!currentSource" tone="warning"
        >尚未確認工具設定，請按頂部「重新檢查工具」。</UiHint
      >
      <UiDisclosure label="版本與授權資訊">
        <UiHint>{{
          selectedSource === 'system' ? systemSourceDetail : managedSourceDetail
        }}</UiHint>
      </UiDisclosure>
      <UiHint v-if="detectionError" tone="danger" role="alert">{{
        detectionError
      }}</UiHint>
      <UiHint
        v-if="featureDependencyState.errorsById?.[FFMPEG_DEPENDENCY_ID]"
        tone="danger"
        role="alert"
        >{{ featureDependencyState.errorsById[FFMPEG_DEPENDENCY_ID].title }}：{{
          featureDependencyState.errorsById[FFMPEG_DEPENDENCY_ID].message
        }}</UiHint
      >
      <UiNotice
        v-if="switchError"
        tone="danger"
        title="無法切換工具來源"
        :message="switchError"
        compact
      />
    </div>
  </UiModal>
</template>

<style scoped>
.ffmpeg-source-modal {
  display: grid;
  gap: var(--ui-space-3);
}
.ffmpeg-source-modal:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
.ffmpeg-source-modal__description {
  max-inline-size: 65ch;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}
.ffmpeg-source-modal__option-label {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>

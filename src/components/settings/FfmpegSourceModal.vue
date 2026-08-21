<script setup>
// FFmpeg source picker — system-installed vs the app-managed Gyan download.
// Same "full-width selectable row list inside a dedicated modal" shape as
// CaptureDeviceModal.vue, for the same reason: this is a deliberate,
// occasional configuration choice (not a tucked-away overflow action), and
// the system row needs to show a full path without ellipsis-truncating it
// into something unrecognizable.
import { computed, shallowRef, watch } from 'vue';
import {
  Check,
  CircleAlert,
  Download,
  ICON_SIZE,
  Loader2,
  RefreshCw,
  Settings,
} from '../../icons/index.js';
import { FEATURE_DEPENDENCIES } from '../../constants/featureDependencies.js';
import { useFeatureDependencies } from '../../composables/useFeatureDependencies.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

const FFMPEG_DEPENDENCY_ID = 'ffmpeg-gyan-essentials';
const managedDependency = FEATURE_DEPENDENCIES.find(
  (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
);

const props = defineProps({
  open: { type: Boolean, default: false },
  // SettingsView's mount-time probe result — shown immediately so opening
  // the modal doesn't always start from a blank "偵測中" state.
  initialDetection: { type: Object, default: null },
});
const emit = defineEmits(['close']);

const { state: featureDependencyState, prepareDependency } =
  useFeatureDependencies();

const detection = shallowRef(props.initialDetection);
const isDetecting = shallowRef(false);
const isSwitching = shallowRef(false);
const switchError = shallowRef('');

function hasDetectBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.detectSystemFfmpeg === 'function'
  );
}

async function redetect() {
  if (!hasDetectBridge() || isDetecting.value) return;
  isDetecting.value = true;
  try {
    detection.value = await window.Utawakui.detectSystemFfmpeg();
  } finally {
    isDetecting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    switchError.value = '';
    if (!detection.value) redetect();
  },
);

const currentDependency = computed(
  () => featureDependencyState.byId[FFMPEG_DEPENDENCY_ID],
);
const currentSource = computed(() =>
  currentDependency.value?.source === 'system' ? 'system' : 'managed',
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

const isSystemSelectable = computed(() => Boolean(detection.value?.ok));
const isBusy = computed(
  () => isSwitching.value || featureDependencyState.preparingIds.size > 0,
);

async function chooseSystem() {
  if (!isSystemSelectable.value || isBusy.value) return;
  isSwitching.value = true;
  switchError.value = '';
  try {
    await window.Utawakui.setFfmpegSource(true);
  } catch (err) {
    switchError.value = err?.message || '切換系統 FFmpeg 失敗';
  } finally {
    isSwitching.value = false;
  }
}

async function chooseManaged() {
  if (isBusy.value) return;
  isSwitching.value = true;
  switchError.value = '';
  try {
    // setFfmpegSource(false) clears the opt-in path; prepareDependency is a
    // no-op if the managed copy is already on disk (ensureFfmpegDependency
    // checks fs.existsSync before downloading anything).
    await window.Utawakui.setFfmpegSource(false);
    await prepareDependency(FFMPEG_DEPENDENCY_ID);
  } catch (err) {
    switchError.value = err?.message || '切換內建版本失敗';
  } finally {
    isSwitching.value = false;
  }
}
</script>

<template>
  <UiModal :open="open" title="FFmpeg 來源" size="wide" @close="emit('close')">
    <div class="ffmpeg-source-modal">
      <p class="ffmpeg-source-modal__description">
        選擇讓 Utawakui 使用系統已安裝的 FFmpeg,或下載內建管理的版本。
      </p>

      <ul class="ffmpeg-source-modal__list">
        <li>
          <button
            type="button"
            class="ffmpeg-source-modal__row"
            :class="{
              'ffmpeg-source-modal__row--active': currentSource === 'system',
            }"
            :disabled="!isSystemSelectable || isBusy"
            @click="chooseSystem"
          >
            <Settings :size="ICON_SIZE" aria-hidden="true" />
            <span class="ffmpeg-source-modal__label-group">
              <span class="ffmpeg-source-modal__label"
                >使用系統安裝的 FFmpeg</span
              >
              <span class="ffmpeg-source-modal__caption">
                <template v-if="isDetecting">偵測中…</template>
                <template v-else-if="detection?.ok"
                  >{{ detection.path }} · v{{ detection.version }}</template
                >
                <template v-else-if="detection">{{
                  detection.reason
                }}</template>
                <template v-else>尚未偵測</template>
              </span>
            </span>
            <UiStatusIcon
              v-if="currentSource === 'system'"
              :icon="Check"
              tone="accent"
              label="使用中"
            />
            <UiStatusIcon
              v-else-if="isDetecting || isSwitching"
              :icon="Loader2"
              spinning
              label="處理中"
            />
            <UiStatusIcon
              v-else-if="detection && !detection.ok"
              :icon="CircleAlert"
              tone="warning"
              label="無法使用"
            />
          </button>
        </li>

        <li>
          <button
            type="button"
            class="ffmpeg-source-modal__row"
            :class="{
              'ffmpeg-source-modal__row--active': currentSource === 'managed',
            }"
            :disabled="isBusy"
            @click="chooseManaged"
          >
            <Download :size="ICON_SIZE" aria-hidden="true" />
            <span class="ffmpeg-source-modal__label-group">
              <span class="ffmpeg-source-modal__label"
                >下載內建管理版本({{ managedDependency?.name }})</span
              >
              <span class="ffmpeg-source-modal__caption">
                <template v-if="managedProgressLabel">{{
                  managedProgressLabel
                }}</template>
                <template v-else
                  >{{ managedDependency?.license }} ·
                  {{ managedDependency?.displayVersion }}</template
                >
              </span>
            </span>
            <UiStatusIcon
              v-if="currentSource === 'managed'"
              :icon="Check"
              tone="accent"
              label="使用中"
            />
          </button>
        </li>
      </ul>

      <div class="ffmpeg-source-modal__actions">
        <UiButton :icon="RefreshCw" :disabled="isDetecting" @click="redetect">
          重新偵測系統 FFmpeg
        </UiButton>
      </div>

      <UiHint v-if="switchError" tone="danger" role="alert">
        {{ switchError }}
      </UiHint>
    </div>
  </UiModal>
</template>

<style scoped>
.ffmpeg-source-modal {
  display: grid;
  gap: var(--ui-space-3);
}

.ffmpeg-source-modal__description {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.ffmpeg-source-modal__list {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ffmpeg-source-modal__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  min-height: var(--ui-control-height);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ffmpeg-source-modal__row:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
}

.ffmpeg-source-modal__row:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ffmpeg-source-modal__row:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ffmpeg-source-modal__row--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent-soft);
}

.ffmpeg-source-modal__label-group {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.ffmpeg-source-modal__label {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.ffmpeg-source-modal__caption {
  overflow-wrap: anywhere;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.ffmpeg-source-modal__actions {
  display: flex;
  justify-content: flex-end;
}
</style>

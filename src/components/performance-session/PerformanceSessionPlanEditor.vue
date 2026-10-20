<script setup>
import { computed, shallowRef, watch } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  item: { type: Object, default: null },
  tracks: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  validationError: { type: Object, default: null },
});

const emit = defineEmits(['saveDisplay', 'relink', 'close']);

const displayTitle = shallowRef('');
const displayArtist = shallowRef('');
const trackId = shallowRef('');
const trackFilter = shallowRef('');
const editing = shallowRef(false);

watch(
  () => props.item,
  (item) => {
    displayTitle.value = item?.displayTitle ?? '';
    displayArtist.value = item?.displayArtist ?? '';
    trackId.value = item?.trackId ?? '';
    trackFilter.value = '';
    editing.value = false;
  },
  { immediate: true },
);

const needsTrackRecovery = computed(
  () =>
    props.item?.mode === 'placeholder' || props.item?.status === 'unavailable',
);
const showForm = computed(
  () =>
    editing.value || props.item?.mode === 'manual' || needsTrackRecovery.value,
);

const trackOptions = computed(() => {
  const query = trackFilter.value.trim().toLocaleLowerCase();
  const options = props.tracks
    .filter(
      (track) =>
        !query ||
        track.id === trackId.value ||
        [track.title, track.artist, track.id].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(query),
        ),
    )
    .map((track) => ({
      value: track.id,
      label: track.artist ? `${track.title} — ${track.artist}` : track.title,
    }));
  if (
    props.item?.trackId &&
    !props.tracks.some((track) => track.id === props.item.trackId)
  ) {
    options.unshift({
      value: props.item.trackId,
      label: `原連結已不存在（${props.item.trackId}）`,
      disabled: true,
    });
  }
  options.unshift({ value: '', label: '選擇曲庫歌曲' });
  return options;
});

const canSave = computed(
  () =>
    Boolean(displayTitle.value.trim()) &&
    (!needsTrackRecovery.value || Boolean(trackId.value)),
);

function displayFields() {
  return {
    displayTitle: displayTitle.value,
    displayArtist: displayArtist.value,
  };
}

function submit() {
  if (needsTrackRecovery.value) {
    emit('relink', {
      ...displayFields(),
      trackId: trackId.value || null,
    });
    return;
  }
  emit('saveDisplay', displayFields());
}

function startEditing() {
  editing.value = true;
}

function cancelEditing() {
  displayTitle.value = props.item?.displayTitle ?? '';
  displayArtist.value = props.item?.displayArtist ?? '';
  trackId.value = props.item?.trackId ?? '';
  trackFilter.value = '';
  editing.value = false;
}
</script>

<template>
  <PerformanceSessionReviewPane
    class="performance-session-editor"
    title="曲目設定"
    :saving="saving"
    aria-labelledby="performance-session-editor-title"
    body-label="待唱項目設定內容"
    @close="emit('close')"
  >
    <div v-if="item" class="performance-session-editor__body">
      <header class="performance-session-editor__header">
        <p class="performance-session-editor__eyebrow">
          {{ item.mode === 'manual' ? '手動項目' : '待唱曲目' }}
        </p>
        <h2
          id="performance-session-editor-title"
          class="performance-session-editor__title"
          dir="auto"
        >
          {{ item.displayTitle }}
        </h2>
        <p
          v-if="item.displayArtist"
          class="performance-session-editor__artist"
          dir="auto"
        >
          {{ item.displayArtist }}
        </p>
      </header>

      <UiNotice
        v-if="item.status === 'unavailable'"
        tone="danger"
        title="音檔已不存在"
        message="請重新選擇一首曲庫歌曲。"
        compact
      />
      <UiNotice
        v-else-if="item.status === 'needs-link'"
        tone="warning"
        title="需要連結曲庫歌曲"
        message="這是舊版文字項目；選擇音檔後即可演出。"
        compact
      />
      <UiNotice
        v-else-if="item.status === 'source-changed'"
        tone="warning"
        title="曲庫資料已變更"
        message="場次顯示文字仍保留，可視需要調整。"
        compact
      />
      <UiNotice
        v-if="validationError"
        tone="warning"
        title="尚未儲存"
        :message="validationError.message"
        compact
      />

      <div
        v-if="item.linkedTrack && !showForm"
        class="performance-session-editor__source"
      >
        <span class="performance-session-editor__source-label"
          >曲庫資料（唯讀）</span
        >
        <dl class="performance-session-editor__source-details">
          <div class="performance-session-editor__source-row">
            <dt>曲庫曲名</dt>
            <dd dir="auto">{{ item.linkedTrack.title }}</dd>
          </div>
          <div
            v-if="item.linkedTrack.artist"
            class="performance-session-editor__source-row"
          >
            <dt>歌手／藝人</dt>
            <dd dir="auto">{{ item.linkedTrack.artist }}</dd>
          </div>
        </dl>
      </div>

      <form
        v-if="showForm"
        class="performance-session-editor__form"
        @submit.prevent
      >
        <UiTextField
          id="performance-session-display-title"
          v-model="displayTitle"
          label="顯示曲名"
          hint="只用於這份安排，不會修改曲庫曲名。"
          :maxlength="200"
          required
        />
        <UiTextField
          id="performance-session-display-artist"
          v-model="displayArtist"
          label="第二行（選填）"
          hint="可填原唱、演出者或版本資訊；留空則不顯示。"
          :maxlength="200"
        />
        <template v-if="needsTrackRecovery">
          <UiTextField
            id="performance-session-track-filter"
            v-model="trackFilter"
            label="搜尋曲庫"
            placeholder="曲名、演出者或 track id"
          />
          <UiSelect
            id="performance-session-track-link"
            v-model="trackId"
            label="曲庫歌曲"
            :options="trackOptions"
          />
          <UiHint v-if="trackOptions.length === 1 && trackFilter.trim()">
            找不到符合的歌曲。
          </UiHint>
        </template>
      </form>
    </div>

    <UiHint v-else id="performance-session-editor-title" padded center>
      選擇一首曲目查看設定。
    </UiHint>
    <template v-if="item" #actions>
      <template v-if="showForm">
        <UiButton
          v-if="!needsTrackRecovery && item.mode !== 'manual'"
          :disabled="saving"
          @click="cancelEditing"
        >
          取消
        </UiButton>
        <UiButton
          variant="accent"
          :disabled="saving || !canSave"
          @click="submit"
        >
          {{ needsTrackRecovery ? '連結既有歌曲' : '儲存顯示名稱' }}
        </UiButton>
      </template>
      <template v-else>
        <UiButton variant="secondary" :disabled="saving" @click="startEditing">
          調整顯示名稱
        </UiButton>
      </template>
    </template>
  </PerformanceSessionReviewPane>
</template>

<style scoped>
.performance-session-editor__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.performance-session-editor__header {
  min-width: 0;
}

.performance-session-editor__eyebrow,
.performance-session-editor__title,
.performance-session-editor__artist {
  margin: 0;
}

.performance-session-editor__eyebrow {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.performance-session-editor__title {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__artist {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__source {
  display: grid;
  gap: var(--ui-space-1);
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid
    var(--ui-folder-ledger-rule, var(--ui-color-border));
}

.performance-session-editor__source-label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.performance-session-editor__source-details {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}

.performance-session-editor__source-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: baseline;
}

.performance-session-editor__source-row dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.performance-session-editor__source-row dd {
  min-width: 0;
  margin: 0;
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
  overflow-wrap: anywhere;
}

.performance-session-editor__form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>

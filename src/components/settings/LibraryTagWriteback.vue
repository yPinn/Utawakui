<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useLibraryTagWriteback } from '../../composables/useLibraryTagWriteback.js';
import {
  METADATA_LABELS,
  displayMetadata,
} from '../../utils/libraryReconciliation.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  trackId: { type: String, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['busy', 'saved']);
const api = useLibraryTagWriteback(),
  { state } = api;
const expanded = shallowRef(false),
  selected = shallowRef(['title', 'artist']),
  releaseKey = shallowRef('');
const releases = shallowRef([]);
const releaseOptions = computed(() => [
  { value: '', label: '只同步曲目資訊' },
  ...releases.value.map((r, i) => ({
    value: String(i),
    label: `${r.name} · 第 ${r.position} 首`,
  })),
]);
const fields = computed(() => Object.keys(state.options?.values ?? {}));
const disabled = computed(() => props.disabled || state.busy);
watch(
  () => state.busy,
  (value) => emit('busy', value),
  { flush: 'sync' },
);
watch(
  () => props.trackId,
  () => {
    api.reset();
    expanded.value = false;
    releaseKey.value = '';
    releases.value = [];
    selected.value = ['title', 'artist'];
  },
);
async function open(event) {
  expanded.value = event.target.open;
  if (expanded.value && !state.options && !state.busy) {
    await api.load(props.trackId);
    releases.value = state.options?.releases ?? [];
    selected.value = selected.value.filter((f) => fields.value.includes(f));
  }
}
async function choose(value) {
  releaseKey.value = value;
  await api.load(
    props.trackId,
    value === '' ? null : releases.value[Number(value)],
  );
  selected.value = selected.value.filter((f) => fields.value.includes(f));
}
function toggle(field, value) {
  selected.value = value
    ? [...selected.value, field]
    : selected.value.filter((f) => f !== field);
  api.back();
}
async function commit() {
  if (await api.commit()) emit('saved', state.message);
}
async function restore(receiptId) {
  if (await api.restore(receiptId)) emit('saved', state.message);
}
</script>

<template>
  <details class="library-tags" :open="expanded" @toggle="open">
    <summary>同步音檔資訊</summary>
    <div v-if="expanded" class="library-tags__body">
      <UiHint
        >先儲存曲庫校對。支援 FLAC
        文字標籤，封面不變；其他格式暫不支援。</UiHint
      >
      <UiHint v-if="state.error" tone="danger" role="alert">{{
        state.error
      }}</UiHint>
      <UiHint v-if="state.message" role="status">{{ state.message }}</UiHint>
      <UiHint v-if="state.phase" role="status">{{
        state.phase === 'waiting'
          ? '已排入回寫，等待播放、預覽或處理結束。'
          : state.phase === 'committing'
            ? '正在完成音檔與曲庫寫入…'
            : '正在準備音檔與備份…'
      }}</UiHint>
      <UiButton
        v-if="state.busy && state.phase"
        :disabled="state.cancelling || state.phase === 'committing'"
        @click="api.cancel"
        >{{ state.cancelling ? '停止中' : '取消回寫' }}</UiButton
      >
      <UiButton
        v-if="state.needsRecovery"
        :disabled="disabled"
        @click="api.recover"
        >恢復音檔寫入</UiButton
      >
      <UiHint v-if="state.options && !state.options.supported"
        >此格式僅能儲存曲庫資訊，不會寫入音檔。</UiHint
      >
      <template v-if="state.options?.supported">
        <template v-if="!state.preview">
          <UiSelect
            id="tags-primary-release"
            label="主要發行"
            :model-value="releaseKey"
            :options="releaseOptions"
            :disabled="disabled"
            @update:model-value="choose"
          />
          <UiHint>專輯、曲號需選擇發行；曲號依已確認位置，碟號不推測。</UiHint>
          <div class="library-tags__fields">
            <div
              v-for="field in fields"
              :key="field"
              class="library-tags__field"
            >
              <UiCheckbox
                :id="`tags-field-${field}`"
                :label="METADATA_LABELS[field]"
                :model-value="selected.includes(field)"
                :disabled="disabled"
                @update:model-value="toggle(field, $event)"
              />
              <span>{{ displayMetadata(state.options.values[field]) }}</span>
            </div>
          </div>
          <UiButton
            :disabled="disabled || !selected.length"
            aria-label="預覽音檔變更"
            @click="api.preview(selected)"
            >預覽變更</UiButton
          >
          <ul v-if="state.options.history.length" class="library-tags__history">
            <li v-for="item in state.options.history" :key="item.receiptId">
              <span>{{ new Date(item.createdAt).toLocaleString() }}</span
              ><UiButton
                :disabled="disabled || !item.canRestore"
                @click="restore(item.receiptId)"
                >還原音檔</UiButton
              >
            </li>
          </ul>
        </template>
        <template v-else>
          <dl class="library-tags__fields">
            <div
              v-for="field in state.preview.fields"
              :key="field.field"
              class="library-tags__field"
            >
              <dt>{{ METADATA_LABELS[field.field] }}</dt>
              <dd>
                {{ field.before.length ? field.before.join('、') : '未提供' }} →
                {{ displayMetadata(field.after) }}
              </dd>
            </div>
          </dl>
          <UiHint>僅回寫所選欄位，音訊與其他標籤不變；可能需重新分析。</UiHint>
          <div class="library-tags__actions">
            <UiButton :disabled="disabled" @click="api.back">返回</UiButton
            ><UiButton
              variant="accent"
              :disabled="disabled || state.preview.unchanged"
              :loading="state.busy"
              @click="commit"
              >確認回寫音檔</UiButton
            >
          </div>
        </template>
      </template>
    </div>
  </details>
</template>

<style scoped>
.library-tags {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block-start: var(--ui-space-4);
}
.library-tags__body,
.library-tags__fields {
  display: grid;
  gap: var(--ui-space-3);
}
.library-tags__body {
  padding-block-start: var(--ui-space-3);
}
.library-tags__fields {
  margin: 0;
}
.library-tags__field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  overflow-wrap: anywhere;
}
.library-tags__field dd {
  margin: 0;
}
.library-tags__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.library-tags__history {
  padding: 0;
  list-style: none;
}
.library-tags__history li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--ui-space-2);
  margin-block: var(--ui-space-2);
}
</style>

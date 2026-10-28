<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import UiModal from '../ui/UiModal.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
const props = defineProps({
  open: Boolean,
  sessionId: { type: String, default: null },
  suggestedName: { type: String, default: '演出歌單' },
});
const emit = defineEmits(['close', 'saved']);
const name = ref(''),
  scope = ref('completed'),
  preview = ref(null),
  error = ref(''),
  loading = ref(false),
  saving = ref(false);
const { refresh } = usePlaylists();
const notifications = useAppNotifications();
let revision = 0;
async function load() {
  const current = ++revision;
  preview.value = null;
  error.value = '';
  if (!props.open || !props.sessionId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await window.Utawakui.previewPerformancePlaylist({
      sessionId: props.sessionId,
      scope: scope.value,
    });
    if (current !== revision) return;
    if (result?.ok !== true) {
      error.value = result?.error?.message || '無法取得歌單預覽。';
      return;
    }
    preview.value = result.plan;
  } catch {
    if (current === revision) error.value = '無法取得歌單預覽，請重試。';
  } finally {
    if (current === revision) loading.value = false;
  }
}
watch(
  () => [props.open, props.sessionId],
  () => {
    name.value = props.suggestedName;
    scope.value = 'completed';
    void load();
  },
  { immediate: true },
);
watch(scope, () => {
  void load();
});
onBeforeUnmount(() => {
  revision++;
});
const canSave = computed(
  () =>
    props.open &&
    !saving.value &&
    !loading.value &&
    preview.value?.sessionId === props.sessionId &&
    preview.value?.scope === scope.value &&
    preview.value?.savedCount > 0 &&
    name.value.trim().length > 0 &&
    name.value.trim().length <= 200,
);
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  try {
    const p = preview.value;
    const result = await window.Utawakui.savePerformancePlaylist({
      sessionId: props.sessionId,
      scope: p.scope,
      token: p.token,
      name: name.value.trim(),
    });
    if (result?.ok !== true) {
      error.value = result?.error?.message || '歌單尚未保存。';
      preview.value = null;
      return;
    }
    const playlistId = result.plan?.playlistId;
    if (typeof playlistId !== 'string' || !playlistId)
      throw new Error('invalid saved playlist response');
    // The write already succeeded. A refresh failure must not turn a retry
    // into another create or report that the saved playlist was lost.
    await refresh().catch(() => {});
    notifications.notify({
      key: NOTIFICATION_KEYS.PERFORMANCE_PLAYLIST_EXPORT,
      title: '演出歌單已保存',
      message: '可在曲庫的播放清單中查看。',
    });
    emit('saved', playlistId);
    emit('close');
  } catch {
    error.value = '歌單尚未保存，請重試；重試不會重複建立同一份歌單。';
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <UiModal
    :open="open"
    title="另存演出歌單"
    :close-disabled="saving"
    @close="!saving && emit('close')"
  >
    <div class="session-playlist-export">
      <UiTextField
        id="session-playlist-name"
        v-model="name"
        label="歌單名稱"
        :maxlength="200"
        :disabled="saving"
      />
      <UiSelect
        id="session-playlist-scope"
        v-model="scope"
        label="保存範圍"
        :options="[
          { value: 'completed', label: '完成曲目' },
          { value: 'all', label: '完整安排' },
        ]"
        :disabled="saving"
      />
      <UiHint v-if="loading">正在檢查曲目、重唱與排除項目…</UiHint>
      <template v-if="preview">
        <UiHint
          >共 {{ preview.total }} 項，將保存
          {{ preview.savedCount }} 首本機曲目。</UiHint
        >
        <UiNotice
          compact
          :tone="
            preview.mergedCount + preview.manualCount + preview.unavailableCount
              ? 'warning'
              : 'info'
          "
          title="保存前確認"
          :message="`同曲重唱將合併 ${preview.mergedCount} 項；排除手動項目 ${preview.manualCount} 項、未連結或失連項目 ${preview.unavailableCount} 項。原始演出紀錄不會修改。`"
        />
        <UiHint v-if="!preview.savedCount" tone="warning"
          >沒有可保存的本機曲目，請改選範圍或檢查曲目連結。</UiHint
        >
      </template>
      <UiNotice v-if="error" compact tone="warning" :message="error" />
    </div>
    <template #footer>
      <UiButton :disabled="saving" @click="emit('close')">取消</UiButton>
      <UiButton v-if="!preview" :disabled="saving || loading" @click="load"
        >重新預覽</UiButton
      >
      <UiButton
        variant="accent"
        :disabled="!canSave"
        :loading="saving"
        @click="save"
        >另存歌單</UiButton
      >
    </template>
  </UiModal>
</template>
<style scoped>
.session-playlist-export {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-3);
}
</style>

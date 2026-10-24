<script setup>
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

defineProps({
  allowBrowserCookies: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  reading: { type: Boolean, default: false },
  loaded: { type: Boolean, default: true },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});
const emit = defineEmits(['setAllowBrowserCookies', 'refreshPreference']);
</script>

<template>
  <SettingsDocumentItem
    title="瀏覽器登入資料"
    guidance="部分影片需要登入才能下載。開啟後，下載失敗時會讀取本機 Chrome、Edge 或 Firefox 的登入資料，以你的 YouTube 帳號重試。"
    variant="nested"
  >
    <template #actions>
      <UiCheckbox
        id="youtube-browser-cookies"
        label="允許使用"
        aria-label="下載失敗時使用瀏覽器的 YouTube 登入資料重試"
        :model-value="loaded && allowBrowserCookies"
        :disabled="busy || reading || !loaded"
        :error="error"
        @update:model-value="emit('setAllowBrowserCookies', $event)"
      />
    </template>
    <template v-if="readError || !loaded" #feedback>
      <UiHint :tone="readError ? 'danger' : 'muted'" role="status">{{
        readError || '讀取中；尚未確認已儲存設定。'
      }}</UiHint>
      <UiButton
        v-if="readError"
        variant="ghost"
        :loading="reading"
        @click="emit('refreshPreference')"
        >重新讀取</UiButton
      >
    </template>
  </SettingsDocumentItem>
</template>

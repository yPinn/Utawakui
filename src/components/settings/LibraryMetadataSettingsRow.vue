<script setup>
import { RefreshCw } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
</script>

<template>
  <SettingsDocumentItem
    :icon="RefreshCw"
    title="曲目資訊自動整理"
    value="啟動時整理名稱、歌手、專輯與年份"
    status="自動"
    status-tone="success"
    guidance="只用已保存的來源資料；不連線，也不覆蓋無法確認的手動編輯。"
  />
</template>

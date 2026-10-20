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
    guidance="僅使用已儲存的資訊，不連線；無法確認的內容保留你的編輯。"
  />
</template>

<script setup>
import { RefreshCw } from '../../icons/index.js';
import SettingsActionRow from './SettingsActionRow.vue';
</script>

<template>
  <SettingsActionRow
    :icon="RefreshCw"
    title="曲目資訊自動整理"
    value="啟動曲庫時整理名稱、歌手、專輯與年份"
    status="自動"
    status-tone="success"
    tooltip="從已保存的來源資訊自動整理，不會連線，也不會覆蓋無法確認的手動編輯。"
  />
</template>

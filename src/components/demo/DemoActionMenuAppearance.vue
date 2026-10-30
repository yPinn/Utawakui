<script setup>
import DemoActionMenuLayer from './DemoActionMenuLayer.vue';
import '../../styles/demoSpecimens.css';

const SPECIMEN = Object.freeze({ key: 'candidate' });
</script>

<template>
  <div class="demo-specimens" data-action-menu-source="production">
    <p class="demo-specimens__copy">
      正式 UiActionMenu：短動作選單，支援鍵盤導覽、子選單與視窗邊界避讓。
    </p>
    <DemoActionMenuLayer :layer="SPECIMEN" />
  </div>
</template>

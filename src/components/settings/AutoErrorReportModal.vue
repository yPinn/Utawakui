<script setup>
import { onMounted } from 'vue';
import { useAutoErrorReport } from '../../composables/useAutoErrorReport.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiModal from '../ui/UiModal.vue';

const { state, initialize, respond } = useAutoErrorReport();

onMounted(initialize);
</script>

<template>
  <UiModal
    :open="Boolean(state.prompt)"
    title="發生嚴重錯誤"
    size="notice"
    @close="respond('dismiss')"
  >
    <template #header-actions>
      <UiButton variant="ghost" :disabled="state.busy" @click="respond('never')"
        >不要</UiButton
      >
      <UiButton :disabled="state.busy" @click="respond('once')"
        >傳送這次</UiButton
      >
      <UiButton
        variant="accent"
        :loading="state.busy"
        @click="respond('always')"
        >之後自動傳送</UiButton
      >
    </template>
    <div v-if="state.prompt" class="auto-error-report">
      <p class="auto-error-report__lead">
        {{ state.prompt.title
        }}<template v-if="state.prompt.occurrences > 1"
          >（{{ state.prompt.occurrences }} 次）</template
        >。要傳送簡易報告給開發者嗎？
      </p>
      <p class="auto-error-report__scope">
        報告只包含錯誤類型、程式位置與 App
        版本，不含曲庫、歌詞、檔案路徑或你輸入的內容。之後可在「設定」更改。
      </p>
      <UiDisclosure v-if="state.prompt.message" label="查看內容">
        <p class="auto-error-report__message">{{ state.prompt.message }}</p>
      </UiDisclosure>
    </div>
  </UiModal>
</template>

<style scoped>
.auto-error-report {
  display: grid;
  gap: var(--ui-space-3);
}

.auto-error-report__lead,
.auto-error-report__scope,
.auto-error-report__message {
  margin: 0;
}

.auto-error-report__scope {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.auto-error-report__message {
  font-size: var(--ui-font-size-sm);
  overflow-wrap: anywhere;
}
</style>

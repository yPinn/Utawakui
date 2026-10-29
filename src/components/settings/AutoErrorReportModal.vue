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
    <div v-if="state.prompt" class="auto-error-report">
      <p class="auto-error-report__lead">
        {{ state.prompt.title
        }}<template v-if="state.prompt.occurrences > 1"
          >（{{ state.prompt.occurrences }} 次）</template
        >。要回報給開發者嗎？
      </p>
      <p class="auto-error-report__scope">
        只含錯誤類型、位置與版本，不含曲庫、歌詞或檔案。可在「設定」更改。
      </p>
      <UiDisclosure v-if="state.prompt.message" label="查看內容">
        <p class="auto-error-report__message">{{ state.prompt.message }}</p>
      </UiDisclosure>
    </div>
    <template #footer>
      <UiButton variant="ghost" :disabled="state.busy" @click="respond('never')"
        >不要</UiButton
      >
      <UiButton :disabled="state.busy" @click="respond('once')">傳送</UiButton>
      <UiButton
        variant="accent"
        :loading="state.busy"
        @click="respond('always')"
        >自動傳送</UiButton
      >
    </template>
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
  font-size: var(--ui-type-caption-size);
}

.auto-error-report__message {
  font-size: var(--ui-type-caption-size);
  overflow-wrap: anywhere;
}
</style>

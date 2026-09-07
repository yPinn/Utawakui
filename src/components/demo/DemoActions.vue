<script setup>
import { Download, Pause, Play, Repeat, Shuffle } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

defineProps({
  sections: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="demo-actions">
    <DemoCatalogueSection
      v-for="section in sections"
      :id="`demo-${section.key}`"
      :key="section.key"
      :title="section.title"
      :component-label="section.components?.join(' · ')"
    >
      <div v-if="section.key === 'buttons'" class="demo-sample-stack">
        <div class="demo-sample-row">
          <UiButton variant="accent">主要動作</UiButton>
          <UiButton variant="ghost">次要動作</UiButton>
          <UiButton :icon="Download">含圖示</UiButton>
          <UiButton :icon="Repeat" active>已啟用</UiButton>
        </div>
        <div class="demo-sample-row">
          <UiButton variant="accent" loading loading-label="正在保存">
            保存
          </UiButton>
          <UiButton variant="ghost" loading loading-label="正在載入">
            載入
          </UiButton>
          <UiButton variant="accent" disabled>主要停用</UiButton>
          <UiButton variant="ghost" disabled>次要停用</UiButton>
        </div>
      </div>

      <div v-else-if="section.key === 'icon-buttons'" class="demo-sample-stack">
        <div class="demo-sample-row">
          <UiIconButton :icon="Play" label="播放，預設尺寸" />
          <UiIconButton :icon="Play" label="播放，Live 尺寸" size="lg" />
          <UiIconButton :icon="Pause" label="暫停，主要樣式" variant="accent" />
          <UiIconButton :icon="Repeat" label="重複播放，已啟用" active />
          <UiIconButton :icon="Download" label="下載，停用" disabled />
        </div>
        <div class="demo-overlay-context">
          <span class="demo-overlay-context__label">Artwork overlay</span>
          <UiIconButton
            :icon="Play"
            label="在封面上播放"
            shape="circle"
            variant="overlay"
            fill
          />
          <UiIconButton
            :icon="Shuffle"
            label="在封面上隨機播放"
            shape="circle"
            variant="overlay"
          />
        </div>
      </div>

      <div v-else-if="section.key === 'text-button'" class="demo-sample-stack">
        <div class="demo-sample-row">
          <UiTextButton text="前往來源專輯" aria-label="前往來源專輯" />
          <UiTextButton
            text="很長的可點擊曲目名稱 — 長いタイトルと 한국어 제목"
            aria-label="開啟長曲目名稱"
          />
        </div>
        <p class="demo-sample-caption">
          適用於文字本身就是操作目標的情境，不取代一般按鈕。
        </p>
      </div>
    </DemoCatalogueSection>
  </div>
</template>

<style scoped>
.demo-overlay-context {
  min-height: 5rem;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-palette-neutral-950);
}

.demo-overlay-context__label {
  margin-inline-end: auto;
  color: var(--ui-palette-warm-neutral-100);
  font-size: var(--ui-font-size-sm);
}
</style>

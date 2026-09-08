<script setup>
import {
  Download,
  Ellipsis,
  Moon,
  PanelRightOpen,
  Pause,
  Play,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
} from '../../icons/index.js';
import UiTextField from '../ui/UiTextField.vue';

defineProps({
  layer: { type: Object, required: true },
});
</script>

<template>
  <section
    class="demo-icon-button-contract-group demo-icon-button-contract-group--recipes"
    data-icon-button-group="recipes"
  >
    <header class="demo-icon-button-group-header">
      <h5>Parent-owned recipes</h5>
      <p>Recipe 是 parent-owned 組合，不是 UiIconButton variant／prop。</p>
    </header>

    <div class="demo-icon-button-context-grid">
      <article data-icon-button-recipe="routine-control-row">
        <header>
          <span>{{ layer.fieldNote }}</span>
          <code>md + square + ghost</code>
        </header>
        <div
          class="demo-icon-button-field-stack"
          :class="`demo-icon-button-field-stack--${layer.key}`"
        >
          <div
            v-for="density in layer.key === 'candidate'
              ? ['standard', 'compact']
              : ['current']"
            :key="density"
            class="demo-icon-button-field-row"
            :class="`demo-icon-button-field-row--${density}`"
          >
            <UiTextField
              :id="`demo-icon-field-${layer.key}-${density}`"
              label="輸出裝置"
              label-hidden
              model-value="WASAPI Main"
            />
            <component
              :is="layer.actionComponent"
              :variant="layer.actionVariant"
              :icon="Download"
            >
              套用
            </component>
            <component
              :is="layer.component"
              :icon="Ellipsis"
              :label="`${density} 更多輸出設定`"
            />
          </div>
        </div>
      </article>

      <article data-icon-button-recipe="primary-transport">
        <header>
          <span>Primary transport · 44px fixed</span>
          <code>lg + circle + accent + filled glyph</code>
        </header>
        <div class="demo-icon-button-transport">
          <component :is="layer.component" :icon="SkipBack" label="上一首" />
          <component
            :is="layer.component"
            :icon="Pause"
            label="暫停"
            shape="circle"
            size="lg"
            variant="accent"
            fill
          />
          <component :is="layer.component" :icon="SkipForward" label="下一首" />
        </div>
      </article>

      <article data-icon-button-recipe="artwork-overlay">
        <header>
          <span>Artwork overlay · theme-independent scrim</span>
          <code>md + circle + overlay</code>
        </header>
        <div class="demo-icon-button-artwork">
          <component
            :is="layer.component"
            :icon="Play"
            label="在封面上播放"
            shape="circle"
            variant="overlay"
            fill
          />
          <component
            :is="layer.component"
            :icon="Shuffle"
            label="在封面上隨機播放"
            shape="circle"
            variant="overlay"
          />
        </div>
      </article>

      <article data-icon-button-recipe="stretch-rail">
        <header>
          <span>Stretch rail · parent owns geometry</span>
          <code>inherit + stretch + caller ARIA</code>
        </header>
        <div class="demo-icon-button-rail">
          <component
            :is="layer.component"
            :icon="PanelRightOpen"
            label="展開集合資料"
            shape="inherit"
            stretch
            aria-expanded="false"
            aria-controls="demo-icon-inspector"
          />
        </div>
      </article>

      <article data-icon-button-recipe="titlebar">
        <header>
          <span>Title bar · 40px parent＋inset focus</span>
          <code>md + square + overlay + parent inset focus</code>
        </header>
        <div
          class="demo-icon-button-titlebar"
          :class="`demo-icon-button-titlebar--${layer.key}`"
        >
          <i>Utawakui</i>
          <component
            :is="layer.component"
            :icon="Settings"
            label="開啟設定"
            variant="overlay"
          />
          <component
            :is="layer.component"
            :icon="Moon"
            label="切換為深色主題"
            variant="overlay"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.demo-icon-button-contract-group {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-icon-button-group-header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-icon-button-group-header h5,
.demo-icon-button-group-header p {
  margin: 0;
}

.demo-icon-button-group-header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-icon-button-group-header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-icon-button-context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.demo-icon-button-context-grid article {
  min-width: 0;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  overflow: hidden;
}

.demo-icon-button-context-grid article:first-child,
.demo-icon-button-context-grid article:last-child {
  grid-column: 1 / -1;
}

.demo-icon-button-context-grid article > header {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.demo-icon-button-context-grid article > header > span {
  min-width: 0;
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-icon-button-context-grid article > header > code {
  min-width: 0;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-xs);
  line-height: var(--ui-line-height-caption);
  text-align: end;
}

.demo-icon-button-field-stack {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.demo-icon-button-field-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: var(--ui-space-2);
}

.demo-icon-button-field-row--standard {
  --demo-icon-button-size: 2.25rem;
  --demo-button-height: 2.25rem;
  --ui-control-height: 2.25rem;
  --ui-field-height: 2.25rem;
}

.demo-icon-button-field-row--compact {
  --demo-icon-button-size: 2rem;
  --demo-button-height: 2rem;
  --ui-control-height: 2rem;
  --ui-field-height: 2rem;
}

.demo-icon-button-field-row--current {
  --ui-control-height: 1.875rem;
  --ui-field-height: 1.875rem;
}

.demo-icon-button-transport {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}

.demo-icon-button-artwork {
  width: 100%;
  min-height: 7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background:
    linear-gradient(145deg, rgb(31 35 40 / 18%), rgb(31 35 40 / 72%)),
    linear-gradient(
      35deg,
      var(--ui-color-folder-primary),
      var(--ui-color-paper)
    );
}

.demo-icon-button-rail {
  width: 3rem;
  height: 7rem;
  display: flex;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  overflow: hidden;
}

.demo-icon-button-titlebar {
  width: 100%;
  height: var(--ui-titlebar-height);
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-inline: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  overflow: hidden;
}

.demo-icon-button-titlebar i {
  min-width: 0;
  margin-inline-end: auto;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-icon-button-titlebar--candidate {
  --demo-icon-button-size: 2.25rem;
  --demo-icon-focus-offset: var(--ui-focus-offset-inset);
}

.demo-icon-button-titlebar :deep(button:last-child) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--demo-icon-focus-offset, var(--ui-focus-offset));
}

@container (max-width: 48rem) {
  .demo-icon-button-group-header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}

@container (max-width: 42rem) {
  .demo-icon-button-context-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-icon-button-context-grid article,
  .demo-icon-button-context-grid article:first-child,
  .demo-icon-button-context-grid article:last-child {
    grid-column: auto;
  }

  .demo-icon-button-field-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .demo-icon-button-field-row :deep(.ui-btn),
  .demo-icon-button-field-row :deep(.demo-candidate-btn) {
    grid-column: 1 / -1;
    width: 100%;
  }
}

@container (max-width: 26rem) {
  .demo-icon-button-context-grid article > header {
    display: grid;
  }

  .demo-icon-button-context-grid article > header > code {
    text-align: start;
  }

  .demo-icon-button-field-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-icon-button-field-row :deep(.ui-icon-btn),
  .demo-icon-button-field-row :deep(.demo-candidate-icon-btn) {
    justify-self: end;
  }
}
</style>

<script setup>
defineProps({
  layer: { type: Object, required: true },
});
</script>

<template>
  <section
    class="demo-text-button-contract-group demo-text-button-contract-group--recipes"
    data-text-button-group="recipes"
  >
    <header class="demo-text-button-group-header">
      <h5>Parent-owned recipes</h5>
      <p>只示範使用情境，不增加 primitive API。</p>
    </header>

    <div class="demo-text-button-recipe-list">
      <article data-text-button-recipe="track-row-destination">
        <header>
          <span>Row primary action＋nested destination</span>
          <code>sibling buttons · title z-index 1</code>
        </header>
        <div class="demo-text-button-track-row">
          <button type="button" aria-label="播放群青日和"></button>
          <span class="demo-text-button-track-row__thumb" aria-hidden="true"
            >群</span
          >
          <span class="demo-text-button-track-row__copy">
            <component
              :is="layer.component"
              v-bind="layer.recipeProps"
              class="demo-text-button-track-row__title"
              text="群青日和"
              aria-label="前往專輯：群青日和"
            />
            <span>東京事変</span>
          </span>
          <span class="demo-text-button-track-row__duration">3:33</span>
        </div>
      </article>

      <article data-text-button-recipe="section-heading-destination">
        <header>
          <span>Prefix static／destination interactive</span>
          <code>prefix fixed · destination min-width 0</code>
        </header>
        <div class="demo-text-button-section-heading">
          <span>下一首來自：</span>
          <span>
            <component
              :is="layer.component"
              v-bind="layer.recipeProps"
              text="海螺記 — 很長的來源集合名稱"
              aria-label="前往專輯：海螺記"
            />
          </span>
        </div>
      </article>

      <article data-text-button-recipe="table-cell-destination">
        <header>
          <span>Cell owns available width／metadata columns</span>
          <code>title minmax(0, 1fr) · metadata fixed</code>
        </header>
        <div class="demo-text-button-table-row">
          <span>12</span>
          <span class="demo-text-button-table-row__title">
            <component
              :is="layer.component"
              v-bind="layer.recipeProps"
              text="東京事変／椎名林檎／非常に長い曲目名稱"
              aria-label="前往專輯：東京事変／椎名林檎"
            />
          </span>
          <span class="demo-text-button-table-row__date">2026/09/08</span>
          <span>4:22</span>
        </div>
      </article>
    </div>

    <p class="demo-text-button-recipe-note">幾何與導覽由 parent 擁有。</p>
  </section>
</template>

<style scoped>
.demo-text-button-contract-group {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-text-button-group-header {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.42fr) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-4);
}

.demo-text-button-group-header h5,
.demo-text-button-group-header p,
.demo-text-button-recipe-note {
  margin: 0;
}

.demo-text-button-group-header h5 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-text-button-group-header p,
.demo-text-button-recipe-note {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-recipe-list {
  min-width: 0;
  display: grid;
}

.demo-text-button-recipe-list article {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-text-button-recipe-list article > header {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.demo-text-button-recipe-list article > header > span {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-recipe-list article > header > code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-xs);
  line-height: var(--ui-line-height-caption);
  text-align: end;
}

.demo-text-button-track-row {
  position: relative;
  min-width: 0;
  min-height: var(--ui-track-row-min-height);
  display: grid;
  grid-template-columns: var(--ui-track-row-thumb-size) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-text-button-track-row > button {
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.demo-text-button-track-row > button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-text-button-track-row__thumb {
  width: var(--ui-track-row-thumb-size);
  aspect-ratio: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text-muted);
}

.demo-text-button-track-row__copy {
  min-width: 0;
  display: grid;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-text-button-track-row__title {
  position: relative;
  z-index: 1;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-text-button-track-row__duration,
.demo-text-button-table-row > span:last-child {
  font-variant-numeric: tabular-nums;
}

.demo-text-button-section-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-section-heading > span:first-child {
  flex-shrink: 0;
  white-space: nowrap;
}

.demo-text-button-section-heading > span:last-child {
  min-width: 0;
  overflow: hidden;
}

.demo-text-button-table-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 3ch minmax(0, 1fr) minmax(7rem, auto) 4rem;
  align-items: center;
  gap: var(--ui-track-row-gap);
  padding: var(--ui-space-2) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-text-button-table-row__title {
  min-width: 0;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-text-button-table-row > span:last-child {
  text-align: end;
}

@container (max-width: 48rem) {
  .demo-text-button-group-header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-1);
  }
}

@container (max-width: 34rem) {
  .demo-text-button-recipe-list article > header {
    display: grid;
  }

  .demo-text-button-recipe-list article > header > code {
    text-align: start;
  }

  .demo-text-button-table-row {
    grid-template-columns: 3ch minmax(0, 1fr) 4rem;
  }

  .demo-text-button-table-row__date {
    display: none;
  }
}
</style>

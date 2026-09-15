<script setup>
const SPACING_STEPS = [
  { value: '0.25rem', dip: 4, token: '--ui-space-1' },
  { value: '0.5rem', dip: 8, token: '--ui-space-2' },
  { value: '0.75rem', dip: 12, token: '--ui-space-3' },
  { value: '1rem', dip: 16, token: '--ui-space-4' },
  { value: '1.5rem', dip: 24, token: '--ui-space-5' },
  { value: '2rem', dip: 32, token: '--ui-space-6' },
];

const RADIUS_STEPS = [
  { value: '0.125rem', dip: 2, token: '--ui-radius-xs' },
  { value: '0.25rem', dip: 4, token: '--ui-radius-sm' },
  { value: '0.375rem', dip: 6, token: '--ui-radius-md' },
  { value: '0.5rem', dip: 8, token: '--ui-radius-lg' },
];

const UNIT_RESPONSIBILITIES = [
  {
    unit: 'rem',
    title: '可縮放 UI 幾何',
    usage: '字體、間距、圓角、元件尺寸與 CSS breakpoint。',
  },
  {
    unit: 'px',
    title: '精準光學邊界',
    usage: '1px 邊框，以及 2px focus／drag／state indicator。',
  },
  {
    unit: 'DIP',
    title: 'Electron 視窗幾何',
    usage: 'BrowserWindow 尺寸與座標；不加 CSS 單位。',
  },
  {
    unit: 'physical px',
    title: 'Raster／canvas backing',
    usage: '圖片來源尺寸與 backing buffer；不作 CSS layout。',
  },
];
</script>

<template>
  <div class="demo-spacing-shape">
    <p class="demo-review-note">
      <strong>尺寸以 rem 為契約。</strong>
      DIP 只表示預設 16px 根字級下的視覺等值；它不是 CSS token
      的單位，也不代表實體顯示像素。
    </p>
    <div class="demo-unit-responsibilities" aria-label="UI 單位責任">
      <article
        v-for="responsibility in UNIT_RESPONSIBILITIES"
        :key="responsibility.unit"
        class="demo-unit-responsibility"
      >
        <code>{{ responsibility.unit }}</code>
        <strong>{{ responsibility.title }}</strong>
        <span>{{ responsibility.usage }}</span>
      </article>
    </div>
    <div class="demo-foundation-pair">
      <section class="demo-scale-group" aria-labelledby="demo-spacing-title">
        <h4 id="demo-spacing-title" class="demo-scale-group__title">Spacing</h4>
        <div
          class="demo-scale-preview demo-scale-preview--spacing"
          data-demo-preview="spacing"
          aria-label="Spacing 視覺尺度"
        >
          <span
            v-for="step in SPACING_STEPS"
            :key="step.token"
            class="demo-spacing-specimen"
            :style="{ width: `var(${step.token})` }"
            :aria-label="`${step.value} spacing`"
          />
        </div>
        <div class="demo-scale-reference-wrap" data-demo-reference="spacing">
          <table class="demo-scale-reference">
            <caption>
              Spacing token 參考值
            </caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">rem</th>
                <th scope="col">DIP 等值</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="step in SPACING_STEPS"
                :key="step.token"
                :data-scale-token="step.token"
              >
                <th scope="row">
                  <code>{{ step.token }}</code>
                </th>
                <td>
                  <code>{{ step.value }}</code>
                </td>
                <td>{{ step.dip }} DIP</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="demo-scale-group" aria-labelledby="demo-radius-title">
        <h4 id="demo-radius-title" class="demo-scale-group__title">Radius</h4>
        <div
          class="demo-scale-preview demo-scale-preview--radius"
          data-demo-preview="radius"
          aria-label="Radius 視覺尺度"
        >
          <span
            v-for="radius in RADIUS_STEPS"
            :key="radius.token"
            class="demo-radius-specimen"
            :style="{ borderRadius: `var(${radius.token})` }"
            :aria-label="`${radius.value} radius`"
          />
        </div>
        <div class="demo-scale-reference-wrap" data-demo-reference="radius">
          <table class="demo-scale-reference">
            <caption>
              Radius token 參考值
            </caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">rem</th>
                <th scope="col">DIP 等值</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="radius in RADIUS_STEPS"
                :key="radius.token"
                :data-scale-token="radius.token"
              >
                <th scope="row">
                  <code>{{ radius.token }}</code>
                </th>
                <td>
                  <code>{{ radius.value }}</code>
                </td>
                <td>{{ radius.dip }} DIP</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.demo-spacing-shape {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-review-note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-review-note strong {
  color: var(--ui-color-text);
}

.demo-foundation-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-6);
}

.demo-unit-responsibilities {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--ui-space-3);
}

.demo-unit-responsibility {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-unit-responsibility code {
  width: fit-content;
  color: var(--ui-color-accent);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-unit-responsibility strong {
  color: var(--ui-color-text);
}

.demo-scale-group {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.demo-scale-group__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-scale-preview {
  display: grid;
  min-height: 12rem;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-scale-preview--spacing {
  grid-template-rows: repeat(6, minmax(var(--ui-space-3), 1fr));
  align-items: center;
}

.demo-scale-preview--radius {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.demo-spacing-specimen {
  display: block;
  height: var(--ui-space-2);
  min-width: var(--ui-border-width);
  background: var(--ui-color-accent);
}

.demo-radius-specimen {
  min-height: 4rem;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  background: var(--ui-color-surface-raised);
}

.demo-scale-reference-wrap {
  min-width: 0;
  overflow-x: auto;
}

.demo-scale-reference {
  width: 100%;
  min-width: 20rem;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.demo-scale-reference caption {
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  text-align: left;
}

.demo-scale-reference th,
.demo-scale-reference td {
  padding: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  text-align: left;
  vertical-align: top;
}

.demo-scale-reference th:first-child {
  width: 52%;
}

.demo-scale-reference code {
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-regular);
  overflow-wrap: anywhere;
}

@media (max-width: 42rem) {
  .demo-foundation-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

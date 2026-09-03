<script setup>
const DENSITY_MODES = [
  { key: 'standard', label: 'Standard', context: '目前預設 · 1440 × 810 DIP' },
  { key: 'compact', label: 'Compact', context: '窄幅候選 · 960 × 650 DIP' },
];

const DENSITY_CONTRACTS = [
  {
    key: 'control',
    label: '一般控制高度',
    token: '--ui-control-height',
    kind: 'height',
    standard: '2.25rem',
    standardDip: 36,
    compact: '2rem',
    compactDip: 32,
    rule: '縮減',
  },
  {
    key: 'live',
    label: 'Live 操作下限',
    token: '--ui-control-height-live',
    kind: 'safety',
    standard: '2.75rem',
    standardDip: 44,
    compact: '2.75rem',
    compactDip: 44,
    rule: '固定',
  },
  {
    key: 'emergency',
    label: '緊急操作下限',
    token: '--ui-control-height-emergency',
    kind: 'safety',
    standard: '3rem',
    standardDip: 48,
    compact: '3rem',
    compactDip: 48,
    rule: '固定',
  },
  {
    key: 'track-row',
    label: '曲目列最小高度',
    token: '--ui-track-row-min-height',
    kind: 'height',
    standard: '3.25rem',
    standardDip: 52,
    compact: '2.75rem',
    compactDip: 44,
    rule: '縮減',
  },
  {
    key: 'sidebar-row',
    label: '側欄列最小高度',
    token: '--ui-sidebar-row-min-height',
    kind: 'height',
    standard: '3.25rem',
    standardDip: 52,
    compact: '3rem',
    compactDip: 48,
    rule: '縮減',
  },
  {
    key: 'artwork',
    label: '曲目封面',
    token: '--ui-track-artwork-size',
    kind: 'square',
    standard: '2.5rem',
    standardDip: 40,
    compact: '2.25rem',
    compactDip: 36,
    rule: '縮減',
  },
  {
    key: 'list-header',
    label: '列表標頭',
    token: '--ui-list-header-height',
    kind: 'height',
    standard: '2.25rem',
    standardDip: 36,
    compact: '2rem',
    compactDip: 32,
    rule: '縮減',
  },
  {
    key: 'player-bar',
    label: 'Player bar',
    token: '--ui-player-bar-height',
    kind: 'height',
    standard: '4.75rem',
    standardDip: 76,
    compact: '4.25rem',
    compactDip: 68,
    rule: '縮減',
  },
  {
    key: 'panel-inset',
    label: 'Panel inset',
    token: '--ui-panel-inset',
    kind: 'space',
    standard: '1rem',
    standardDip: 16,
    compact: '0.75rem',
    compactDip: 12,
    rule: '縮減',
  },
  {
    key: 'shell-gutter',
    label: 'Shell gutter',
    token: '--ui-shell-gutter',
    kind: 'space',
    standard: '0.75rem',
    standardDip: 12,
    compact: '0.5rem',
    compactDip: 8,
    rule: '縮減',
  },
];
</script>

<template>
  <div class="demo-density">
    <p class="demo-density__note">
      <strong>Standard 是目前預設工作密度。</strong>
      Compact 是窄幅候選，只離散縮減日常尺寸；Live／緊急操作維持固定安全下限。
      這裡只供比例檢查，尚未核准自動切換條件。
    </p>

    <div class="demo-density__previews">
      <section
        v-for="mode in DENSITY_MODES"
        :key="mode.key"
        class="demo-density-mode"
        :aria-labelledby="`demo-density-${mode.key}-title`"
      >
        <header class="demo-density-mode__header">
          <h4 :id="`demo-density-${mode.key}-title`">{{ mode.label }}</h4>
          <span>{{ mode.context }}</span>
        </header>
        <div
          class="demo-density-preview"
          :data-density-preview="mode.key"
          aria-hidden="true"
        >
          <span
            v-for="contract in DENSITY_CONTRACTS"
            :key="contract.key"
            class="demo-density-specimen"
            :data-kind="contract.kind"
            :style="{ '--demo-density-size': contract[mode.key] }"
          />
        </div>
      </section>
    </div>

    <div class="demo-density-reference-wrap" data-density-reference="matrix">
      <table class="demo-density-reference">
        <caption>
          Density token 候選值
        </caption>
        <thead>
          <tr>
            <th scope="col">項目</th>
            <th scope="col">Token</th>
            <th scope="col">Standard</th>
            <th scope="col">Compact</th>
            <th scope="col">規則</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="contract in DENSITY_CONTRACTS"
            :key="contract.key"
            :data-density-contract="contract.key"
          >
            <th scope="row">{{ contract.label }}</th>
            <td>
              <code>{{ contract.token }}</code>
            </td>
            <td>
              <code>{{ contract.standard }}</code>
              <span>{{ contract.standardDip }} DIP</span>
            </td>
            <td>
              <code>{{ contract.compact }}</code>
              <span>{{ contract.compactDip }} DIP</span>
            </td>
            <td>{{ contract.rule }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.demo-density {
  display: grid;
  gap: var(--ui-space-4);
}

.demo-density__note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-density__note strong {
  color: var(--ui-color-text);
}

.demo-density__previews {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-4);
}

.demo-density-mode {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
}

.demo-density-mode__header {
  display: grid;
  gap: var(--ui-space-1);
}

.demo-density-mode__header h4 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-density-mode__header span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-density-preview {
  min-height: 31rem;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-4);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.demo-density-specimen {
  display: block;
  background: var(--ui-color-surface-raised);
}

.demo-density-specimen[data-kind='height'] {
  width: 100%;
  height: var(--demo-density-size);
  border-left: var(--ui-drag-indicator-width) solid var(--ui-color-accent);
}

.demo-density-specimen[data-kind='safety'] {
  width: 100%;
  height: var(--demo-density-size);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  outline: var(--ui-border-width) solid var(--ui-color-border);
  outline-offset: calc(-1 * var(--ui-focus-width));
}

.demo-density-specimen[data-kind='square'] {
  width: var(--demo-density-size);
  height: var(--demo-density-size);
  border-radius: var(--ui-radius-sm);
}

.demo-density-specimen[data-kind='space'] {
  width: var(--demo-density-size);
  height: var(--ui-space-4);
  background: var(--ui-color-accent);
}

.demo-density-reference-wrap {
  min-width: 0;
  overflow-x: auto;
}

.demo-density-reference {
  width: 100%;
  min-width: 48rem;
  border-collapse: collapse;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.demo-density-reference caption {
  margin-bottom: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  text-align: left;
}

.demo-density-reference th,
.demo-density-reference td {
  padding: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  text-align: left;
  vertical-align: top;
}

.demo-density-reference th:first-child {
  width: 10rem;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-density-reference code,
.demo-density-reference td span {
  display: block;
}

.demo-density-reference code {
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-weight: var(--ui-font-weight-regular);
  overflow-wrap: anywhere;
}

.demo-density-reference td span {
  margin-top: var(--ui-space-1);
}
</style>

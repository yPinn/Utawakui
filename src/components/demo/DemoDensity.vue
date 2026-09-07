<script setup>
const DENSITY_CONTRACTS = [
  {
    key: 'control',
    label: '一般控制高度',
    token: '--ui-control-height',
    standard: '2.25rem',
    standardPx: 36,
    compact: '2rem',
    compactPx: 32,
    rule: '離散縮減',
    shape: 'square',
  },
  {
    key: 'live',
    label: 'Live 操作下限',
    token: '--ui-control-height-live',
    standard: '2.75rem',
    standardPx: 44,
    compact: '2.75rem',
    compactPx: 44,
    rule: '固定',
    shape: 'square',
  },
  {
    key: 'emergency',
    label: '緊急操作下限',
    token: '--ui-control-height-emergency',
    standard: '3rem',
    standardPx: 48,
    compact: '3rem',
    compactPx: 48,
    rule: '固定',
    shape: 'square',
  },
  {
    key: 'track-row',
    label: '曲目列最小高度',
    token: '--ui-track-row-min-height',
    standard: '3.25rem',
    standardPx: 52,
    compact: '2.75rem',
    compactPx: 44,
    rule: '離散縮減',
    shape: 'height',
  },
  {
    key: 'sidebar-row',
    label: '側欄列最小高度',
    token: '--ui-sidebar-row-min-height',
    standard: '3.25rem',
    standardPx: 52,
    compact: '3rem',
    compactPx: 48,
    rule: '離散縮減',
    shape: 'height',
  },
  {
    key: 'artwork',
    label: '曲目封面',
    token: '--ui-track-artwork-size',
    standard: '2.5rem',
    standardPx: 40,
    compact: '2.25rem',
    compactPx: 36,
    rule: '離散縮減',
    shape: 'square',
  },
  {
    key: 'list-header',
    label: '列表標頭',
    token: '--ui-list-header-height',
    standard: '2.25rem',
    standardPx: 36,
    compact: '2rem',
    compactPx: 32,
    rule: '離散縮減',
    shape: 'height',
  },
  {
    key: 'player-bar',
    label: 'Player bar',
    token: '--ui-player-bar-height',
    standard: '4.75rem',
    standardPx: 76,
    compact: '4.25rem',
    compactPx: 68,
    rule: '離散縮減',
    shape: 'height',
  },
  {
    key: 'panel-inset',
    label: 'Panel inset',
    token: '--ui-panel-inset',
    standard: '1rem',
    standardPx: 16,
    compact: '0.75rem',
    compactPx: 12,
    rule: '離散縮減',
    shape: 'space',
  },
  {
    key: 'shell-gutter',
    label: 'Shell gutter',
    token: '--ui-shell-gutter',
    standard: '0.75rem',
    standardPx: 12,
    compact: '0.5rem',
    compactPx: 8,
    rule: '離散縮減',
    shape: 'space',
  },
];

const CURRENT_MAPPINGS = [
  {
    key: 'control',
    label: '一般控制高度',
    sources: [
      'src/styles/tokens.css',
      'src/components/ui/UiButton.vue',
      'src/components/ui/UiIconButton.vue',
    ],
    value:
      '一般控制 1.875rem／30 CSS px；Icon Button 另有 2rem／32 CSS px 下限',
    status: 'Standard 尚未對齊；Icon Button 符合 Compact／hard floor',
    shape: 'square',
    samples: [
      { label: '一般控制', size: '1.875rem', px: 30 },
      { label: 'Icon Button', size: '2rem', px: 32 },
    ],
  },
  {
    key: 'live',
    label: 'Live 操作下限',
    sources: ['src/styles/tokens.css', 'src/components/ui/UiIconButton.vue'],
    value: 'Icon Button lg 2.75rem／44 CSS px',
    status: '部分映射；尚未形成全域 Live 契約',
    shape: 'square',
    samples: [{ label: 'Icon Button lg', size: '2.75rem', px: 44 }],
  },
  {
    key: 'emergency',
    label: '緊急操作下限',
    sources: ['src/styles/tokens.css'],
    value: '尚未映射',
    status: 'active token 與元件 variant 均不存在',
    shape: 'square',
    samples: [],
  },
  {
    key: 'track-row',
    label: '曲目列最小高度',
    sources: ['src/styles/tokens.css', 'src/components/ui/UiTrackRow.vue'],
    value: '3.25rem／52 CSS px',
    status: 'Standard 已吻合；Compact 尚未映射',
    shape: 'height',
    samples: [{ label: '現行', size: '3.25rem', px: 52 }],
  },
  {
    key: 'sidebar-row',
    label: '側欄列最小高度',
    sources: [
      'src/styles/tokens.css',
      'src/components/playlists/PlaylistSidebarRow.vue',
    ],
    value: 'Sidebar 列 54 CSS px',
    status: '與 Standard 52／Compact 48 CSS px 均不同',
    shape: 'height',
    samples: [{ label: '現行', size: '3.375rem', px: 54 }],
  },
  {
    key: 'artwork',
    label: '曲目封面',
    sources: ['src/styles/tokens.css', 'src/components/ui/UiTrackRow.vue'],
    value: '2.5rem／40 CSS px',
    status: 'Standard 已吻合；Compact 尚未映射',
    shape: 'square',
    samples: [{ label: '現行', size: '2.5rem', px: 40 }],
  },
  {
    key: 'list-header',
    label: '列表標頭',
    sources: [
      'src/styles/tokens.css',
      'src/components/playlists/StudioLibraryTrackTable.vue',
    ],
    value: '列表標頭尚無 active token',
    status: 'consumer 已引用候選 token，目前只在 F8 生效',
    shape: 'height',
    samples: [],
  },
  {
    key: 'player-bar',
    label: 'Player bar',
    sources: ['src/styles/tokens.css', 'src/components/playback/PlayerBar.vue'],
    value: '4.75rem／76 CSS px',
    status: 'Standard 已吻合；Compact 尚未映射',
    shape: 'height',
    samples: [{ label: '現行', size: '4.75rem', px: 76 }],
  },
  {
    key: 'panel-inset',
    label: 'Panel inset',
    sources: [
      'src/styles/tokens.css',
      'src/components/playlists/StudioLibraryDossier.vue',
    ],
    value: 'Panel inset 尚無 active token',
    status: 'consumer 已引用候選 token，目前只在 F8 生效',
    shape: 'space',
    samples: [],
  },
  {
    key: 'shell-gutter',
    label: 'Shell gutter',
    sources: [
      'src/styles/tokens.css',
      'src/components/layout/AppArchiveFrame.vue',
    ],
    value: 'Shell gutter 尚無 active token',
    status: 'consumer 已引用候選 token，目前只在 F8 生效',
    shape: 'space',
    samples: [],
  },
];

const CANDIDATE_ROWS = DENSITY_CONTRACTS.map((contract) => ({
  ...contract,
  samples: [
    {
      key: 'standard',
      label: 'Standard',
      size: contract.standard,
      px: contract.standardPx,
    },
    {
      key: 'compact',
      label: 'Compact',
      size: contract.compact,
      px: contract.compactPx,
    },
  ],
}));
</script>

<template>
  <div class="demo-density">
    <p class="demo-density__note">
      <strong>兩段密度只做離散映射，不隨視窗連續縮放。</strong>
      Standard 是預設候選密度；Compact 是離散候選映射。實際切換條件留到 View
      階段依容器與內容下限決定，Live／緊急操作維持固定安全下限。
    </p>

    <section
      class="demo-density__layer"
      data-density-layer="candidate"
      aria-labelledby="demo-density-candidate-title"
    >
      <header class="demo-density__layer-header">
        <h4 id="demo-density-candidate-title">Token v2 密度候選</h4>
        <p>rem 是規格值；CSS px 等值以預設 16px 根字級為前提。</p>
      </header>

      <div
        class="demo-density__visual"
        data-density-reference="candidate"
        data-density-visual="candidate"
      >
        <article
          v-for="contract in CANDIDATE_ROWS"
          :key="contract.key"
          class="demo-density__row"
          :data-density-contract="contract.key"
        >
          <div class="demo-density__identity">
            <h5>{{ contract.label }}</h5>
            <code>{{ contract.token }}</code>
          </div>

          <div
            class="demo-density__stage"
            :data-density-shape="contract.shape"
            aria-hidden="true"
          >
            <span
              v-for="sample in contract.samples"
              :key="sample.key"
              class="demo-density__specimen"
              :data-density-specimen="sample.key"
              :style="{ '--demo-density-size': sample.size }"
            ></span>
          </div>

          <dl class="demo-density__values">
            <div v-for="sample in contract.samples" :key="sample.key">
              <dt>{{ sample.label }}</dt>
              <dd>
                <code>{{ sample.size }}</code>
                <span>{{ sample.px }} CSS px</span>
              </dd>
            </div>
            <div>
              <dt>規則</dt>
              <dd>{{ contract.rule }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>

    <section
      class="demo-density__layer"
      data-density-layer="current"
      aria-labelledby="demo-density-current-title"
    >
      <header class="demo-density__layer-header">
        <h4 id="demo-density-current-title">現有設定檔／元件映射</h4>
        <p>只描述 active token 與目前 consumer，不代表已核准套用候選值。</p>
      </header>

      <div
        class="demo-density__visual"
        data-density-reference="current"
        data-density-visual="current"
      >
        <article
          v-for="mapping in CURRENT_MAPPINGS"
          :key="mapping.key"
          class="demo-density__row"
          :data-current-density-mapping="mapping.key"
          :data-density-unmapped="mapping.samples.length ? undefined : 'true'"
        >
          <div class="demo-density__identity">
            <h5>{{ mapping.label }}</h5>
            <div class="demo-density__sources">
              <code v-for="source in mapping.sources" :key="source">
                {{ source }}
              </code>
            </div>
          </div>

          <div
            class="demo-density__stage"
            :data-density-shape="mapping.shape"
            aria-hidden="true"
          >
            <span
              v-for="sample in mapping.samples"
              :key="sample.label"
              class="demo-density__specimen"
              data-density-specimen="current"
              :style="{ '--demo-density-size': sample.size }"
            ></span>
          </div>

          <dl class="demo-density__current-reference">
            <div v-for="sample in mapping.samples" :key="sample.label">
              <dt>{{ sample.label }}</dt>
              <dd>
                <code>{{ sample.size }}</code>
                <span>{{ sample.px }} CSS px</span>
              </dd>
            </div>
            <div v-if="!mapping.samples.length">
              <dt>現行尺寸</dt>
              <dd>尚未映射</dd>
            </div>
            <div>
              <dt>設定值</dt>
              <dd>{{ mapping.value }}</dd>
            </div>
            <div>
              <dt>映射狀態</dt>
              <dd>{{ mapping.status }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-density {
  display: grid;
  gap: var(--ui-space-5);
  container-type: inline-size;
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

.demo-density__layer {
  min-width: 0;
}

.demo-density__layer-header {
  display: grid;
  grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
  align-items: end;
  gap: var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-density__layer-header h4,
.demo-density__layer-header p {
  margin: 0;
}

.demo-density__layer-header h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-density__layer-header p {
  max-width: 72ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-density__visual {
  min-width: 0;
}

.demo-density__row {
  display: grid;
  grid-template-columns: minmax(12rem, 15rem) minmax(13rem, 18rem) minmax(
      20rem,
      1fr
    );
  align-items: center;
  gap: var(--ui-space-4);
  min-width: 0;
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-density__identity {
  align-self: start;
  min-width: 0;
}

.demo-density__identity h5 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
}

.demo-density__identity > code,
.demo-density__sources {
  margin-top: var(--ui-space-1);
}

.demo-density__identity code,
.demo-density__values code,
.demo-density__current-reference code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.demo-density__identity > code,
.demo-density__sources code {
  display: block;
}

.demo-density__stage {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--ui-space-4);
  min-width: 0;
  min-height: 6.25rem;
  padding: var(--ui-space-3);
  background: var(--ui-color-surface-raised);
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}

.demo-density__stage::after {
  position: absolute;
  right: var(--ui-space-3);
  bottom: var(--ui-space-3);
  left: var(--ui-space-3);
  height: var(--ui-border-width);
  background: var(--ui-color-border-strong);
  content: '';
}

.demo-density__specimen {
  position: relative;
  z-index: 1;
  flex: none;
  box-sizing: border-box;
  background: var(--ui-color-surface-active);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-xs);
}

.demo-density__stage[data-density-shape='square'] .demo-density__specimen {
  inline-size: var(--demo-density-size);
  height: var(--demo-density-size);
}

.demo-density__stage[data-density-shape='height'] .demo-density__specimen {
  inline-size: min(7rem, 38%);
  height: var(--demo-density-size);
}

.demo-density__stage[data-density-shape='space'] {
  align-items: center;
}

.demo-density__stage[data-density-shape='space']::after {
  top: 50%;
  bottom: auto;
}

.demo-density__stage[data-density-shape='space'] .demo-density__specimen {
  inline-size: var(--demo-density-size);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
}

.demo-density__specimen[data-density-specimen='compact'] {
  background: var(--ui-color-accent-soft);
  border-color: var(--ui-color-accent);
}

.demo-density__specimen[data-density-specimen='current'] {
  background: var(--ui-color-surface-active);
  border-color: var(--ui-color-text-muted);
}

.demo-density__values,
.demo-density__current-reference {
  display: grid;
  gap: var(--ui-space-2) var(--ui-space-4);
  min-width: 0;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
}

.demo-density__values {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.demo-density__current-reference {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.demo-density__values > div,
.demo-density__current-reference > div {
  min-width: 0;
}

.demo-density__values dt,
.demo-density__current-reference dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
}

.demo-density__values dd,
.demo-density__current-reference dd {
  margin: var(--ui-space-1) 0 0;
  overflow-wrap: anywhere;
}

.demo-density__values dd span,
.demo-density__current-reference dd span {
  display: block;
  margin-top: var(--ui-space-1);
}

.demo-density__row[data-density-unmapped='true'] .demo-density__stage {
  background: transparent;
  border: var(--ui-border-width) dashed var(--ui-color-border);
}

.demo-density__sources {
  overflow-wrap: anywhere;
}

.demo-density__sources code + code {
  margin-top: var(--ui-space-1);
}

@container (max-width: 48rem) {
  .demo-density__layer-header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-1);
  }

  .demo-density__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }

  .demo-density__stage {
    justify-content: flex-start;
  }
}
</style>

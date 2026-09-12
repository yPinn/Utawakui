<script setup>
const TARGET_SPECIMENS = [
  { key: 'routine-target', size: '2rem' },
  { key: 'live-target', size: '2.75rem' },
  { key: 'emergency-target', size: '3rem' },
];

const CORE_GROUPS = [
  {
    key: 'readability',
    label: '文字與符號',
    floor: 'Label 14 · Body 16 · Glyph／控制標記 16',
    standard: '與 hard floor 相同',
    compact: '與 hard floor 相同',
    response: '依內容契約換行或截斷；不縮字。',
  },
  {
    key: 'interaction',
    label: '操作邊界',
    floor: '一般 32 · Live 44 · 緊急 48',
    standard: '一般 36 · Live 44 · 緊急 48',
    compact: '一般 32 · Live 44 · 緊急 48',
    response: '減少間距或換列；不縮小命中區。',
  },
  {
    key: 'structure',
    label: '內容結構',
    floor: '封面 36 · 標頭 32 · 曲目列 44 · 側欄列 48 · Player 68',
    standard: '封面 40 · 標頭 36 · 曲目列 52 · 側欄列 52 · Player 76',
    compact: '封面 36 · 標頭 32 · 曲目列 44 · 側欄列 48 · Player 68',
    response: '先隱藏次要欄位，再重排面板。',
  },
  {
    key: 'optical',
    label: '光學邊界',
    floor: 'Focus 2 CSS px · Drag 2 CSS px',
    standard: '固定',
    compact: '固定',
    response: '可改為 inset；不減少線寬。',
  },
];

const CURRENT_GROUPS = [
  {
    key: 'readability',
    label: '文字與符號',
    sources: [
      'src/styles/tokens.css',
      'src/constants/ui.js',
      'src/components/ui/UiCheckbox.vue',
      'src/components/ui/UiRange.vue',
    ],
    contract:
      'Label 0.875rem · Body 1rem · ICON_SIZE 16 · Checkbox／Range thumb 1rem',
    status: '現行吻合',
  },
  {
    key: 'interaction',
    label: '操作邊界',
    sources: ['src/styles/tokens.css', 'src/components/ui/UiIconButton.vue'],
    contract: 'md 2rem · lg 2.75rem · sm 已移除',
    status:
      '一般符合 hard floor／Compact，Standard 尚待密度映射；Live 已對齊；Emergency 尚待元件映射',
  },
  {
    key: 'structure',
    label: '內容結構',
    sources: [
      'src/styles/tokens.css',
      'src/components/ui/UiTrackRow.vue',
      'src/components/playlists/PlaylistSidebarRow.vue',
      'src/components/playback/PlayerBar.vue',
    ],
    contract:
      '曲目列 3.25rem · 封面 2.5rem · Sidebar 列 54px · Player 4.75rem；列表標頭無現行共用 token',
    status: '部分落地，逐項審查中',
  },
  {
    key: 'optical',
    label: '光學邊界',
    sources: ['src/styles/tokens.css'],
    contract: 'Focus 2 CSS px；Drag indicator 僅 Token v2 定義',
    status: '部分落地，逐項審查中',
  },
];
</script>

<template>
  <div class="demo-core-minimums">
    <p class="demo-core-minimums__note">
      <strong>比較 Token v2 hard floors 與 active implementation。</strong>
      視窗不足時先重排或收起次要內容，不得降低 hard floor；CSS px 等值以預設
      16px 根字級與 100% Chromium zoom 為前提。
    </p>

    <section
      class="demo-core-minimums__layer"
      data-core-minimum-layer="candidate"
      aria-labelledby="demo-core-candidate-title"
    >
      <header class="demo-core-minimums__layer-header">
        <div>
          <p class="demo-core-minimums__eyebrow">候選規格</p>
          <h3 id="demo-core-candidate-title">Token v2 新制定</h3>
        </div>
        <p>
          <strong>Icon button hard floor 2rem／32 CSS px。</strong>
          其餘數值依元件審查狀態。
        </p>
      </header>

      <div
        class="demo-core-minimums__preview"
        data-core-minimum-preview="targets"
        aria-hidden="true"
      >
        <span
          v-for="specimen in TARGET_SPECIMENS"
          :key="specimen.key"
          class="demo-core-minimums__specimen-slot"
          :data-core-minimum-specimen="specimen.key"
        >
          <span
            class="demo-core-minimums__specimen"
            :style="{ '--demo-core-minimum-size': specimen.size }"
          />
        </span>
      </div>

      <div
        class="demo-core-minimums__groups"
        data-core-minimum-reference="groups"
      >
        <section
          v-for="group in CORE_GROUPS"
          :key="group.key"
          class="demo-core-minimums__group"
          :data-core-minimum-group="group.key"
        >
          <h4>{{ group.label }}</h4>
          <dl>
            <div>
              <dt>Hard floor</dt>
              <dd>{{ group.floor }}</dd>
            </div>
            <div>
              <dt>Standard</dt>
              <dd>{{ group.standard }}</dd>
            </div>
            <div>
              <dt>Compact</dt>
              <dd>{{ group.compact }}</dd>
            </div>
          </dl>
          <p>{{ group.response }}</p>
        </section>
      </div>
    </section>

    <section
      class="demo-core-minimums__layer"
      data-core-minimum-layer="current"
      aria-labelledby="demo-core-current-title"
    >
      <header class="demo-core-minimums__layer-header">
        <div>
          <p class="demo-core-minimums__eyebrow">現行實作</p>
          <h3 id="demo-core-current-title">現有設定檔／組件契約</h3>
        </div>
        <p>列出目前程式來源與實際值。</p>
      </header>

      <div class="demo-core-minimums__current-groups">
        <section
          v-for="group in CURRENT_GROUPS"
          :key="group.key"
          class="demo-core-minimums__current-group"
          :data-current-setting-group="group.key"
        >
          <h4>{{ group.label }}</h4>
          <div class="demo-core-minimums__sources">
            <span>來源</span>
            <code v-for="source in group.sources" :key="source">
              {{ source }}
            </code>
          </div>
          <div class="demo-core-minimums__contract">
            <span>現行值</span>
            <p>{{ group.contract }}</p>
          </div>
          <p class="demo-core-minimums__status">{{ group.status }}</p>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-core-minimums {
  display: grid;
  gap: var(--ui-space-4);
  container-type: inline-size;
}

.demo-core-minimums__note {
  max-width: 72ch;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-core-minimums__note strong {
  color: var(--ui-color-text);
}

.demo-core-minimums__layer {
  min-width: 0;
}

.demo-core-minimums__layer-header {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
  align-items: end;
  gap: var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border-strong);
}

.demo-core-minimums__layer-header h3,
.demo-core-minimums__layer-header p,
.demo-core-minimums__eyebrow {
  margin: 0;
}

.demo-core-minimums__layer-header h3 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-heading);
}

.demo-core-minimums__layer-header > p,
.demo-core-minimums__eyebrow {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-core-minimums__layer-header strong {
  color: var(--ui-color-text);
}

.demo-core-minimums__eyebrow {
  margin-bottom: var(--ui-space-1);
  font-weight: var(--ui-font-weight-semibold);
}

.demo-core-minimums__preview {
  display: grid;
  grid-template-columns: repeat(3, minmax(3rem, max-content));
  align-items: end;
  justify-content: start;
  gap: var(--ui-space-3);
  min-width: 0;
  padding-block: var(--ui-space-2) var(--ui-space-4);
  overflow-x: auto;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-core-minimums__specimen-slot {
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: end center;
}

.demo-core-minimums__specimen {
  display: block;
  width: var(--demo-core-minimum-size);
  height: var(--demo-core-minimum-size);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.demo-core-minimums__groups {
  display: grid;
}

.demo-core-minimums__group {
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr);
  gap: var(--ui-space-2) var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-core-minimums__group:last-child {
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-core-minimums__group h4,
.demo-core-minimums__group p,
.demo-core-minimums__group dl,
.demo-core-minimums__group dd {
  margin: 0;
}

.demo-core-minimums__group h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-core-minimums__group dl {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.demo-core-minimums__group dl > div {
  min-width: 0;
}

.demo-core-minimums__group dt {
  margin-bottom: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-core-minimums__group dd,
.demo-core-minimums__group p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-core-minimums__group dd {
  color: var(--ui-color-text);
  font-variant-numeric: tabular-nums;
}

.demo-core-minimums__group p {
  grid-column: 2;
}

.demo-core-minimums__current-groups {
  display: grid;
}

.demo-core-minimums__current-group {
  display: grid;
  grid-template-columns: 8rem minmax(13rem, 1.2fr) minmax(13rem, 1fr) minmax(
      10rem,
      0.8fr
    );
  gap: var(--ui-space-4);
  padding-block: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-core-minimums__current-group:last-child {
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-core-minimums__current-group h4,
.demo-core-minimums__current-group p {
  margin: 0;
}

.demo-core-minimums__current-group h4 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-core-minimums__sources,
.demo-core-minimums__contract {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
}

.demo-core-minimums__sources > span,
.demo-core-minimums__contract > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-core-minimums__sources code,
.demo-core-minimums__contract p,
.demo-core-minimums__status {
  overflow-wrap: anywhere;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-core-minimums__status {
  color: var(--ui-color-text-muted);
}

@container (max-width: 48rem) {
  .demo-core-minimums__layer-header,
  .demo-core-minimums__group {
    grid-template-columns: 1fr;
  }

  .demo-core-minimums__group p {
    grid-column: 1;
  }

  .demo-core-minimums__current-group {
    grid-template-columns: 8rem minmax(0, 1fr);
  }

  .demo-core-minimums__contract,
  .demo-core-minimums__status {
    grid-column: 2;
  }
}

@container (max-width: 36rem) {
  .demo-core-minimums__group dl {
    grid-template-columns: 1fr;
  }

  .demo-core-minimums__current-group {
    grid-template-columns: 1fr;
  }

  .demo-core-minimums__contract,
  .demo-core-minimums__status {
    grid-column: 1;
  }
}
</style>

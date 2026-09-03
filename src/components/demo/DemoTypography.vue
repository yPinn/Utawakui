<script setup>
const TYPE_ROLES = [
  {
    key: 'display',
    role: 'Display／Emphasis',
    spec: '28／700 · 1.15',
    usage: '少量、明確的頁面強調；日後如需放大，另行確認。',
    sample: '演出控制台',
    size: '--ui-font-size-2xl',
    weight: '--ui-font-weight-bold',
    lineHeight: '--ui-line-height-display',
  },
  {
    key: 'page-heading',
    role: 'Page Heading',
    spec: '24／700 · 1.2',
    usage: '頁面唯一主標題。',
    sample: '歌曲資料',
    size: '--ui-font-size-xl',
    weight: '--ui-font-weight-bold',
    lineHeight: '--ui-line-height-heading',
  },
  {
    key: 'section-title',
    role: 'Section Title',
    spec: '18／600 · 1.3',
    usage: '頁面內主要區段標題。',
    sample: '播放與輸出',
    size: '--ui-font-size-lg',
    weight: '--ui-font-weight-semibold',
    lineHeight: '--ui-line-height-title',
  },
  {
    key: 'subheading',
    role: 'Subheading',
    spec: '16／600 · 1.3',
    usage: '區段內的次級群組名稱。',
    sample: '目前播放裝置',
    size: '--ui-font-size-md',
    weight: '--ui-font-weight-semibold',
    lineHeight: '--ui-line-height-title',
  },
  {
    key: 'body',
    role: 'Body',
    spec: '16／400 · 1.5',
    usage: '說明、段落與主要閱讀內容。',
    sample: '確認曲目資訊後，即可加入播放佇列。',
    size: '--ui-font-size-md',
    weight: '--ui-font-weight-regular',
    lineHeight: '--ui-line-height-body',
  },
  {
    key: 'control-label',
    role: 'Control／Label',
    spec: '14／600 · 1.25',
    usage: '按鈕、欄位標籤與短操作名稱。',
    sample: '儲存變更',
    size: '--ui-font-size-sm',
    weight: '--ui-font-weight-semibold',
    lineHeight: '--ui-line-height-label',
  },
  {
    key: 'metadata',
    role: 'Metadata／Caption',
    spec: '14／400 · 1.4',
    usage: '來源、時間與非主要輔助資訊。',
    sample: '本機檔案 · 3:42',
    size: '--ui-font-size-sm',
    weight: '--ui-font-weight-regular',
    lineHeight: '--ui-line-height-caption',
  },
];

const NUMERIC_SAMPLES = [
  ['經過時間', '0:00'],
  ['完整時長', '1:02:35'],
  ['速度', '120 BPM'],
  ['音量', '50%'],
  ['歌詞延遲', '+0.8s'],
  ['歌詞提前', '−0.5s'],
  ['拍號', '4/4'],
  ['曲目數量', '12 首'],
];

const LONG_TITLE =
  '這是一首需要驗證單行截斷行為的超長歌曲名稱 featuring Guest Vocalist';
</script>

<template>
  <div class="demo-typography">
    <div class="demo-typography__intro">
      <p>
        <strong>Electron 原生系統字型。</strong>
        控制面板沿用 Windows UI 字型堆疊，不下載或內嵌額外 UI 字型；Overlay
        依各輸出模板另行管理。
      </p>
      <code>
        Segoe UI Variable Text → Segoe UI → Microsoft JhengHei UI → system-ui
      </code>
    </div>

    <div class="demo-type-roles" aria-label="七個文字語意層級">
      <article
        v-for="role in TYPE_ROLES"
        :key="role.key"
        class="demo-type-role"
        :style="{
          '--demo-type-size': `var(${role.size})`,
          '--demo-type-weight': `var(${role.weight})`,
          '--demo-type-line-height': `var(${role.lineHeight})`,
        }"
      >
        <div class="demo-type-role__identity">
          <strong>{{ role.role }}</strong>
          <span>{{ role.spec }}</span>
        </div>
        <p class="demo-type-role__sample">{{ role.sample }}</p>
        <p class="demo-type-role__usage">{{ role.usage }}</p>
      </article>
    </div>

    <div class="demo-typography__checks">
      <section class="demo-type-check" aria-labelledby="demo-truncate-title">
        <div class="demo-type-check__heading">
          <h4 id="demo-truncate-title">單行截斷</h4>
          <span>既有邏輯維持相同</span>
        </div>
        <p
          class="demo-type-check__truncate"
          data-demo-contract="single-line-truncate"
          :title="LONG_TITLE"
        >
          {{ LONG_TITLE }}
        </p>
        <p class="demo-type-check__note">
          所有長標題只佔一行；容器不足時顯示省略號，不改為兩行。
        </p>
      </section>

      <section class="demo-type-check" aria-labelledby="demo-numerals-title">
        <div class="demo-type-check__heading">
          <h4 id="demo-numerals-title">操作數字</h4>
          <span>Tabular numerals</span>
        </div>
        <dl class="demo-numerals">
          <div v-for="sample in NUMERIC_SAMPLES" :key="sample[0]">
            <dt>{{ sample[0] }}</dt>
            <dd>{{ sample[1] }}</dd>
          </div>
        </dl>
      </section>

      <section class="demo-type-check" aria-labelledby="demo-fallback-title">
        <div class="demo-type-check__heading">
          <h4 id="demo-fallback-title">多語系 fallback</h4>
          <span>原生系統堆疊</span>
        </div>
        <p class="demo-type-check__languages">
          繁體中文 · English · かな／カナ · 한글
        </p>
        <p class="demo-type-check__note">
          不加裝飾性字距，依作業系統提供的字型覆蓋穩定顯示。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.demo-typography {
  display: grid;
  gap: var(--ui-space-5);
}

.demo-typography__intro {
  display: grid;
  gap: var(--ui-space-2);
  max-width: 72ch;
}

.demo-typography__intro p {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-typography__intro strong {
  color: var(--ui-color-text);
}

.demo-typography__intro code {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  overflow-wrap: anywhere;
}

.demo-type-roles {
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-type-role {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(10rem, 0.7fr) minmax(12rem, 1.3fr) minmax(
      12rem,
      1fr
    );
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) 0;
}

.demo-type-role + .demo-type-role {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-type-role__identity {
  display: grid;
  gap: var(--ui-space-1);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.demo-type-role__identity span,
.demo-type-role__usage {
  color: var(--ui-color-text-muted);
}

.demo-type-role__identity span {
  font-variant-numeric: tabular-nums;
}

.demo-type-role__sample,
.demo-type-role__usage {
  min-width: 0;
  margin: 0;
}

.demo-type-role__sample {
  color: var(--ui-color-text);
  font-size: var(--demo-type-size);
  font-weight: var(--demo-type-weight);
  line-height: var(--demo-type-line-height);
}

.demo-type-role__usage {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-typography__checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-type-check {
  min-width: 0;
  padding: var(--ui-space-4) 0;
}

.demo-type-check:nth-child(odd) {
  padding-right: var(--ui-space-5);
}

.demo-type-check:nth-child(even) {
  padding-left: var(--ui-space-5);
  border-left: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-type-check:nth-child(n + 3) {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-type-check__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}

.demo-type-check__heading h4 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.demo-type-check__heading span,
.demo-type-check__note {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-type-check__truncate {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-type-check__note {
  margin: var(--ui-space-2) 0 0;
}

.demo-numerals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.demo-numerals div {
  min-width: 0;
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.demo-numerals dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.demo-numerals dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  white-space: nowrap;
}

.demo-type-check__languages {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

@media (max-width: 72rem) {
  .demo-type-role {
    grid-template-columns: minmax(9rem, 0.8fr) minmax(0, 1.2fr);
  }

  .demo-type-role__usage {
    grid-column: 2;
  }

  .demo-typography__checks {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-type-check:nth-child(odd),
  .demo-type-check:nth-child(even) {
    padding-inline: 0;
  }

  .demo-type-check:nth-child(even),
  .demo-type-check:nth-child(n + 2) {
    border-top: var(--ui-border-width) solid var(--ui-color-border);
    border-left: 0;
  }
}

@media (max-width: 42rem) {
  .demo-type-role {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }

  .demo-type-role__usage {
    grid-column: auto;
  }
}
</style>

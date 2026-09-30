import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoHintAppearance from './DemoHintAppearance.vue';

const feedbackSource = readFileSync(
  new URL('./DemoFeedback.vue', import.meta.url),
  'utf8',
);
const appearanceSource = readFileSync(
  new URL('./DemoHintAppearance.vue', import.meta.url),
  'utf8',
);
const primitiveSource = readFileSync(
  new URL('./DemoHintPrimitive.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateHint.vue', import.meta.url),
  'utf8',
);
const currentSource = readFileSync(
  new URL('../ui/UiHint.vue', import.meta.url),
  'utf8',
);
const reviewContract = readFileSync(
  new URL(
    '../../../docs/contracts/token-v2-component-review.md',
    import.meta.url,
  ),
  'utf8',
);

function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

describe('DemoHintAppearance', () => {
  it('replaces only the hints sample with the staged review', () => {
    expect(feedbackSource).toContain(
      "import DemoHintAppearance from './DemoHintAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoHintAppearance\s+v-else-if="section\.key === 'hints'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain('const HINT_TONES');
    expect(feedbackSource).toMatch(
      /<DemoNoticeAppearance\s+v-else-if="section\.key === 'notices'"\s*\/>/u,
    );
    expect(feedbackSource).toMatch(
      /<DemoProgressAppearance\s+v-else-if="section\.key === 'progress'"\s*\/>/u,
    );
  });

  it('orders Candidate and Current through the supporting-text contract', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));
    const candidateIndex = html.indexOf('data-hint-source="candidate"');
    const currentIndex = html.indexOf('data-hint-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      '使用時機',
      '文字尺寸',
      '內容結構',
      '長內容與換行',
      '訊息類型',
      '使用情境',
      '輔助技術與公開介面',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-hint-source="${source}"[\\s\\S]*?(?=<section[^>]*data-hint-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('keeps field help, standalone support, and structured notices separate', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    expect(html).toContain('獨立輔助文字');
    expect(html).toContain('圖示、標題與操作訊息由 UiNotice 負責');
    expect(html).toContain(
      'Zod／validator issue 先由表單轉成可顯示的在地化訊息',
    );
    expect(html).toContain('invalid／error 與欄位關聯由 UiField 負責');
    expect(html).toContain('UiHint 目前保留為相容元件');
    expect(html).toContain(
      '跨功能使用只證明這種文字樣式可共用，不代表一定需要獨立 Vue 元件',
    );
    expect(html).toContain('正式遷移前仍需比較共用文字樣式與各功能自行組合');
    expect(html).not.toContain('跨 feature、無領域知識的 shared primitive');
    expect(html).toContain('不負責欄位說明、結構化通知或空狀態版面');
    expect(primitiveSource).not.toMatch(/import\s+UiField|import\s+UiNotice/u);
    expect(candidateSource).toContain("import UiHint from '../ui/UiHint.vue';");
  });

  it('keeps implementation language out of visible review and product copy', async () => {
    const text = visibleText(
      await renderToString(createSSRApp(DemoHintAppearance)),
    );

    expect(text).toContain('此段落僅供預覽，不會變更歌曲資料。');
    expect(text).toContain('正在檢查可用功能。');
    expect(text).toContain('需要的功能已可使用。');
    expect(text).toContain(
      'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    );
    expect(text).not.toMatch(
      /runtime|sidecar|metadata|adapter|\bhost\b|\bparent\b|\bcaller\b|\bprimitive\b|\bproduction\b|\blifecycle\b|\banatomy\b|\bwrapper\b/iu,
    );
  });

  it('keeps density contextual without inventing a control box', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    expect(html).toContain('Standard · 14 CSS px／1.4');
    expect(html).toContain('Compact · 14 CSS px／1.4');
    expect(html).toContain('Current · 14 CSS px／1.4');
    for (const density of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-hint-density="${density}"`);
    }
    expect(candidateSource).toContain('font-size: var(--ui-font-size-sm);');
    expect(candidateSource).toContain(
      'line-height: var(--ui-line-height-caption);',
    );
    expect(candidateSource).not.toMatch(/min-height|--ui-control-height/u);
  });

  it('shows wrapping for narrow CJK, Latin, multilingual, and unbroken content', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    for (const content of [
      'short-cjk',
      'long-cjk',
      'long-latin',
      'multilingual',
      'unbroken',
    ]) {
      expect(
        html.match(new RegExp(`data-hint-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('繁體中文、日本語、한국어 and English');
    expect(html).toContain(
      'This supporting sentence stays readable when the available panel width becomes narrow.',
    );
    expect(candidateSource).toContain('white-space: normal;');
    expect(candidateSource).toContain('overflow-wrap: anywhere;');
    expect(primitiveSource).toContain('width: min(18rem, 100%);');
    expect(primitiveSource).toContain('<UiScrollRegion');
    expect(primitiveSource).toContain('axis="horizontal"');
  });

  it('uses concise state sentences instead of fixed prefixes or color-only meaning', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));
    const text = visibleText(html);

    for (const tone of [
      'muted',
      'text',
      'info',
      'success',
      'warning',
      'danger',
      'gated',
    ]) {
      expect(
        html.match(new RegExp(`data-hint-tone="${tone}"`, 'gu')),
      ).toHaveLength(2);
      expect(candidateSource).toContain(`.demo-candidate-hint--${tone}`);
    }
    expect(html).toContain('內容類型、格式與來源說明預設使用 Neutral');
    expect(html).toContain('UiHint 不加入固定的「類型：」前綴');
    expect(html).toContain('句子本身說明狀態，顏色只輔助掃描');
    for (const copy of [
      '歌曲資料保存在這台裝置。',
      '可使用方向鍵切換選項。',
      '正在檢查可用功能。',
      '歌曲資料已儲存。',
      '部分選用資訊尚未填寫。',
      '來源 Magnitude.wav 目前無法讀取。',
      '公開輸出尚未開啟。',
    ]) {
      expect(text).toContain(copy);
    }
    for (const prefix of [
      '一般說明：',
      '操作說明：',
      '處理中：',
      '已完成：',
      '需注意：',
      '失敗：',
      '需確認：',
      '需啟用：',
    ]) {
      expect(text).not.toContain(prefix);
    }
    expect(html).not.toContain('permission denied');
  });

  it('keeps padding, alignment, placement, and empty-state composition parent-owned', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    for (const recipe of [
      'inline-support',
      'selection-prompt',
      'empty-state',
      'live-status',
    ]) {
      expect(
        html.match(new RegExp(`data-hint-recipe="${recipe}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('外層畫面決定內距、對齊與可用寬度');
    expect(html).toContain('外層畫面決定空狀態的位置');
    expect(primitiveSource).toContain('.demo-hint-recipe--empty-state');
    expect(primitiveSource).toContain('text-align: center;');
    expect(candidateSource).not.toMatch(/padding:|text-align:/u);
  });

  it('keeps native paragraph semantics and live regions caller-owned', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    expect(html).toMatch(
      /<p class="[^"]*ui-hint[^"]*"[^>]*data-hint-aria="static"/u,
    );
    expect(html).toMatch(
      /data-hint-aria="live"[^>]*role="status"[^>]*aria-live="polite"/u,
    );
    expect(html).toMatch(
      /data-hint-aria="language"[^>]*lang="ja"[^>]*dir="auto"/u,
    );
    expect(html).toContain('訊息來源決定更新時機與 role=status／aria-live');
    expect(html).toContain('訊息類型不自行建立 role=alert');
    expect(candidateSource).not.toContain('role="status"');
    expect(candidateSource).not.toContain('aria-live');
    expect(currentSource).toContain('<p');
  });

  it('documents compatibility props without promoting them into the Candidate role', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));

    expect(html).toContain('tone · 7 個相容值');
    expect(html).toContain('預設插槽 · 可見的輔助文字');
    expect(html).toContain('原生屬性會套用到段落');
    expect(html).toContain('padded／center · 僅保留現行版面相容性');
    expect(html).toContain('不包含圖示、操作、欄位關聯或即時宣告');
    expect(appearanceSource).toContain(
      ':class="`demo-hint-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-hint-layer--current');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-hint-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-hint');
  });

  it('records the completed owner checkpoint before the staged notice', () => {
    expect(reviewContract).toContain(
      '使用者可見文案的透明採必要揭露，不等於展示背景實作',
    );
    expect(reviewContract).toContain(
      '產品標本與輔助技術宣告只說明狀態、影響與可採取行動',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiHint Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiHint` 保留為 production compatibility name；F8 以 Standalone supporting text',
    );
    expect(reviewContract).toContain('不能單獨證明未來仍需要 Vue primitive');
    expect(reviewContract).toContain(
      'shared typography／utility 或 owner recipe',
    );
    expect(reviewContract).toContain('不新增 `UiSupportingText` primitive');
    expect(reviewContract).toContain(
      'Zod／validator issue 先由 form owner 轉成 localized `invalid + error`',
    );
    expect(reviewContract).toContain('UiHint 不使用固定「類型：描述」前綴');
    expect(reviewContract).toContain(
      '`padded`／`center` 只列為 Current layout compatibility',
    );
  });
});

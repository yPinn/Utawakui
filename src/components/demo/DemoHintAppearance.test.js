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
  it('keeps field help, standalone support, and structured notices separate', async () => {
    const html = await renderToString(createSSRApp(DemoHintAppearance));
    expect(html).toContain('獨立輔助文字');
    expect(html).toContain(
      '欄位說明由 UiField、圖示與操作訊息由 UiNotice 負責',
    );
    expect(html).toContain('靜態文字不主動宣告');
    expect(html).toContain('不包含圖示、操作、欄位關聯或即時宣告');
    expect(appearanceSource).not.toMatch(/import\s+UiField|import\s+UiNotice/u);
    expect(appearanceSource).toContain(
      "import UiHint from '../ui/UiHint.vue';",
    );
    // Candidate appears only inside the single labelled proposal specimen.
    expect(
      appearanceSource.match(
        /<DemoProposalSpecimen[\s\S]*?<\/DemoProposalSpecimen>/u,
      )?.[0],
    ).toContain('<DemoCandidateHint');
    expect(appearanceSource.split('<DemoCandidateHint').length).toBe(2);
  });
  it('keeps implementation language out of visible review and product copy', async () => {
    const text = visibleText(
      await renderToString(createSSRApp(DemoHintAppearance)),
    );
    expect(text).toContain('正在檢查可用功能。');
    expect(text).toContain('需要的功能已可使用。');
    expect(text).toContain(
      'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    );
    expect(text).not.toMatch(
      /runtime|sidecar|metadata|adapter|\bhost\b|\bparent\b|\bcaller\b|\bprimitive\b|\bproduction\b|\blifecycle\b|\banatomy\b|\bwrapper\b/iu,
    );
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
    expect(currentSource).toContain('<p');
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

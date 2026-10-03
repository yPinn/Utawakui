import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFinalDecisionBoard from './DemoFinalDecisionBoard.vue';

const source = readFileSync(
  new URL('./DemoFinalDecisionBoard.vue', import.meta.url),
  'utf8',
);

describe('DemoFinalDecisionBoard', () => {
  it('keeps the owner decision copy short and focused on the layout', async () => {
    const html = await renderToString(createSSRApp(DemoFinalDecisionBoard));

    expect(html).toContain('Page／Layout 最終候選');
    expect(html).toContain('請確認外框、文件層級與窄版呈現。');
    expect(html).toContain('保留');
    expect(html).toContain('清楚、低疲勞，內容容易掃讀。');
    expect(html).toContain('收斂');
    expect(html).toContain('Folder 外觀色屬於元件，作用於 tabs 與外框。');
    expect(html).toContain('排除');
    expect(html).toContain('巢狀卡片、過度裝飾與高密度。');

    expect(html).not.toContain('Final owner checkpoint');
    expect(html).not.toContain('本輪只拍板');
    expect(html).not.toContain('Direction B');
    expect(html).not.toContain('Context bay');
    expect(html).not.toContain('拍板邊界');
    expect(html).not.toContain('production');
    expect(html).not.toContain('T1');
  });

  it('reuses the distilled page layout specimen without restoring Current comparison', () => {
    expect(source).toContain(
      "import DemoPageLayoutAppearance from './DemoPageLayoutAppearance.vue';",
    );
    expect(source).toContain('<DemoPageLayoutAppearance />');
    expect(source).not.toContain('Setlist Current');
    expect(source).not.toContain('Candidate／Current');
    expect(source).not.toContain('UiFolderArtifact');
  });

  it('keeps one keyboard-reachable board scroll owner', () => {
    expect(source).toMatch(
      /class="demo-final-board__scroll"[\s\S]*?role="region"[\s\S]*?tabindex="0"/u,
    );
    expect(source).toMatch(
      /\.demo-final-board__scroll\s*\{[^}]*overflow:\s*auto;/su,
    );
  });
});

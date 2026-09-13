import fs from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoOverlays from './DemoOverlays.vue';

const readSource = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const overlaysSource = readSource('./DemoOverlays.vue');
const appearanceSource = readSource('./DemoActionMenuAppearance.vue');
const layerSource = readSource('./DemoActionMenuLayer.vue');

describe('F8 action-menu comparison', () => {
  it('promotes only the action menu into a reviewed Candidate and Current comparison', async () => {
    const html = await renderToString(
      createSSRApp(DemoOverlays, {
        sections: [
          {
            key: 'context-menu',
            title: '動作選單',
            components: ['UiActionMenu Candidate', 'UiContextMenu Current'],
          },
          { key: 'modal', title: '對話框', components: ['UiModal'] },
        ],
      }),
    );

    expect(overlaysSource).toContain("new Set(['context-menu'])");
    expect(overlaysSource).toContain('<DemoActionMenuAppearance');
    expect(html.match(/data-demo-review-layer=/g)).toHaveLength(2);
    expect(html.match(/data-review-section="reviewed"/g)).toHaveLength(1);
    expect(html).toContain('Token v2 候選 UiActionMenu');
    expect(html).toContain('現行 UiContextMenu');
  });

  it('shows both trigger families, sizing evidence, item anatomy, and visible interaction output', () => {
    expect(appearanceSource).toContain('<DemoActionMenuLayer');
    expect(layerSource).toContain('更多操作');
    expect(layerSource).toContain('@contextmenu.prevent');
    expect(layerSource).toContain("event.key !== 'ContextMenu'");
    expect(layerSource).toContain("event.shiftKey && event.key === 'F10'");
    expect(layerSource).toContain('184px');
    expect(layerSource).toContain('220px');
    expect(layerSource).toContain('240px');
    expect(layerSource).toContain('Standard／Compact 32px');
    expect(layerSource).toContain('一般內容');
    expect(layerSource).toContain('多語與捲動');
    expect(layerSource).toContain('RTL 子選單');
    expect(layerSource).toContain('空選單');
    expect(layerSource).toContain('邊界定位');
    expect(layerSource).toContain('內部捲動保持展開');
    expect(layerSource).toContain('外部捲動關閉');
    expect(layerSource).toContain('Surface gap 4px');
    expect(layerSource).toContain('Menu inset 4px');
    expect(layerSource).toContain('Item inset 4px／8px');
    expect(layerSource).toMatch(/只在實際存在的欄位之間\s+保留 8px/);
    expect(layerSource).toContain(
      '固定動作在支援寬度內完整顯示；使用者命名的目的地只在硬限制下防禦性截斷。',
    );
    expect(layerSource).toContain(
      'Icon 只輔助可見動作文案；只有 opener 與 submenu chevron 可獨立使用。',
    );
    expect(layerSource).toContain("label: '已在佇列'");
    expect(layerSource).toContain("label: '新增至佇列'");
    expect(layerSource).toContain("status: '已在佇列'");
    expect(layerSource.match(/\bstatus:/g)).toHaveLength(1);
    expect(layerSource).toContain(
      'Current 保留固定 icon／label／status／submenu lanes 與現行截斷，只供 migration audit。',
    );
    expect(layerSource).not.toContain('bounded status');
    expect(layerSource).not.toContain("status: '本機'");
    expect(layerSource).not.toContain("status: 'Local'");
    expect(layerSource).not.toContain("status: 'محلي'");
    expect(layerSource).toContain('aria-live="polite"');
  });

  it('uses the proper shared trigger primitive and keeps menu item primitives internal', () => {
    expect(layerSource).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue'",
    );
    expect(layerSource).toContain(':icon="Ellipsis"');
    expect(layerSource).not.toContain('<UiButton class="demo-action-menu-item');
    expect(layerSource).not.toContain('<UiChip');
    expect(layerSource).not.toContain('<UiMarqueeText');
  });

  it('isolates the Current menu with an active-token snapshot', () => {
    expect(appearanceSource).toMatch(
      /\.demo-action-menu-layer--current\s*\{[\s\S]*--ui-color-surface:\s*#292f35;/,
    );
    expect(appearanceSource).toMatch(
      /data-ui-theme=['"]light['"][\s\S]*\.demo-action-menu-layer--current[\s\S]*--ui-color-surface:\s*#fffdfa;/,
    );
    expect(appearanceSource).toContain('--ui-menu-item-height: 2rem');
  });

  it('only forwards teleported root attributes to the Candidate contract', () => {
    expect(layerSource).toContain('v-bind="menuRootAttributes"');
    expect(layerSource).toMatch(
      /props\.layer\.key === 'candidate'[\s\S]*id: menuId\.value,[\s\S]*dir: menu\.value\.dir,[\s\S]*'aria-label': menu\.value\.label,[\s\S]*: \{\}/,
    );
  });
});

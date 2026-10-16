import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UI_DEMO_EXCLUDED_COMPONENTS,
  UI_DEMO_GROUPS,
} from './uiDemoSections.js';

describe('UI demo component order', () => {
  it('keeps the conventional component groups before the dedicated track collection proposal', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.key)).toEqual([
      'foundations',
      'inputs',
      'actions',
      'navigation',
      'feedback',
      'content',
      'overlays',
      'track-collections',
    ]);
  });

  it('names the track collection review in concise user-facing language', () => {
    expect(
      UI_DEMO_GROUPS.find((group) => group.key === 'track-collections'),
    ).toMatchObject({
      title: '集合曲目表',
      description: '比較不同集合的欄位、狀態與窄版呈現。',
      sections: [{ title: '檢視與互動' }],
    });
  });

  it('covers every shared UI primitive exactly once', () => {
    const sections = UI_DEMO_GROUPS.flatMap((group) => group.sections);

    expect(sections.map((section) => section.key)).toEqual([
      'system-palette',
      'folder-palette',
      'status-palette',
      'typography',
      'spacing-shape',
      'core-minimums',
      'density',
      'scrollbar',
      'page-header',
      'separator',
      'stack',
      'surface',
      'kbd',
      'field',
      'search-box',
      'text-field',
      'textarea',
      'select',
      'combobox',
      'checkbox',
      'switch',
      'range',
      'color-field',
      'radio-group',
      'buttons',
      'icon-buttons',
      'text-button',
      'tabs',
      'breadcrumb',
      'segmented-control',
      'disclosure',
      'chips',
      'status-icons',
      'hints',
      'notices',
      'progress',
      'skeleton',
      'notification-host',
      'marquee-text',
      'track-thumb',
      'collage-thumb',
      'photo-frame',
      'track-rows',
      'context-menu',
      'modal',
      'tooltip',
      'popover',
      'track-collection-grid',
    ]);
    expect(new Set(sections.map((section) => section.key)).size).toBe(
      sections.length,
    );
  });

  it('registers every shared Vue primitive exactly once', () => {
    const registeredComponents = UI_DEMO_GROUPS.flatMap((group) =>
      group.sections.flatMap((section) => section.components ?? []),
    ).sort();
    const registeredSharedComponents = [...registeredComponents].sort();
    const sharedComponents = fs
      .readdirSync(new URL('../components/ui/', import.meta.url))
      .filter((filename) => /^Ui.+\.vue$/.test(filename))
      .map((filename) => filename.replace(/\.vue$/, ''))
      .filter((name) => !UI_DEMO_EXCLUDED_COMPONENTS.includes(name))
      .sort();

    expect(registeredSharedComponents).toEqual(sharedComponents);
    expect(registeredComponents).toContain('UiActionMenu');
    expect(registeredComponents).not.toContain('UiContextMenu');
    expect(new Set(registeredComponents).size).toBe(
      registeredComponents.length,
    );
  });

  it('keeps page-only artifacts out of the component catalogue', () => {
    expect(
      UI_DEMO_GROUPS.flatMap((group) => group.sections).some(
        (section) => section.key === 'page-layout',
      ),
    ).toBe(false);
    expect(UI_DEMO_EXCLUDED_COMPONENTS).toEqual([
      'UiFolderArtifact',
      'UiFolderArtifactCanvas',
    ]);
  });

  it('keeps migration lifecycle state out of the catalogue IA', () => {
    for (const section of UI_DEMO_GROUPS.flatMap((group) => group.sections)) {
      expect(section).not.toHaveProperty('reviewed');
      expect(section).not.toHaveProperty('adopted');
    }
  });

  it('uses Traditional Chinese display labels while preserving stable keys', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.title)).toEqual([
      '基礎規範',
      '輸入元件',
      '操作元件',
      '導覽元件',
      '狀態與回饋',
      '內容與媒體',
      '浮層元件',
      '集合曲目表',
    ]);
    expect(
      UI_DEMO_GROUPS.flatMap((group) =>
        group.sections.map((section) => section.title),
      ),
    ).toEqual([
      '系統預設色',
      'Folder 高彩度參考',
      'Mildliner 狀態色',
      '文字層級',
      '間距與形狀',
      '核心最小尺寸',
      '密度與尺寸',
      '捲動條外觀',
      '頁面標題列',
      '分隔線',
      '版面容器',
      '面板外觀',
      '快捷鍵提示',
      '欄位共用外觀',
      '搜尋欄',
      '文字欄位',
      '多行文字',
      '選擇欄位',
      '可搜尋選單',
      '核取方塊',
      '切換開關',
      '範圍控制',
      '色彩欄位',
      '單選群組',
      '按鈕',
      '圖示按鈕',
      '文字操作',
      '分頁導覽',
      '路徑導覽',
      '分段單選',
      '展開區塊',
      '狀態標籤',
      '狀態圖示',
      '輔助文字',
      '內嵌通知',
      '進度指示',
      '載入骨架',
      '固定通知 Host',
      '跑馬燈文字',
      '曲目縮圖',
      '拼貼縮圖',
      '照片外框',
      '曲目資料列',
      '動作選單',
      '對話框',
      '工具提示',
      '錨定浮層',
      '檢視與互動',
    ]);
  });
});

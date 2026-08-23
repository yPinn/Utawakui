import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from './uiDemoSections.js';

describe('UI demo component order', () => {
  it('uses the conventional foundations-to-overlays order', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.key)).toEqual([
      'foundations',
      'inputs',
      'actions',
      'feedback',
      'content',
      'overlays',
    ]);
  });

  it('covers every shared UI primitive exactly once', () => {
    const sections = UI_DEMO_GROUPS.flatMap((group) => group.sections);

    expect(sections.map((section) => section.key)).toEqual([
      'typography',
      'page-header',
      'text-field',
      'search-box',
      'buttons',
      'icon-buttons',
      'text-button',
      'chips',
      'status-icons',
      'hints',
      'notices',
      'marquee-text',
      'track-thumb',
      'collage-thumb',
      'track-rows',
      'context-menu',
      'modal',
    ]);
    expect(new Set(sections.map((section) => section.key)).size).toBe(
      sections.length,
    );
  });

  it('uses Traditional Chinese display labels while preserving stable keys', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.title)).toEqual([
      '基礎規範',
      '輸入元件',
      '操作元件',
      '狀態與回饋',
      '內容與媒體',
      '浮層元件',
    ]);
    expect(
      UI_DEMO_GROUPS.flatMap((group) =>
        group.sections.map((section) => section.title),
      ),
    ).toEqual([
      '文字層級',
      '頁面標題列',
      '文字欄位',
      '搜尋欄',
      '按鈕',
      '圖示按鈕',
      '文字按鈕',
      '狀態標籤',
      '狀態圖示',
      '提示文字',
      '通知訊息',
      '跑馬燈文字',
      '曲目縮圖',
      '拼貼縮圖',
      '曲目資料列',
      '快顯選單',
      '對話框',
    ]);
  });
});

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from './uiDemoSections.js';

describe('UI demo component order', () => {
  it('uses the conventional foundations-to-overlays order', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.key)).toEqual([
      'foundations',
      'inputs',
      'actions',
      'navigation',
      'feedback',
      'content',
      'overlays',
    ]);
  });

  it('covers every shared UI primitive exactly once', () => {
    const sections = UI_DEMO_GROUPS.flatMap((group) => group.sections);

    expect(sections.map((section) => section.key)).toEqual([
      'system-palette',
      'folder-palette',
      'status-palette',
      'typography',
      'spacing-shape',
      'density',
      'page-header',
      'search-box',
      'field',
      'text-field',
      'textarea',
      'select',
      'checkbox',
      'range',
      'buttons',
      'icon-buttons',
      'text-button',
      'tabs',
      'chips',
      'status-icons',
      'hints',
      'notices',
      'progress',
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

  it('registers every shared Vue primitive exactly once', () => {
    const registeredComponents = UI_DEMO_GROUPS.flatMap((group) =>
      group.sections.flatMap((section) => section.components ?? []),
    ).sort();
    const sharedComponents = fs
      .readdirSync(new URL('../components/ui/', import.meta.url))
      .filter((filename) => /^Ui.+\.vue$/.test(filename))
      .map((filename) => filename.replace(/\.vue$/, ''))
      .sort();

    expect(registeredComponents).toEqual(sharedComponents);
    expect(new Set(registeredComponents).size).toBe(
      registeredComponents.length,
    );
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
      '密度與尺寸',
      '頁面標題列',
      '搜尋欄',
      '欄位框架',
      '文字欄位',
      '多行文字',
      '選擇欄位',
      '核取方塊',
      '範圍控制',
      '按鈕',
      '圖示按鈕',
      '文字按鈕',
      '分頁導覽',
      '狀態標籤',
      '狀態圖示',
      '提示文字',
      '通知訊息',
      '進度指示',
      '跑馬燈文字',
      '曲目縮圖',
      '拼貼縮圖',
      '曲目資料列',
      '快顯選單',
      '對話框',
    ]);
  });
});

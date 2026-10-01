import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UI_DEMO_GROUP_REVIEW_STATUS,
  UI_DEMO_GROUPS,
} from './uiDemoSections.js';

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
      'core-minimums',
      'density',
      'scrollbar',
      'page-header',
      'page-layout',
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
      'track-rows',
      'context-menu',
      'modal',
      'tooltip',
      'popover',
    ]);
    expect(new Set(sections.map((section) => section.key)).size).toBe(
      sections.length,
    );
  });

  it('registers every shared Vue primitive exactly once', () => {
    const registeredComponents = UI_DEMO_GROUPS.flatMap((group) =>
      group.sections.flatMap((section) => section.components ?? []),
    ).sort();
    const registeredSharedComponents = registeredComponents
      .map((name) => name.replace(/ (Candidate|Current)$/u, ''))
      .filter((name) => name !== 'UiActionMenu')
      .sort();
    const sharedComponents = fs
      .readdirSync(new URL('../components/ui/', import.meta.url))
      .filter((filename) => /^Ui.+\.vue$/.test(filename))
      .map((filename) => filename.replace(/\.vue$/, ''))
      .sort();

    expect(registeredSharedComponents).toEqual(sharedComponents);
    expect(registeredComponents).toContain('UiActionMenu Candidate');
    expect(registeredComponents).toContain('UiContextMenu Current');
    expect(new Set(registeredComponents).size).toBe(
      registeredComponents.length,
    );

    for (const key of [
      'kbd',
      'color-field',
      'radio-group',
      'disclosure',
      'skeleton',
      'notification-host',
      'tooltip',
      'switch',
      'breadcrumb',
      'combobox',
    ]) {
      expect(
        UI_DEMO_GROUPS.flatMap((group) => group.sections).find(
          (section) => section.key === key,
        )?.reviewed,
        key,
      ).toBe(false);
    }

    for (const key of [
      'separator',
      'stack',
      'surface',
      'segmented-control',
      'popover',
    ]) {
      expect(
        UI_DEMO_GROUPS.flatMap((group) => group.sections).find(
          (section) => section.key === key,
        )?.reviewed,
        key,
      ).not.toBe(false);
    }
  });

  it('derives group review status from section truth', () => {
    expect(UI_DEMO_GROUP_REVIEW_STATUS).toEqual({
      foundations: 'partial',
      inputs: 'partial',
      actions: 'reviewed',
      navigation: 'partial',
      feedback: 'partial',
      content: 'reviewed',
      overlays: 'partial',
    });
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
      '核心最小尺寸',
      '密度與尺寸',
      '捲動條外觀',
      '頁面標題列',
      '頁面版型',
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
      '曲目資料列',
      '動作選單',
      '對話框',
      '工具提示',
      '錨定浮層',
    ]);
  });
});

import fs from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from '../constants/uiDemoSections.js';
import DemoView from './DemoView.vue';

const source = fs.readFileSync(
  new URL('./DemoView.vue', import.meta.url),
  'utf8',
);

describe('DemoView scroll layout', () => {
  it('owns its constrained catalogue scroll boundary', () => {
    const rootStyle = source.match(/\.demo-view\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(source).toMatch(
      /\.demo-view\s*\{[^}]*height:\s*100%;[^}]*display:\s*grid;/s,
    );
    expect(rootStyle).toMatch(/overflow:\s*hidden;/);
    expect(source).toContain('class="demo-view__scroll"');
    expect(source).toContain('viewport-class="demo-view__body"');
    expect(source).toContain('class="demo-view__index-scroll"');
    expect(source).toContain('axis="horizontal"');
  });

  it('keeps the inspection surface neutral while folder colors are reviewed', () => {
    const rootStyle = source.match(/\.demo-view\s*\{[^}]*\}/s)?.[0] ?? '';
    const indexStyle =
      source.match(/\.demo-view__index-scroll\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(rootStyle).toContain('background: var(--ui-color-canvas)');
    expect(rootStyle).toContain('padding: var(--ui-shell-gutter)');
    expect(rootStyle).not.toContain('--ui-color-folder');
    expect(rootStyle).not.toContain('--ui-color-text-muted:');
    expect(indexStyle).toContain('background: var(--ui-color-surface)');
  });

  it('activates the isolated F7 candidate token system for its lifetime', () => {
    expect(source).toContain("import '../styles/tokens-v2.css'");
    expect(source).toContain("root.dataset.uiSystem = 'v2'");
    expect(source).toContain('previousUiSystem = root.dataset.uiSystem');
    expect(source).toContain('delete root.dataset.uiSystem');
  });

  it('renders the conventional catalogue order and its review boundary', async () => {
    const html = await renderToString(createSSRApp(DemoView));
    const header = html.match(
      /<header class="demo-view__header"[\s\S]*?<\/header>/u,
    )?.[0];
    const groupTitles = UI_DEMO_GROUPS.map((group) => group.title);
    const positions = groupTitles.map((title) => html.indexOf(title));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
    expect(header).toContain('F8');
    expect(header).not.toContain('F9');
    expect(header).toContain('Candidate／Current 對照');
    expect(header).toContain('同一正式 Ui* 實作');
    expect(header).toContain('不代表 View 核准');
    expect(header).toContain('正式遷移');
    expect(header).toContain('9 個 section');
    expect(html.match(/data-review-status="reviewed"/g)).toHaveLength(2);
    expect(html.match(/data-review-status="partial"/g)).toHaveLength(5);
  });

  it('keeps catalogue jumps inside the demo scroll boundary', async () => {
    const html = await renderToString(createSSRApp(DemoView));

    expect(source).toContain('scrollToGroup');
    expect(source).toContain("useTemplateRef('scrollRegion')");
    expect(source).toContain('scrollRegion.value?.viewport');
    expect(html).not.toContain('href="#demo-group-');
    expect(html.match(/class="demo-view__index-button"/g)).toHaveLength(
      UI_DEMO_GROUPS.length,
    );
  });
});

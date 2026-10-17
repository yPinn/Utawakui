import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PerformanceSessionReviewPane from './PerformanceSessionReviewPane.vue';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('Performance Session Folder composition', () => {
  it('preserves the shared reserve on both ordered and search lists', () => {
    for (const file of [
      './PerformanceSessionPlanList.vue',
      './PerformanceSessionWorkspace.vue',
    ]) {
      const source = read(file);
      expect(source).toContain('UiScrollLayout');
      const content = source.match(
        /:deep\(\.performance-session-(?:plan-list|workspace__search-results)\)\s*\{([^}]+)\}/u,
      )?.[1];
      expect(content).toBeTruthy();
      expect(content).not.toMatch(/\bpadding\s*:/u);
      expect(content).toContain('list-style: none');
    }
  });

  it.each([
    './PerformanceSessionPlanEditor.vue',
    './PerformanceSessionManualItemForm.vue',
  ])('keeps %s on the shared review pane and semantic typography', (file) => {
    const source = read(file);
    expect(source).toContain('<PerformanceSessionReviewPane');
    expect(source).toContain('#actions');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).toContain('var(--ui-type-title-size)');
    expect(source).toContain('var(--ui-type-title-weight)');
    expect(source).toContain('var(--ui-type-title-line-height)');
    expect(source).not.toContain('var(--ui-type-heading-line-height)');
    expect(source).toContain(
      file.includes('PlanEditor')
        ? 'var(--ui-type-caption-size)'
        : 'var(--ui-type-body-size)',
    );
  });

  it('keeps footer actions outside the one labeled, keyboard-accessible scroll body', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            PerformanceSessionReviewPane,
            { bodyLabel: '項目內容' },
            {
              default: () => h('p', 'Scrollable form'),
              actions: () => h('button', 'Save'),
            },
          ),
      }),
    );
    expect(html).toContain('aria-label="項目內容"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('ui-scroll-layout__content');
    expect(html.indexOf('Scrollable form')).toBeLessThan(
      html.indexOf('performance-session-review-pane__actions'),
    );
    const source = read('./PerformanceSessionReviewPane.vue');
    expect(source).toContain('var(--ui-scrollbar-visual-reserve)');
    expect(source).toContain('var(--ui-scroll-layout-reserve-inline-end)');
    expect(source).not.toContain('var(--ui-scrollbar-lane-size)');
  });

  it('prints read-only source metadata on the paper without another raised card', () => {
    const source = read('./PerformanceSessionPlanEditor.vue');
    const rule = source.match(
      /\.performance-session-editor__source\s*\{([^}]+)\}/u,
    )?.[1];
    expect(rule).toContain('--ui-folder-ledger-rule');
    expect(rule).not.toMatch(/\b(?:background|border-radius)\s*:/u);
    expect(source).toContain(
      '<dl class="performance-session-editor__source-details">',
    );
    expect(source).toContain('曲庫資料（唯讀）');
  });
});

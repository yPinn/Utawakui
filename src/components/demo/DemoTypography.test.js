import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoTypography from './DemoTypography.vue';

const componentSource = readFileSync(
  new URL('./DemoTypography.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

describe('DemoTypography', () => {
  it('documents the native Electron type stack and seven semantic roles', async () => {
    const html = await renderToString(createSSRApp(DemoTypography));

    expect(html).toContain('Electron 原生系統字型');
    expect(html).toContain('不下載或內嵌額外 UI 字型');
    expect(html).toContain('Display／Emphasis');
    expect(html).toContain('Page Heading');
    expect(html).toContain('Section Title');
    expect(html).toContain('Subheading');
    expect(html).toContain('Body');
    expect(html).toContain('Control／Label');
    expect(html).toContain('Metadata／Caption');
    expect(html).toContain('28／700');
    expect(html).toContain('日後如需放大，另行確認');
  });

  it('keeps long titles on one truncated line without changing app behavior', async () => {
    const html = await renderToString(createSSRApp(DemoTypography));

    expect(html).toContain('單行截斷');
    expect(html).toContain('data-demo-contract="single-line-truncate"');
    expect(html).toContain(
      '這是一首需要驗證單行截斷行為的超長歌曲名稱 featuring Guest Vocalist',
    );
  });

  it('binds the approved display and truncation decisions to real styles', () => {
    expect(componentSource).toMatch(
      /key: 'display',[\s\S]*?size: '--ui-font-size-2xl',[\s\S]*?weight: '--ui-font-weight-bold'/u,
    );
    expect(componentSource).toContain('font-size: var(--demo-type-size);');
    expect(componentSource).toContain('font-weight: var(--demo-type-weight);');
    expect(tokenSource).toContain('--ui-font-size-2xl: 1.75rem;');
    expect(tokenSource).toContain('--ui-font-weight-bold: 700;');

    const truncateRule =
      componentSource.match(/\.demo-type-check__truncate\s*\{[^}]*\}/su)?.[0] ??
      '';
    expect(truncateRule).toContain('min-width: 0;');
    expect(truncateRule).toContain('overflow: hidden;');
    expect(truncateRule).toContain('text-overflow: ellipsis;');
    expect(truncateRule).toContain('white-space: nowrap;');
  });

  it('shows tabular operational numerals and multilingual fallback coverage', async () => {
    const html = await renderToString(createSSRApp(DemoTypography));

    for (const sample of [
      '0:00',
      '1:02:35',
      '120 BPM',
      '50%',
      '+0.8s',
      '−0.5s',
      '4/4',
      '12 首',
    ]) {
      expect(html).toContain(sample);
    }
    expect(html).toContain('繁體中文');
    expect(html).toContain('English');
    expect(html).toContain('かな');
    expect(html).toContain('한글');
  });
});

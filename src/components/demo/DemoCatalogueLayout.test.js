import fs from 'node:fs';
import { createSSRApp, h } from 'vue';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoView from '../../views/DemoView.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

const readSource = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const catalogueSource = readSource('./DemoCatalogueSection.vue');
const catalogueDescriptor = parse(catalogueSource).descriptor;
const catalogueCompiledCss = compileStyle({
  id: 'data-v-catalogue-test',
  filename: 'DemoCatalogueSection.vue',
  source: catalogueDescriptor.styles[0].content,
  scoped: true,
}).code;
const viewSource = readSource('../../views/DemoView.vue');
const foundationsSource = readSource('./DemoFoundations.vue');
const inputsSource = readSource('./DemoInputs.vue');
const actionsSource = readSource('./DemoActions.vue');
const navigationSource = readSource('./DemoNavigation.vue');
const feedbackSource = readSource('./DemoFeedback.vue');
const contentSource = readSource('./DemoContent.vue');

const REVIEWED_APPEARANCE_SOURCES = [
  './DemoFieldAppearance.vue',
  './DemoFieldReadonlyAppearance.vue',
  './DemoSearchBoxAppearance.vue',
  './DemoTextFieldAppearance.vue',
  './DemoTextareaAppearance.vue',
  './DemoSelectAppearance.vue',
  './DemoCheckboxAppearance.vue',
  './DemoRangeAppearance.vue',
  './DemoButtonAppearance.vue',
  './DemoIconButtonAppearance.vue',
  './DemoTextButtonAppearance.vue',
  './DemoTabsAppearance.vue',
  './DemoChipAppearance.vue',
  './DemoStatusIconAppearance.vue',
  './DemoHintAppearance.vue',
  './DemoNoticeAppearance.vue',
  './DemoProgressAppearance.vue',
  './DemoMarqueeTextAppearance.vue',
  './DemoTrackThumbAppearance.vue',
  './DemoCollageThumbAppearance.vue',
  './DemoTrackRowAppearance.vue',
  './DemoActionMenuAppearance.vue',
  './DemoModalAppearance.vue',
].map(readSource);

describe('F8 reviewed catalogue layout', () => {
  it('reports the completed core groups and remaining overlay boundary', async () => {
    const html = await renderToString(createSSRApp(DemoView));

    expect(html.match(/data-review-status="reviewed"/g)).toHaveLength(2);
    expect(html.match(/data-review-status="partial"/g)).toHaveLength(5);
    expect(html.match(/data-review-status="pending"/g) ?? []).toHaveLength(0);
    expect(html.match(/data-review-section="reviewed"/g)).toHaveLength(35);
    expect(html).toContain('Foundation → UiModal＋UiScrollRegion');
    expect(
      html.match(/class="demo-group__status"[^>]*>\s*已審查/g),
    ).toHaveLength(2);
    expect(
      html.match(/class="demo-group__status"[^>]*>\s*部分完成/g),
    ).toHaveLength(5);
    expect(
      html.match(/class="demo-group__status"[^>]*>\s*待審查/g) ?? [],
    ).toHaveLength(0);
  });

  it('keeps reviewed sections flat and uses the comparison layers as surfaces', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            DemoCatalogueSection,
            {
              id: 'reviewed-fixture',
              title: 'Reviewed fixture',
              reviewed: true,
            },
            () => 'Evidence',
          ),
      }),
    );
    const reviewedRule =
      catalogueSource.match(
        /\.demo-catalogue-section--reviewed\s*\{[^}]*\}/s,
      )?.[0] ?? '';

    expect(html).toContain('demo-catalogue-section--reviewed');
    expect(html).toContain('data-review-section="reviewed"');
    expect(reviewedRule).toContain('background: transparent');
    expect(reviewedRule).not.toContain('border-radius');
    expect(reviewedRule).not.toMatch(/selected|accent|folder/);
  });

  it('gives completed and pending section lists a consistent block rhythm', () => {
    expect(foundationsSource).toContain(
      ':reviewed="section.reviewed !== false"',
    );
    expect(inputsSource).toContain(':reviewed="section.reviewed !== false"');
    expect(actionsSource).toContain(':reviewed="true"');
    expect(navigationSource).toContain(
      ':reviewed="section.reviewed !== false"',
    );
    expect(feedbackSource).toContain(
      'COMPARISON_SECTION_KEYS.has(section.key)',
    );
    expect(contentSource).toContain('COMPARISON_SECTION_KEYS.has(section.key)');
    const overlaysSource = readSource('./DemoOverlays.vue');
    expect(overlaysSource).toContain(
      'COMPARISON_SECTION_KEYS.has(section.key)',
    );

    for (const source of [
      foundationsSource,
      inputsSource,
      actionsSource,
      navigationSource,
      feedbackSource,
      contentSource,
      overlaysSource,
    ]) {
      expect(source).toMatch(/display:\s*grid;[^}]*gap:/s);
    }
  });

  it('uses one isolated Candidate and Current surface contract across reviewed components', () => {
    for (const source of REVIEWED_APPEARANCE_SOURCES) {
      expect(source).toContain(':data-demo-review-layer="layer.key"');
    }

    expect(catalogueSource).toMatch(
      /:deep\(\[data-demo-review-layer\]\)\s*\{[^}]*background:\s*var\(--demo-review-layer-background\)/s,
    );
    expect(catalogueSource).toMatch(
      /data-demo-review-layer=['"]candidate['"][^}]*--demo-review-layer-background:\s*var\(--ui-color-surface-raised\)/s,
    );
    expect(catalogueSource).toMatch(
      /data-demo-review-layer=['"]current['"][^}]*--demo-review-layer-background:\s*#30383e/s,
    );
    expect(catalogueSource).toMatch(
      /data-ui-theme=['"]light['"][^}]*data-demo-review-layer=['"]current['"][^}]*--demo-review-layer-background:\s*#fff(?:fff)?/s,
    );
    expect(catalogueCompiledCss).toMatch(
      /:root\[data-ui-theme=['"]light['"]\][^{]*\.demo-catalogue-section--reviewed[^{]*\[data-demo-review-layer=['"]current['"]\]\s*\{/s,
    );
  });

  it('keeps the F8 boundary in one concise summary and preserves responsive reading order', async () => {
    const html = await renderToString(createSSRApp(DemoView));
    const header = html.match(
      /<header class="demo-view__header"[\s\S]*?<\/header>/u,
    )?.[0];

    expect(header).toContain(
      '待遷移元件維持 Candidate／Current 對照；已遷移元件則以同一正式 Ui* 實作',
    );
    expect(header).toContain('Foundation → UiModal＋UiScrollRegion');
    expect(header).toContain('8 個 section');
    expect(header?.match(/<dt(?:\s|>)/g)).toHaveLength(2);
    expect(viewSource).toMatch(
      /@media \(max-width: 58rem\)[\s\S]*\.demo-group__header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(catalogueSource).toMatch(
      /@media \(max-width: 58rem\)[\s\S]*\.demo-catalogue-section\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

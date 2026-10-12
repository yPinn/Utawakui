import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const catalogueSource = readSource('./DemoCatalogueSection.vue');
const catalogueDescriptor = parse(catalogueSource).descriptor;
const catalogueCompiledCss = compileStyle({
  id: 'data-v-catalogue-test',
  filename: 'DemoCatalogueSection.vue',
  source: catalogueDescriptor.styles[0].content,
  scoped: true,
}).code;
const foundationsSource = readSource('./DemoFoundations.vue');
const inputsSource = readSource('./DemoInputs.vue');
const actionsSource = readSource('./DemoActions.vue');
const navigationSource = readSource('./DemoNavigation.vue');
const feedbackSource = readSource('./DemoFeedback.vue');
const contentSource = readSource('./DemoContent.vue');
const overlaysSource = readSource('./DemoOverlays.vue');

const COMPARISON_APPEARANCE_SOURCES = [
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

describe('F8 component catalogue layout', () => {
  it('keeps component sections flat and comparison surfaces local', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            DemoCatalogueSection,
            {
              id: 'comparison-fixture',
              title: 'Comparison fixture',
              comparison: true,
            },
            () => 'Evidence',
          ),
      }),
    );
    const comparisonRule =
      catalogueSource.match(
        /\.demo-catalogue-section--comparison\s*\{[^}]*\}/s,
      )?.[0] ?? '';

    expect(html).toContain('demo-catalogue-section--comparison');
    expect(html).toContain('data-demo-comparison="true"');
    expect(comparisonRule).toContain('background: transparent');
    expect(comparisonRule).not.toContain('border-radius');
    expect(comparisonRule).not.toMatch(/selected|accent|folder/);
  });

  it('gives every group a consistent section rhythm', () => {
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

  it('uses one isolated Candidate and Current comparison contract', () => {
    for (const source of COMPARISON_APPEARANCE_SOURCES) {
      expect(source).toContain(':data-demo-review-layer="layer.key"');
    }

    expect(catalogueSource).toMatch(
      /:deep\(\[data-demo-review-layer\]\)\s*\{[^}]*background:\s*var\(--demo-review-layer-background\)/s,
    );
    expect(catalogueSource).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(catalogueCompiledCss).not.toContain(':root[data-ui-theme=');
  });

  it('preserves responsive section reading order', () => {
    expect(catalogueSource).toMatch(
      /@container app-folder-layout \(max-width: 58rem\)[\s\S]*\.demo-catalogue-section\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

import fs from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoView from '../../views/DemoView.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';

const readSource = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const catalogueSource = readSource('./DemoCatalogueSection.vue');
const viewSource = readSource('../../views/DemoView.vue');
const foundationsSource = readSource('./DemoFoundations.vue');
const inputsSource = readSource('./DemoInputs.vue');

const INPUT_APPEARANCE_SOURCES = [
  './DemoFieldAppearance.vue',
  './DemoFieldReadonlyAppearance.vue',
  './DemoSearchBoxAppearance.vue',
  './DemoTextFieldAppearance.vue',
  './DemoTextareaAppearance.vue',
  './DemoSelectAppearance.vue',
  './DemoCheckboxAppearance.vue',
  './DemoRangeAppearance.vue',
].map(readSource);

describe('F8 reviewed catalogue layout', () => {
  it('limits reviewed sections to the completed Foundation and Input groups', async () => {
    const html = await renderToString(createSSRApp(DemoView));

    expect(viewSource).toContain("new Set(['foundations', 'inputs'])");
    expect(html.match(/data-review-status="reviewed"/g)).toHaveLength(2);
    expect(html.match(/data-review-status="pending"/g)).toHaveLength(5);
    expect(html.match(/data-review-section="reviewed"/g)).toHaveLength(15);
  });

  it('maps reviewed sections to neutral Surface without adoption color', async () => {
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
    expect(reviewedRule).toContain('background: var(--ui-color-surface)');
    expect(reviewedRule).not.toMatch(/selected|accent|folder/);
  });

  it('gives reviewed section lists a consistent block rhythm', () => {
    expect(foundationsSource).toContain(':reviewed="true"');
    expect(inputsSource).toContain(':reviewed="true"');
    expect(foundationsSource).toMatch(
      /\.demo-foundations\s*\{[^}]*display:\s*grid;[^}]*gap:/s,
    );
    expect(inputsSource).toMatch(
      /\.demo-inputs\s*\{[^}]*display:\s*grid;[^}]*gap:/s,
    );
  });

  it('uses one neutral Candidate and Current layer contract across Inputs', () => {
    for (const source of INPUT_APPEARANCE_SOURCES) {
      expect(source).toContain(':data-demo-review-layer="layer.key"');
    }

    expect(inputsSource).toContain(':deep([data-demo-review-layer])');
    expect(inputsSource).toMatch(
      /:deep\(\[data-demo-review-layer=['"]current['"]\]\)/,
    );
    expect(inputsSource).not.toMatch(
      /\[data-demo-review-layer[^\]]*\][^{]*\{[^}]*(?:selected|accent|folder)/s,
    );
  });

  it('keeps the F8 boundary concise and preserves responsive reading order', async () => {
    const html = await renderToString(createSSRApp(DemoView));
    const header = html.match(
      /<header class="demo-view__header"[\s\S]*?<\/header>/u,
    )?.[0];

    expect(header).toContain('Candidate ≠ production adoption');
    expect(header).toContain('不代表 View 核准');
    expect(header?.match(/<dt(?:\s|>)/g)).toHaveLength(2);
    expect(viewSource).toMatch(
      /@media \(max-width: 58rem\)[\s\S]*\.demo-group__header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(catalogueSource).toMatch(
      /@media \(max-width: 58rem\)[\s\S]*\.demo-catalogue-section\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from '../../constants/uiDemoSections.js';
import DemoActions from './DemoActions.vue';
import DemoCatalogueSection from './DemoCatalogueSection.vue';
import DemoContent from './DemoContent.vue';
import DemoFeedback from './DemoFeedback.vue';
import DemoFoundations from './DemoFoundations.vue';
import DemoInputs from './DemoInputs.vue';
import DemoNavigation from './DemoNavigation.vue';
import DemoOverlays from './DemoOverlays.vue';
import DemoTrackCollectionProposal from './DemoTrackCollectionProposal.vue';

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
const trackCollectionSource = readSource('./DemoTrackCollectionProposal.vue');

const GROUP_COMPONENTS = {
  foundations: DemoFoundations,
  layout: DemoFoundations,
  inputs: DemoInputs,
  actions: DemoActions,
  navigation: DemoNavigation,
  feedback: DemoFeedback,
  content: DemoContent,
  overlays: DemoOverlays,
  'track-collections': DemoTrackCollectionProposal,
};

const SPECIMEN_APPEARANCE_SOURCES = [
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

const INTERACTIVE_PROPOSAL_SOURCES = [
  './DemoActionMenuLayer.vue',
  './DemoModalLayer.vue',
].map(readSource);

describe('F8 component catalogue layout', () => {
  it('keeps component sections flat without a second review surface', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            DemoCatalogueSection,
            {
              id: 'comparison-fixture',
              title: 'Specimen fixture',
            },
            () => 'Evidence',
          ),
      }),
    );
    expect(html).toContain('demo-catalogue-section');
    expect(html).not.toContain('demo-catalogue-section--comparison');
    expect(html).not.toContain('data-demo-comparison');
    expect(catalogueSource).not.toContain('comparison:');
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
      trackCollectionSource,
    ]) {
      expect(source).toMatch(/display:\s*grid;[^}]*gap:/s);
    }
  });

  it('keeps legacy Current snapshots out of the runtime catalogue', () => {
    for (const source of SPECIMEN_APPEARANCE_SOURCES) {
      expect(source).not.toMatch(/key:\s*['"]current['"]/u);
      expect(source).not.toContain('data-demo-review-layer');
      expect(source).not.toMatch(/-layer--current|--demo-current/u);
      expect(source).not.toContain(":root[data-ui-theme='light']");
    }

    expect(catalogueSource).not.toContain('data-demo-review-layer');
    expect(catalogueSource).not.toContain('data-demo-comparison');
    expect(catalogueSource).not.toContain('demo-catalogue-section--comparison');
    expect(catalogueSource).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(catalogueCompiledCss).not.toContain(':root[data-ui-theme=');
  });

  it('renders active truth and proposals without Candidate／Current comparison copy', async () => {
    for (const group of UI_DEMO_GROUPS) {
      const html = await renderToString(
        createSSRApp(GROUP_COMPONENTS[group.key], {
          sections: group.sections,
        }),
      );
      const visibleText = html.replace(/<[^>]+>/gu, ' ');

      expect(html).not.toMatch(/data-[\w-]+-source="current"/u);
      expect(html).not.toContain('Current ·');
      expect(html).not.toContain('Token v2 候選');
      expect(html).not.toContain('Token v2 Candidate');
      expect(visibleText).not.toMatch(/\bCandidate\b|(?:候選|現行)版/u);
    }
  });

  it('does not retain unreachable Current implementations in interactive proposals', () => {
    for (const source of INTERACTIVE_PROPOSAL_SOURCES) {
      expect(source).not.toMatch(/layer\.key\s*[!=]==?\s*['"]current['"]/u);
      expect(source).not.toContain('isCandidate');
      expect(source).not.toContain('setCurrentMarker');
      expect(source).not.toContain('useUiOverlayHost');
    }
  });

  it('preserves responsive section reading order', () => {
    expect(catalogueSource).toMatch(
      /@container app-folder-layout \(max-width: 58rem\)[\s\S]*\.demo-catalogue-section\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });
});

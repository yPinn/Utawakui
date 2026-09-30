import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const baseStyles = readSource('../../styles/base.css');

const batchOneConsumers = [
  {
    name: 'inner page',
    source: readSource('../layout/AppInnerPage.vue'),
    marker: 'class="app-inner-page__scroll"',
  },
  {
    name: 'playlist sidebar',
    source: readSource('../layout/AppPlaylistSidebar.vue'),
    marker: 'class="app-playlist-sidebar__scroll"',
  },
  {
    name: 'queue',
    source: readSource('../queue/QueuePanel.vue'),
    marker: 'class="queue-panel__scroll"',
  },
  {
    name: 'studio track table',
    source: readSource('../playlists/StudioLibraryTrackTable.vue'),
    marker: 'class="studio-track-table"',
  },
  {
    name: 'studio context inspector',
    source: readSource('../playlists/StudioLibraryContextInspector.vue'),
    marker: 'class="studio-context-inspector__scroll"',
  },
  {
    name: 'settings',
    source: readSource('../../views/SettingsView.vue'),
    marker: 'class="settings-view"',
  },
];

const batchTwoConsumers = [
  { name: 'modal', source: readSource('./UiModal.vue') },
  { name: 'combobox', source: readSource('./UiCombobox.vue') },
  { name: 'context menu', source: readSource('./UiContextMenu.vue') },
  { name: 'popover', source: readSource('./UiPopover.vue') },
  { name: 'breadcrumb', source: readSource('./UiBreadcrumb.vue') },
  { name: 'tabs', source: readSource('./UiTabs.vue') },
  {
    name: 'segmented control',
    source: readSource('./UiSegmentedControl.vue'),
  },
];

const batchThreeConsumers = [
  {
    name: 'analysis workbench detail',
    source: readSource('../analysis/MusicAnalysisWorkbench.vue'),
  },
  {
    name: 'analysis reference annotation',
    source: readSource('../analysis/MusicAnalysisReferenceAnnotation.vue'),
  },
  {
    name: 'analysis benchmark review',
    source: readSource('../analysis/MusicAnalysisBenchmarkReview.vue'),
  },
  {
    name: 'lyrics document',
    source: readSource('../lyrics/LyricsDocumentPanel.vue'),
  },
  {
    name: 'lyrics provider workbench',
    source: readSource('../lyrics-provider/LyricsProviderReviewWorkbench.vue'),
  },
  {
    name: 'lyrics provider form',
    source: readSource('../lyrics-provider/LyricsProviderReviewForm.vue'),
  },
  {
    name: 'lyrics provider strata',
    source: readSource('../lyrics-provider/LyricsProviderReviewStrata.vue'),
  },
  {
    name: 'output settings',
    source: readSource('../output/ObsOutputSettings.vue'),
  },
  {
    name: 'output template gallery',
    source: readSource('../output/ObsTemplateGallery.vue'),
  },
  {
    name: 'output slot workbench',
    source: readSource('../output/ObsSlotWorkbench.vue'),
  },
  {
    name: 'output tabs',
    source: readSource('../output/ObsOutputTabs.vue'),
  },
  {
    name: 'output split layout',
    source: readSource('../output/ObsOutputSplitLayout.vue'),
  },
  { name: 'demo catalogue', source: readSource('../../views/DemoView.vue') },
];

describe('UiScrollRegion production migration', () => {
  it.each(batchOneConsumers)(
    'migrates the $name scroll owner without keeping native scrollbar paint',
    ({ source, marker }) => {
      expect(source).toContain('UiScrollRegion');
      expect(source).toContain('<UiScrollRegion');
      expect(source).toContain(marker);
      expect(source).not.toContain('scrollbar-color:');
      expect(source).not.toContain('scrollbar-width:');
    },
  );

  it('preserves padding and layout on explicit viewport classes', () => {
    const sidebarSource = batchOneConsumers[1].source;
    const settingsSource = batchOneConsumers[5].source;

    expect(sidebarSource).toContain(
      'viewport-class="app-playlist-sidebar__scroll-viewport"',
    );
    expect(sidebarSource).toMatch(
      /\.app-playlist-sidebar__scroll\s+:deep\(\.app-playlist-sidebar__scroll-viewport\)\s*\{[^}]*padding:/su,
    );
    expect(settingsSource).toContain(
      'viewport-class="settings-view__viewport"',
    );
    expect(settingsSource).toMatch(
      /\.settings-view\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*gap:/su,
    );
  });

  it('shows Sidebar scrollbar chrome only while the full menu is expanded', () => {
    const sidebarSource = batchOneConsumers[1].source;

    expect(sidebarSource).toContain(
      ":scrollbar-visibility=\"sidebarCompact ? 'hidden' : 'auto'\"",
    );
  });

  it('uses the exposed scroll API when Queue changes tabs', () => {
    const queueSource = batchOneConsumers[2].source;

    expect(queueSource).toContain('scrollElement.value?.scrollTo({ top: 0 })');
  });

  it('keeps headings outside each content scroll range', () => {
    const modalSource = batchTwoConsumers[0].source;
    const popoverSource = batchTwoConsumers[3].source;
    const queueSource = batchOneConsumers[2].source;
    const settingsSource = batchOneConsumers[5].source;
    const trackTableSource = batchOneConsumers[3].source;

    expect(modalSource.indexOf('class="ui-modal__header"')).toBeLessThan(
      modalSource.indexOf('class="ui-modal__body"'),
    );
    expect(popoverSource.indexOf('class="ui-popover__header"')).toBeLessThan(
      popoverSource.indexOf('class="ui-popover__scroll"'),
    );
    expect(queueSource.indexOf('class="queue-panel__chrome"')).toBeLessThan(
      queueSource.indexOf('class="queue-panel__scroll"'),
    );
    expect(
      settingsSource.indexOf('class="settings-view__header"'),
    ).toBeLessThan(settingsSource.indexOf('class="settings-view__scroll"'));
    expect(
      trackTableSource.indexOf('class="studio-track-table__header"'),
    ).toBeLessThan(
      trackTableSource.indexOf('class="studio-track-table__body-scroll"'),
    );
  });

  it.each(batchTwoConsumers)(
    'migrates the $name compound scroll owner to the shared primitive',
    ({ source }) => {
      expect(source).toContain(
        "import UiScrollRegion from './UiScrollRegion.vue'",
      );
      expect(source).toContain('<UiScrollRegion');
      expect(source).not.toContain('scrollbar-color:');
      expect(source).not.toContain('scrollbar-width:');
    },
  );

  it('keeps list and navigation semantics on the native viewports', () => {
    const comboboxSource = batchTwoConsumers[1].source;
    const breadcrumbSource = batchTwoConsumers[4].source;

    expect(comboboxSource).toContain('viewport-tag="ul"');
    expect(comboboxSource).toContain('role="listbox"');
    expect(breadcrumbSource).toContain('viewport-tag="ol"');
    expect(breadcrumbSource).toContain('<nav class="ui-breadcrumb"');
  });

  it.each(batchThreeConsumers)(
    'migrates the $name scroll owner without leaving native overflow paint',
    ({ source }) => {
      expect(source).toContain('UiScrollRegion');
      expect(source).toContain('<UiScrollRegion');
      expect(source).not.toMatch(/overflow(?:-x|-y)?:\s*(?:auto|scroll);/u);
      expect(source).not.toContain('scrollbar-color:');
      expect(source).not.toContain('scrollbar-width:');
    },
  );

  it('keeps late-batch titles and navigation outside their content rails', () => {
    const referenceSource = batchThreeConsumers[1].source;
    const benchmarkSource = batchThreeConsumers[2].source;
    const providerFormSource = batchThreeConsumers[5].source;
    const splitLayoutSource = batchThreeConsumers[11].source;
    const demoSource = batchThreeConsumers[12].source;

    expect(
      referenceSource.indexOf('class="reference-annotation__case-header"'),
    ).toBeLessThan(
      referenceSource.indexOf('class="reference-annotation__detail-scroll"'),
    );
    expect(
      benchmarkSource.indexOf('class="benchmark-review__case-header"'),
    ).toBeLessThan(
      benchmarkSource.indexOf('class="benchmark-review__detail-scroll"'),
    );
    expect(
      providerFormSource.indexOf('class="review-form__header"'),
    ).toBeLessThan(
      providerFormSource.indexOf('class="review-form__comparison-scroll'),
    );
    expect(splitLayoutSource.indexOf('<slot name="side-header"')).toBeLessThan(
      splitLayoutSource.indexOf('class="obs-output-split-layout__side-scroll"'),
    );
    expect(demoSource.indexOf('class="demo-view__index"')).toBeLessThan(
      demoSource.indexOf('class="demo-view__scroll"'),
    );
  });

  it('limits native scrollbar suppression to the shared viewport', () => {
    expect(baseStyles).not.toContain('scrollbar-width: none');
    expect(baseStyles).not.toContain('*::-webkit-scrollbar');
  });
});

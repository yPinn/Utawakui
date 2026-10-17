import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const baseStyles = readSource('../../styles/base.css');

const batchOneConsumers = [
  {
    name: 'Folder page',
    source: readSource('../layout/AppFolderPage.vue'),
    marker: 'class="app-folder-page__scroll"',
    component: 'UiScrollLayout',
  },
  {
    name: 'playlist sidebar',
    source: readSource('../playlists/PlaylistSidebar.vue'),
    marker: 'class="playlist-sidebar__scroll"',
    component: 'UiScrollLayout',
  },
  {
    name: 'demo catalogue workspace',
    source: readSource('../demo/DemoCatalogueWorkspace.vue'),
    marker: 'class="demo-catalogue-workspace__scroll"',
    component: 'UiScrollLayout',
  },
];

const batchTwoConsumers = [
  { name: 'modal', source: readSource('./UiModal.vue') },
  { name: 'combobox', source: readSource('./UiCombobox.vue') },
  { name: 'action menu', source: readSource('./UiActionMenu.vue') },
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
    name: 'output template gallery',
    source: readSource('../output/ObsTemplateGallery.vue'),
    component: 'UiScrollLayout',
  },
  {
    name: 'output slot workbench',
    source: readSource('../output/ObsSlotWorkbench.vue'),
  },
  {
    name: 'output split layout',
    source: readSource('../output/ObsOutputSplitLayout.vue'),
    component: 'UiScrollLayout',
  },
];

describe('UiScrollRegion production migration', () => {
  it.each(batchOneConsumers)(
    'migrates the $name scroll owner without keeping native scrollbar paint',
    ({ source, marker, component }) => {
      expect(source).toContain(component);
      expect(source).toContain(`<${component}`);
      expect(source).toContain(marker);
      expect(source).not.toContain('scrollbar-color:');
      expect(source).not.toContain('scrollbar-width:');
    },
  );

  it('preserves padding and layout at the composition layer or explicit viewport', () => {
    const folderPageSource = batchOneConsumers[0].source;
    const sidebarSource = batchOneConsumers[1].source;
    const settingsSource = readSource('../../views/SettingsView.vue');
    const settingsPageSource = readSource('../../pages/SettingsPage.vue');

    expect(folderPageSource).toMatch(
      /\.app-folder-page__scroll\s*\{[^}]*--ui-scroll-layout-padding-block-end:/su,
    );
    expect(folderPageSource).not.toMatch(
      /(?:^|\n)\.app-folder-page__body\s*\{[^}]*padding(?:-|:)/su,
    );
    expect(folderPageSource).toMatch(
      /\.app-folder-page__body--document\s*\{[^}]*padding-block-start:/su,
    );
    expect(sidebarSource).toMatch(
      /\.playlist-sidebar__scroll\s*\{[^}]*--ui-scroll-layout-padding-block-start:/su,
    );
    expect(sidebarSource).not.toContain('playlist-sidebar__scroll-viewport');
    expect(settingsPageSource).toContain('<AppFolderPage mode="document"');
    expect(settingsSource).not.toContain('<UiScrollLayout');
    expect(settingsSource).not.toContain('<UiScrollRegion');
    expect(settingsSource).toMatch(
      /\.settings-view\s*\{[^}]*display:\s*grid;[^}]*gap:/su,
    );
  });

  it('shows Sidebar scrollbar chrome only while the full menu is expanded', () => {
    const sidebarSource = batchOneConsumers[1].source;

    expect(sidebarSource).toContain(
      ":scrollbar-visibility=\"compact ? 'hidden' : 'auto'\"",
    );
  });

  it('uses the exposed scroll API when Queue changes tabs', () => {
    const queueSource = readSource('../queue/QueuePanel.vue');
    const dockPanelSource = readSource('../layout/AppRightDockPanel.vue');

    expect(queueSource).toContain('dockPanel.value?.scrollTo({ top: 0 })');
    expect(dockPanelSource).toContain('defineExpose({ scrollTo })');
  });

  it('keeps headings outside each content scroll range', () => {
    const modalSource = batchTwoConsumers[0].source;
    const popoverSource = batchTwoConsumers[3].source;
    const dockPanelSource = readSource('../layout/AppRightDockPanel.vue');
    const settingsSource = readSource('../../views/SettingsView.vue');
    const settingsPageSource = readSource('../../pages/SettingsPage.vue');
    const trackTableSource = readSource('../track/TrackTable.vue');

    expect(modalSource.indexOf('class="ui-modal__header"')).toBeLessThan(
      modalSource.indexOf('class="ui-modal__body"'),
    );
    expect(popoverSource.indexOf('class="ui-popover__header"')).toBeLessThan(
      popoverSource.indexOf('class="ui-popover__scroll"'),
    );
    expect(
      dockPanelSource.indexOf('class="app-right-dock-panel__chrome"'),
    ).toBeLessThan(
      dockPanelSource.indexOf('class="app-right-dock-panel__scroll"'),
    );
    expect(settingsSource).not.toContain('class="settings-view__header"');
    expect(settingsPageSource.indexOf('<template #header>')).toBeLessThan(
      settingsPageSource.indexOf('<SettingsView />'),
    );
    expect(
      trackTableSource.indexOf('class="library-track-table__header"'),
    ).toBeLessThan(
      trackTableSource.indexOf('class="library-track-table__body"'),
    );
  });

  it('centralizes Right Dock scrolling in the shared panel compound', () => {
    const dockPanelSource = readSource('../layout/AppRightDockPanel.vue');
    const featureSources = [
      readSource('../queue/QueuePanel.vue'),
      readSource('../playback/context/TrackContextPanel.vue'),
    ];

    const scrollLayoutSource = readSource('./UiScrollLayout.vue');

    expect(dockPanelSource).toContain('<UiScrollLayout');
    expect(scrollLayoutSource).toContain('<UiScrollRegion');
    for (const source of featureSources) {
      expect(source).toContain('AppRightDockPanel');
      expect(source).not.toContain('<UiScrollRegion');
    }
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
    ({ source, component = 'UiScrollRegion' }) => {
      expect(source).toContain(component);
      expect(source).toContain(`<${component}`);
      expect(source).not.toMatch(/overflow(?:-x|-y)?:\s*(?:auto|scroll);/u);
      expect(source).not.toContain('scrollbar-color:');
      expect(source).not.toContain('scrollbar-width:');
    },
  );

  it('keeps late-batch titles and navigation outside their content rails', () => {
    const referenceSource = batchThreeConsumers[1].source;
    const benchmarkSource = batchThreeConsumers[2].source;
    const providerFormSource = batchThreeConsumers[5].source;
    const splitLayoutSource = batchThreeConsumers[8].source;
    const demoSource = batchOneConsumers[2].source;

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
    expect(
      demoSource.indexOf('class="demo-catalogue-workspace__tabs"'),
    ).toBeLessThan(
      demoSource.indexOf('class="demo-catalogue-workspace__scroll"'),
    );
  });

  it('delegates lyrics provider strata overflow to the shared segmented primitive', () => {
    const strataSource = readSource(
      '../lyrics-provider/LyricsProviderReviewStrata.vue',
    );

    expect(strataSource).toContain('<UiSegmentedControl');
    expect(strataSource).not.toContain('<UiTabs');
    expect(strataSource).not.toMatch(/overflow(?:-x|-y)?:\s*(?:auto|scroll);/u);
  });

  it('limits native scrollbar suppression to the shared viewport', () => {
    expect(baseStyles).not.toContain('scrollbar-width: none');
    expect(baseStyles).not.toContain('*::-webkit-scrollbar');
  });
});

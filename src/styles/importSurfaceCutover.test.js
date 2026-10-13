import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const libraryPageSource = readSource('../pages/LibraryPage.vue');
const dockSource = readSource('../components/import/ImportDockContent.vue');
const preparationSource = readSource(
  '../components/preparation/PreparationDockPanel.vue',
);
const rowSource = readSource('../components/import/ImportSourceRow.vue');
const reviewSource = readSource('../components/import/ImportReviewModal.vue');
const collectionReviewSource = readSource(
  '../components/import/ImportCollectionReview.vue',
);
const collectionStatusSource = readSource(
  '../components/import/ImportCollectionTrackStatus.vue',
);
const trackTableSource = readSource('../components/track/TrackTable.vue');
const providerSource = readSource(
  '../components/import/ProviderImportPanel.vue',
);

describe('Import Token v2 surface cutover', () => {
  it('keeps quick import in the retained Right Dock instead of a Folder page', () => {
    expect(appSource).toContain('<PreparationDockPanel');
    expect(appSource).toContain('RIGHT_DOCK_SURFACE_PREPARATION');
    expect(libraryPageSource).not.toContain('ImportWorkspace');
    expect(libraryPageSource).not.toContain("surfaceId: 'import'");
    expect(preparationSource).toContain('<AppRightDockPanel');
    expect(preparationSource).toContain('collapse-label="摺疊曲目準備"');
    expect(dockSource).not.toContain('AppRightDockPanel');
  });

  it('uses the shared track row and Dock section density for result objects', () => {
    expect(dockSource).toContain('<AppRightDockSection heading="本機音訊"');
    expect(dockSource).toContain('<AppRightDockSection heading="外部來源"');
    expect(dockSource).toContain('<ImportSourceRow');
    expect(rowSource).toContain('<UiTrackRow');
    expect(rowSource).toContain('state-surface');
    expect(rowSource).not.toContain('QueueTrackButton');
    expect(rowSource).not.toContain('UiTrackThumb');
  });

  it('uses shared icon actions and avoids a bespoke full-width Dock button', () => {
    expect(dockSource).toContain('<UiIconButton');
    expect(dockSource).not.toContain('<UiButton');
    expect(dockSource).not.toContain('import-dock-panel__full-action');
  });

  it('keeps dense collection review in the wide modal', () => {
    expect(dockSource).toContain('<ImportReviewModal');
    expect(reviewSource).toContain('size="wide"');
    expect(reviewSource).not.toContain('fixed-height');
    expect(reviewSource).toContain('<ImportCollectionReview />');
    expect(reviewSource).toContain('<template #footer>');
    expect(reviewSource).not.toContain('ProviderImportPanel');
    expect(collectionReviewSource).toContain('<UiSegmentedControl');
    expect(collectionReviewSource).not.toContain('UiScroll');
    expect(collectionReviewSource).toContain('@click="retryFailedTracks"');
    expect(collectionReviewSource).toContain('<UiTrackRow');
    expect(collectionReviewSource).toContain('state-surface');
    expect(collectionReviewSource).toContain('<UiCheckbox');
    expect(collectionStatusSource).toContain('<UiStatusIcon');
    expect(collectionReviewSource).not.toContain('<TrackTable');
    expect(trackTableSource).not.toContain("props.variant === 'review'");
  });

  it('uses only formal v2 token names throughout the Import surface', () => {
    for (const source of [
      dockSource,
      rowSource,
      collectionReviewSource,
      collectionStatusSource,
      trackTableSource,
      providerSource,
    ]) {
      expect(source).not.toContain('var(--ui-radius)');
      expect(source).not.toContain('var(--ui-font-weight-strong)');
    }
  });
});

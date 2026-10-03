const fixture = (id, violations) => ({
  id,
  ready: violations.length === 0,
  violations: violations.toSorted(),
});

export function evaluateTokenV2ScopeReadiness(inventory) {
  const { activation } = inventory;
  const tokenEntriesUseDocumentRoot =
    activation.tokenEntries.v1DocumentRootSelectors > 0 ||
    activation.tokenEntries.v2DocumentRootSelectors > 0;
  const invalidationIsInactive =
    activation.generatedInvalidationImports.length === 0;
  const fixtures = [
    fixture(
      'no-t1-isolation',
      [
        activation.baseVisualTokenReferences.length > 0 &&
          'base-visual-token-consumers',
        invalidationIsInactive && 'generated-invalidation-inactive',
        tokenEntriesUseDocumentRoot && 'token-entries-document-root',
      ].filter(Boolean),
    ),
    ...['mixed-v1-to-v2', 'mixed-v2-to-v1'].map((id) =>
      fixture(
        id,
        [
          invalidationIsInactive && 'generated-invalidation-inactive',
          activation.rootBoundRecipeOccurrences > 0 &&
            'shared-recipes-document-root',
        ].filter(Boolean),
      ),
    ),
    fixture(
      'metadata-projection',
      [tokenEntriesUseDocumentRoot && 'token-entries-document-root'].filter(
        Boolean,
      ),
    ),
    fixture(
      'portal-owner',
      [
        activation.teleports.productionCount + activation.teleports.demoCount >
          0 && 'body-teleport-targets',
      ].filter(Boolean),
    ),
    fixture(
      'review-surface',
      [
        activation.documentSystemWriters.length > 0 &&
          'document-review-writers',
        activation.documentSpecimenMarkers.length > 0 &&
          'document-specimen-markers',
        activation.prototypeDocumentRoots.length > 0 &&
          'prototype-document-roots',
        activation.reviewComposable.current !==
          activation.reviewComposable.target && 'review-composable-name',
      ].filter(Boolean),
    ),
  ];

  return {
    fixtures,
    ready: fixtures.every(({ ready }) => ready),
  };
}

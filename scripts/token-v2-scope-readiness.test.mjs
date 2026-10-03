import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTokenV2MigrationInventory } from './token-v2-migration-inventory.mjs';
import { evaluateTokenV2ScopeReadiness } from './token-v2-scope-readiness.mjs';

const root = resolve(import.meta.dirname, '..');
const readiness = evaluateTokenV2ScopeReadiness(
  buildTokenV2MigrationInventory({ root }),
);

function fixture(id) {
  return readiness.fixtures.find((candidate) => candidate.id === id);
}

describe('Token v2 scope readiness fixtures', () => {
  it('defines every proof required by the atomic activation gate', () => {
    expect(readiness.fixtures.map(({ id }) => id)).toEqual([
      'no-t1-isolation',
      'mixed-v1-to-v2',
      'mixed-v2-to-v1',
      'metadata-projection',
      'portal-owner',
      'review-surface',
    ]);
    expect(readiness.ready).toBe(false);
    expect(readiness.fixtures.every(({ ready }) => ready === false)).toBe(true);
  });

  it('keeps isolation and both nesting directions blocked until one cutover', () => {
    expect(fixture('no-t1-isolation').violations).toEqual([
      'base-visual-token-consumers',
      'generated-invalidation-inactive',
      'token-entries-document-root',
    ]);
    for (const id of ['mixed-v1-to-v2', 'mixed-v2-to-v1']) {
      expect(fixture(id).violations).toEqual([
        'generated-invalidation-inactive',
        'shared-recipes-document-root',
      ]);
    }
  });

  it('keeps metadata, portal, and review ownership individually diagnosable', () => {
    expect(fixture('metadata-projection').violations).toEqual([
      'token-entries-document-root',
    ]);
    expect(fixture('portal-owner').violations).toEqual([
      'body-teleport-targets',
    ]);
    expect(fixture('review-surface').violations).toEqual([
      'document-review-writers',
      'document-specimen-markers',
      'prototype-document-roots',
      'review-composable-name',
    ]);
  });
});

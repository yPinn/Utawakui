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
    expect(readiness.ready).toBe(true);
    expect(readiness.fixtures.every(({ ready }) => ready === true)).toBe(true);
  });

  it('proves isolation and both nesting directions in one cutover', () => {
    expect(fixture('no-t1-isolation').violations).toEqual([]);
    for (const id of ['mixed-v1-to-v2', 'mixed-v2-to-v1']) {
      expect(fixture(id).violations).toEqual([]);
    }
  });

  it('proves metadata, portal, and review ownership independently', () => {
    expect(fixture('metadata-projection').violations).toEqual([]);
    expect(fixture('portal-owner').violations).toEqual([]);
    expect(fixture('review-surface').violations).toEqual([]);
  });
});

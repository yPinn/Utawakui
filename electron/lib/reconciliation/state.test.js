import { expect, it } from 'vitest';
import { reconciliationState, resolveRedirect } from './state.js';
const state = () => ({
  version: 1,
  redirects: {},
  decisions: [],
  merges: [],
  pendingReleases: [],
});
it('keeps bounded redirect chains and returns a detached state', () => {
  const raw = state();
  raw.redirects = { a: 'b', b: 'c' };
  expect(resolveRedirect(raw.redirects, 'a')).toBe('c');
  const copy = reconciliationState({ reconciliation: raw });
  copy.redirects.a = 'd';
  expect(raw.redirects.a).toBe('b');
  expect(reconciliationState({}).pendingReleases).toEqual([]);
});
it.each([
  { ...state(), version: 2 },
  { ...state(), redirects: { a: 'a' } },
  { ...state(), redirects: { a: 'b', b: 'a' } },
  { ...state(), decisions: [{ evidence: 'bad', action: 'dismiss' }] },
  { ...state(), decisions: [{ evidence: 'a'.repeat(64), action: 'invalid' }] },
  { ...state(), pendingReleases: [{ id: 'x', kind: 'playlist' }] },
  { ...state(), merges: null },
  { ...state(), decisions: Array(5001).fill({}) },
])('refuses unknown/corrupt decision state %#', (raw) =>
  expect(() => reconciliationState({ reconciliation: raw })).toThrow(),
);
it('accepts a persisted dismissal and an offline source proposal', () => {
  const raw = state();
  raw.decisions = [{ evidence: 'a'.repeat(64), action: 'dismiss' }];
  raw.pendingReleases = [{ id: 'proposal', kind: 'album' }];
  expect(reconciliationState({ reconciliation: raw })).toEqual(raw);
});

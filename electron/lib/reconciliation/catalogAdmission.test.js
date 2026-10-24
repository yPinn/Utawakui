import { expect, it } from 'vitest';
import { needsLocalReleaseReview } from './catalogAdmission.js';
const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const local = () => ({
  id: 'local',
  kind: 'album',
  trackIds: ['one'],
  releaseInfo: {
    revision: 0,
    observed: {},
    overrides: { type: 'single' },
    localMemberBindings: { one: binding },
  },
});
const proposal = () => ({
  id: 'source',
  kind: 'album',
  trackIds: ['one'],
  releaseInfo: {
    catalog: {
      manifest: {
        completeness: 'complete',
        reportedTotal: 1,
        type: 'single',
        slots: [
          { position: 1, videoId: 'one', title: 'Song', artist: 'Artist' },
        ],
      },
      links: {
        'slot-1': {
          trackId: 'one',
          slotIdentity: JSON.stringify(['one', 'Song', 'Artist']),
        },
      },
      bindings: { one: binding },
      rejected: [],
    },
  },
});
it('defers only a complete, bound source matching the existing local release', () => {
  expect(needsLocalReleaseReview([local()], proposal())).toBe(true);
  const p = proposal();
  p.releaseInfo.catalog.manifest.type = 'ep';
  expect(needsLocalReleaseReview([local()], p)).toBe(false);
  const l = local();
  l.releaseInfo.localMemberBindings.one = null;
  expect(needsLocalReleaseReview([l], proposal())).toBe(false);
  expect(needsLocalReleaseReview([local()], { trackIds: ['one'] })).toBe(false);
});
it.each([
  'partial',
  'missing-link',
  'changed-slot',
  'rejected',
  'partial-members',
])('does not auto-assume a %s proposal', (mode) => {
  const p = proposal(),
    c = p.releaseInfo.catalog;
  if (mode === 'partial') c.manifest.completeness = 'partial';
  if (mode === 'missing-link') c.links = {};
  if (mode === 'changed-slot') c.manifest.slots[0].title = 'Changed';
  if (mode === 'rejected') c.rejected = ['one'];
  if (mode === 'partial-members') c.manifest.reportedTotal = 2;
  expect(needsLocalReleaseReview([local()], p)).toBe(false);
});

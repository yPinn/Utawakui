'use strict';

const { bindingsEqual } = require('../works/trackBinding');
const { resolveReleaseInfo } = require('../releases/schema');
const { slotIdentity } = require('../releases/catalog');

// A matching local release requires review, not silent promotion. Store the
// source proposal outside the visible collection list until it is accepted.
function needsLocalReleaseReview(collections, proposed) {
  const catalog = proposed.releaseInfo?.catalog;
  if (
    !catalog ||
    catalog.manifest.completeness !== 'complete' ||
    catalog.manifest.reportedTotal !== proposed.trackIds.length
  )
    return false;
  if (
    !catalog.manifest.slots.every((slot) => {
      const link = catalog.links[`slot-${slot.position}`];
      return (
        link &&
        link.slotIdentity === slotIdentity(slot) &&
        !catalog.rejected.includes(link.trackId)
      );
    }) ||
    new Set(Object.values(catalog.links).map((link) => link.trackId)).size !==
      proposed.trackIds.length
  )
    return false;
  return collections.some(
    (local) =>
      local.kind === 'album' &&
      !local.source &&
      local.trackIds.length === proposed.trackIds.length &&
      resolveReleaseInfo(local).type === catalog.manifest.type &&
      local.trackIds.every(
        (id) =>
          proposed.trackIds.includes(id) &&
          bindingsEqual(
            local.releaseInfo?.localMemberBindings?.[id],
            catalog.bindings[id],
          ),
      ),
  );
}

module.exports = { needsLocalReleaseReview };

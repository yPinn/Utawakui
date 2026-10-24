import { reactive } from 'vue';

// Public action admission only. Presentation uses saved associations and the
// canonical library, never this operation cache.
export function createReleaseMembershipProjection() {
  return reactive({
    cache: new Map(),
    admitted: new Map(),
    pending: new Set(),
    errors: new Map(),
    error: '',
  });
}
export const releaseMembershipProjection = createReleaseMembershipProjection();
export function releaseMembershipKey(collection) {
  return JSON.stringify([
    collection?.releaseLibraryEpoch ?? null,
    collection?.id,
    collection?.resolvedRelease?.revision ?? 0,
    collection?.trackIds ?? [],
  ]);
}
export function projectAdmittedReleaseTrackIds(
  collection,
  state = releaseMembershipProjection,
) {
  if (!collection) return [];
  if (!collection.requiresMembershipVerification)
    return collection.availableTrackIds ?? collection.trackIds ?? [];
  const key = releaseMembershipKey(collection);
  const allowed = new Set([
    ...(state.cache.get(key) ?? []),
    ...(state.admitted.get(key) ?? []),
  ]);
  return (collection.trackIds ?? []).filter((id) => allowed.has(id));
}

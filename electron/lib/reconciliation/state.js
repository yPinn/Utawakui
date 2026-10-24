'use strict';

const { failure, record, identifier } = require('./documents');

function reconciliationState(data) {
  if (data.reconciliation === undefined)
    return {
      version: 1,
      redirects: {},
      decisions: [],
      merges: [],
      pendingReleases: [],
    };
  const state = data.reconciliation;
  record(state, [
    'version',
    'redirects',
    'decisions',
    'merges',
    'pendingReleases',
  ]);
  record(state.redirects);
  if (
    state.version !== 1 ||
    !Array.isArray(state.decisions) ||
    state.decisions.length > 5000 ||
    !Array.isArray(state.merges) ||
    state.merges.length > 500 ||
    !Array.isArray(state.pendingReleases) ||
    state.pendingReleases.length > 500
  )
    throw failure('RECONCILIATION_UNAVAILABLE');
  for (const [from, to] of Object.entries(state.redirects)) {
    identifier(from);
    identifier(to);
  }
  if (Object.keys(state.redirects).length > 5000)
    throw failure('RECONCILIATION_LIMIT');
  for (const from of Object.keys(state.redirects))
    resolveRedirect(state.redirects, from);
  for (const decision of state.decisions) {
    record(decision, ['evidence', 'action']);
    if (
      !/^[a-f0-9]{64}$/.test(decision.evidence) ||
      !['dismiss', 'review'].includes(decision.action)
    )
      throw failure();
  }
  for (const entry of state.pendingReleases) {
    record(entry);
    identifier(entry.id);
    if (entry.kind !== 'album') throw failure();
  }
  return structuredClone(state);
}
function resolveRedirect(redirects, input) {
  identifier(input);
  let id = input;
  const seen = new Set();
  while (Object.hasOwn(redirects, id)) {
    if (seen.has(id) || seen.size >= 500)
      throw failure('RECONCILIATION_UNAVAILABLE');
    seen.add(id);
    id = identifier(redirects[id]);
  }
  return id;
}

module.exports = { reconciliationState, resolveRedirect };

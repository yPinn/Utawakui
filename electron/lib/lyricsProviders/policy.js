'use strict';

const LYRICS_PROVIDER_POLICIES = Object.freeze({
  lrclib: Object.freeze({
    id: 'lrclib',
    manualSearch: true,
    automaticDiscovery: true,
    automaticSave: true,
    automaticMatchBand: 'exact',
  }),
  netease: Object.freeze({
    id: 'netease',
    manualSearch: true,
    automaticDiscovery: true,
    automaticSave: true,
    automaticMatchBand: 'exact',
  }),
  betterlyrics: Object.freeze({
    id: 'betterlyrics',
    manualSearch: true,
    automaticDiscovery: false,
    automaticSave: false,
    automaticMatchBand: null,
  }),
});

const MANUAL_LYRICS_PROVIDER_IDS = Object.freeze(
  Object.values(LYRICS_PROVIDER_POLICIES)
    .filter((policy) => policy.manualSearch)
    .map((policy) => policy.id),
);
const AUTOMATIC_LYRICS_PROVIDER_IDS = Object.freeze(
  Object.values(LYRICS_PROVIDER_POLICIES)
    .filter((policy) => policy.automaticDiscovery && policy.automaticSave)
    .map((policy) => policy.id),
);

function lyricsProviderPolicy(providerId) {
  return LYRICS_PROVIDER_POLICIES[providerId] || null;
}

module.exports = {
  AUTOMATIC_LYRICS_PROVIDER_IDS,
  MANUAL_LYRICS_PROVIDER_IDS,
  lyricsProviderPolicy,
};

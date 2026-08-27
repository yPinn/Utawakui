export const LYRICS_CORPUS_STRATA = Object.freeze([
  Object.freeze({
    id: 'chinese-rap',
    languageTag: 'mandarin',
    allowedLanguageTags: Object.freeze([
      'mandarin',
      'cantonese',
      'multilingual',
    ]),
  }),
  Object.freeze({
    id: 'chinese-pop',
    languageTag: 'mandarin',
    allowedLanguageTags: Object.freeze([
      'mandarin',
      'cantonese',
      'multilingual',
    ]),
  }),
  Object.freeze({
    id: 'english-catalog',
    languageTag: 'english',
    allowedLanguageTags: Object.freeze(['english', 'multilingual']),
  }),
  Object.freeze({
    id: 'japanese-catalog',
    languageTag: 'japanese',
    allowedLanguageTags: Object.freeze(['japanese', 'multilingual']),
  }),
  Object.freeze({
    id: 'korean-catalog',
    languageTag: 'korean',
    allowedLanguageTags: Object.freeze(['korean', 'multilingual']),
  }),
]);

export const LYRICS_CORPUS_STRATA_BY_ID = new Map(
  LYRICS_CORPUS_STRATA.map((stratum) => [stratum.id, stratum]),
);

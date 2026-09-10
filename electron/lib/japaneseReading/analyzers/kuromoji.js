'use strict';

const KUROMOJI_POS_FIELDS = [
  'pos',
  'pos_detail_1',
  'pos_detail_2',
  'pos_detail_3',
];

function adaptKuromojiToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'object') {
    throw new TypeError('kuromoji token must be an object');
  }
  if (
    typeof rawToken.surface_form !== 'string' ||
    rawToken.surface_form.length === 0
  ) {
    throw new TypeError('kuromoji token surface must be a non-empty string');
  }
  if (
    rawToken.reading !== undefined &&
    rawToken.reading !== null &&
    typeof rawToken.reading !== 'string'
  ) {
    throw new TypeError('kuromoji token reading must be a string when present');
  }

  const partOfSpeech = KUROMOJI_POS_FIELDS.map(
    (field) => rawToken[field],
  ).filter(
    (value) => typeof value === 'string' && value.length > 0 && value !== '*',
  );
  const lemma =
    typeof rawToken.basic_form === 'string' && rawToken.basic_form !== '*'
      ? rawToken.basic_form
      : null;

  return {
    surface: rawToken.surface_form,
    reading: rawToken.reading ?? null,
    partOfSpeech,
    lemma,
    outOfVocabulary: rawToken.word_type === 'UNKNOWN',
  };
}

function createKuromojiTokenizer(rawTokenizer) {
  if (!rawTokenizer || typeof rawTokenizer.tokenize !== 'function') {
    throw new TypeError('kuromoji tokenizer must expose tokenize(text)');
  }

  return (text) => {
    const rawTokens = rawTokenizer.tokenize(text);
    if (!Array.isArray(rawTokens)) {
      throw new TypeError('kuromoji tokenizer result must be an array');
    }
    return rawTokens.map(adaptKuromojiToken);
  };
}

function buildKuromojiTokenizer(kuromoji, dicPath) {
  if (!kuromoji || typeof kuromoji.builder !== 'function') {
    return Promise.reject(new TypeError('kuromoji module is unavailable'));
  }
  if (typeof dicPath !== 'string' || !dicPath) {
    return Promise.reject(new TypeError('kuromoji dictionary path is invalid'));
  }

  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((error, tokenizer) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(createKuromojiTokenizer(tokenizer));
      } catch (validationError) {
        reject(validationError);
      }
    });
  });
}

module.exports = {
  adaptKuromojiToken,
  buildKuromojiTokenizer,
  createKuromojiTokenizer,
};

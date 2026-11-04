'use strict';

const {
  compile,
  createCoreContext,
  fallbackWithLocaleChain,
  registerLocaleFallbacker,
  registerMessageCompiler,
  registerMessageResolver,
  resolveValue,
  translate,
} = require('@intlify/core-base');
const { fallbackLocale } = require('../../shared/uiLocaleValues.json');
const { readLocaleCatalogs } = require('./localeCatalogs');
const { PSEUDO_LOCALE, pseudoText } = require('../../shared/pseudoLocale.mjs');
const { getUiLocale } = require('./uiLocale');

// Same catalogs and message syntax as the renderer's vue-i18n.
registerMessageCompiler(compile);
registerMessageResolver(resolveValue);
registerLocaleFallbacker(fallbackWithLocaleChain);

let context = null;

// Created on first use, after main has resolved the launch locale.
function coreContext() {
  if (context) return context;
  const messages = readLocaleCatalogs();
  if (getUiLocale() === PSEUDO_LOCALE) {
    messages[PSEUDO_LOCALE] = messages['en-US'];
  }
  context = createCoreContext({
    locale: getUiLocale(),
    fallbackLocale,
    messages,
  });
  return context;
}

function t(key, named = {}) {
  const message = translate(coreContext(), key, named);
  return getUiLocale() === PSEUDO_LOCALE ? pseudoText(message) : message;
}

function hasMessage(key) {
  const { messages } = coreContext();
  return [getUiLocale(), fallbackLocale].some(
    (locale) => typeof resolveValue(messages[locale] ?? {}, key) === 'string',
  );
}

module.exports = { hasMessage, t };

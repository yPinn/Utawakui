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
const { getUiLocale } = require('./uiLocale');

// Same catalogs and message syntax as the renderer's vue-i18n.
registerMessageCompiler(compile);
registerMessageResolver(resolveValue);
registerLocaleFallbacker(fallbackWithLocaleChain);

let context = null;

// Created on first use, after main has resolved the launch locale.
function t(key, named = {}) {
  context ??= createCoreContext({
    locale: getUiLocale(),
    fallbackLocale,
    messages: readLocaleCatalogs(),
  });
  return translate(context, key, named);
}

module.exports = { t };

'use strict';

const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  { ignores: ['coverage/**', 'dist/**', 'node_modules/**'] },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['electron/**/*.js', 'scripts/**/*.{js,cjs}', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: ['electron/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  eslintConfigPrettier,
];

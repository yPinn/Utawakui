'use strict';

const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'tasks/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: [
      'electron/**/*.js',
      'shared/**/*.js',
      'scripts/**/*.{js,cjs}',
      '*.config.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['electron/**/*.test.js', 'shared/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['overlay/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['overlay/**/*.test.js'],
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

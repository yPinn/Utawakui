'use strict';

const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**'] },
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
    // Vitest can only be imported via ESM `import`, not `require()` — test
    // files still exercise the CJS source modules next to them (Vite/Vitest
    // handles the CJS interop), so this only flips the parser's sourceType,
    // not the Node globals the rest of electron/**/*.js gets.
    files: ['electron/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{js,vue}', 'public/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  eslintConfigPrettier,
];

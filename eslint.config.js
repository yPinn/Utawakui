'use strict';

const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

const I18N_MIGRATED = [
  'src/components/ui/**/*.{js,vue}',
  'src/components/layout/**/*.{js,vue}',
  'src/App.vue',
  'src/composables/{useAppConfirmation,useAppNotifications,useAppRightDock,usePanelView,useWindowCloseDecision}.js',
  'electron/main/{rendererRecovery,windowsTrayController}.js',
  'electron/main/windows/mainWindow.js',
];
const CJK_TEXT = '/[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]/u';
const HARDCODED_UI_TEXT =
  'Hardcoded UI text: add it to shared/locales and read it with t() (AGENTS.md "UI Text And Locale").';

module.exports = [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'runtime/**',
      '.tmp/**',
      'release/**',
      'release-*/**',
      'node_modules/**',
      'tasks/**',
      'prototypes/**/.build/**',
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
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs'],
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
  {
    // Cloudflare Workers runtime: ES modules, web-standard globals (fetch,
    // Request/Response, FormData, TextEncoder) — not Node, not a browser.
    files: ['services/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.worker,
    },
  },
  {
    // Migrated to shared/locales; scripts/uiLiteralRatchet.js guards the rest.
    files: I18N_MIGRATED,
    ignores: ['**/*.test.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${CJK_TEXT}]`, message: HARDCODED_UI_TEXT },
        {
          selector: `TemplateElement[value.raw=${CJK_TEXT}]`,
          message: HARDCODED_UI_TEXT,
        },
      ],
      'vue/no-restricted-syntax': [
        'error',
        {
          // Template text only; <script> and <style> bodies are not UI text.
          selector: `VElement[name!=/^(?:script|style)$/] > VText[value=${CJK_TEXT}]`,
          message: HARDCODED_UI_TEXT,
        },
        { selector: `VLiteral[value=${CJK_TEXT}]`, message: HARDCODED_UI_TEXT },
      ],
    },
  },
  eslintConfigPrettier,
];

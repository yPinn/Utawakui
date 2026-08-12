'use strict';

const scopes = [
  'agents',
  'app',
  'audio',
  'build',
  'ci',
  'config',
  'deps',
  'design',
  'docs',
  'electron',
  'import',
  'library',
  'lyrics',
  'overlay',
  'playback',
  'playlists',
  'product',
  'queue',
  'styles',
  'tests',
  'tooling',
  'ui',
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'scope-enum': [2, 'always', scopes],
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
};

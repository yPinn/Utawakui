import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FULL_PATH_POLICY = Object.freeze({
  dependencyAudit: true,
  quality: true,
  windowsPackage: true,
});

const SKIPPED_PLAN = Object.freeze({
  dependencyAudit: false,
  quality: false,
  coverage: false,
  windowsPackage: false,
});

const DOCUMENTATION_PATTERNS = [
  /^docs\//u,
  /^(?:AGENTS|CLAUDE|DESIGN|README)\.md$/u,
];

const DEPENDENCY_PATTERNS = [/^package(?:-lock)?\.json$/u];

const CI_CONTROL_PATTERNS = [
  /^\.github\/workflows\//u,
  /^scripts\/ci-changed-paths(?:\.test)?\.mjs$/u,
  /^scripts\/(?:ci|release)-workflow\.test\.mjs$/u,
];

const WINDOWS_PACKAGE_PATTERNS = [
  /^build\//u,
  /^electron\//u,
  /^overlay\//u,
  /^resources\//u,
  /^shared\//u,
  /^electron-builder\.yml$/u,
  /^(?:LICENSE|THIRD_PARTY_NOTICES)\.md$/u,
  /^scripts\/release-contract(?:-cli|\.test)?\.mjs$/u,
  /^scripts\/verify-unsigned-windows-package\.ps1$/u,
  /^scripts\/windows-installed-acceptance\.ps1$/u,
];

const QUALITY_ONLY_PATTERNS = [
  /^public\//u,
  /^src\//u,
  /^commitlint\.config\.js$/u,
  /^eslint\.config\.js$/u,
  /^index\.html$/u,
  /^vite\.config\.js$/u,
  /^vitest\.config\.js$/u,
];

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function normalizePath(path) {
  return String(path).replaceAll('\\', '/').replace(/^\.\//u, '');
}

function fullPathPolicy() {
  return { ...FULL_PATH_POLICY };
}

export function classifyChangedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return fullPathPolicy();
  }

  const policy = {
    dependencyAudit: false,
    quality: false,
    windowsPackage: false,
  };

  for (const rawPath of paths) {
    const path = normalizePath(rawPath);

    if (!path || path.startsWith('/') || path.includes('../')) {
      return fullPathPolicy();
    }
    if (matchesAny(path, DOCUMENTATION_PATTERNS)) {
      continue;
    }

    policy.quality = true;

    if (
      matchesAny(path, DEPENDENCY_PATTERNS) ||
      matchesAny(path, CI_CONTROL_PATTERNS)
    ) {
      policy.dependencyAudit = true;
      policy.windowsPackage = true;
      continue;
    }
    if (matchesAny(path, WINDOWS_PACKAGE_PATTERNS)) {
      policy.windowsPackage = true;
      continue;
    }
    if (matchesAny(path, QUALITY_ONLY_PATTERNS)) {
      continue;
    }

    return fullPathPolicy();
  }

  return policy;
}

export function createCiPlan({ eventName, isDraft = false, paths }) {
  if (eventName === 'workflow_dispatch') {
    return {
      ...fullPathPolicy(),
      coverage: true,
    };
  }
  if (eventName === 'pull_request' && isDraft) {
    return { ...SKIPPED_PLAN };
  }
  if (eventName !== 'pull_request' && eventName !== 'push') {
    return {
      ...fullPathPolicy(),
      coverage: true,
    };
  }

  const pathPolicy = classifyChangedPaths(paths);

  return {
    ...pathPolicy,
    quality: eventName === 'push' ? true : pathPolicy.quality,
    coverage: eventName === 'push',
  };
}

export function formatGitHubOutputs(plan) {
  return [
    `dependency_audit=${String(plan.dependencyAudit)}`,
    `quality=${String(plan.quality)}`,
    `coverage=${String(plan.coverage)}`,
    `windows_package=${String(plan.windowsPackage)}`,
  ].join('\n');
}

export function readChangedPaths(baseSha, headSha, run = spawnSync) {
  const commitPattern = /^[a-f0-9]{40}$/u;
  if (!commitPattern.test(baseSha) || !commitPattern.test(headSha)) {
    return [];
  }

  const result = run(
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      '--diff-filter=ACDMRTUXB',
      baseSha,
      headSha,
      '--',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write('Changed-path lookup failed; using full CI policy.\n');
    return [];
  }

  return result.stdout.split('\0').filter(Boolean);
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      return new Map();
    }
    values.set(name.slice(2), value);
  }
  return values;
}

function runCli() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const eventName = arguments_.get('event') ?? '';
  const isDraft = arguments_.get('draft') === 'true';
  const paths =
    eventName === 'workflow_dispatch'
      ? []
      : readChangedPaths(
          arguments_.get('base') ?? '',
          arguments_.get('head') ?? '',
        );
  const plan = createCiPlan({ eventName, isDraft, paths });

  process.stderr.write(
    `CI scope: ${paths.length} changed path(s), quality=${plan.quality}, coverage=${plan.coverage}, dependency_audit=${plan.dependencyAudit}, windows_package=${plan.windowsPackage}\n`,
  );
  process.stdout.write(`${formatGitHubOutputs(plan)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}

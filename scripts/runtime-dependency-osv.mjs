// Runtime components the app downloads at feature-enable time. npm audit never
// sees them, so their pinned PyPI wheels are checked against OSV instead.
export const RUNTIME_MANIFEST_PATHS = Object.freeze([
  'shared/featureDependencies.json',
  'resources/audio-processing',
  'scripts/research/lyricsAcoustic/manifest.json',
]);

export const OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch';

const WHEEL_FILENAME_RE = /^([A-Za-z0-9_.]+)-(\d[^-]*)-.+\.whl$/u;

// PEP 503 name normalization, which OSV's PyPI ecosystem keys on.
export function normalizePypiName(name) {
  return name.toLowerCase().replace(/[-_.]+/gu, '-');
}

export function parseWheelFilename(value) {
  const filename = String(value).split(/[\\/]/u).pop();
  const match = WHEEL_FILENAME_RE.exec(filename);
  return match
    ? { name: normalizePypiName(match[1]), version: match[2] }
    : null;
}

function collectStrings(value, strings) {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, strings);
  }
  return strings;
}

// Distinct name/version pairs from every wheel filename or URL in manifests.
export function collectPypiPackages(manifests) {
  const packages = new Map();
  for (const manifest of manifests) {
    for (const value of collectStrings(manifest, [])) {
      const wheel = parseWheelFilename(value);
      if (wheel) packages.set(`${wheel.name}==${wheel.version}`, wheel);
    }
  }
  return [...packages.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

// Pinned artifacts OSV cannot answer for (no PyPI wheel), listed so the
// report states what still needs a manual advisory check.
export function collectUncheckedArtifacts(featureDependencies) {
  const unchecked = [];
  for (const dependency of featureDependencies.dependencies ?? []) {
    const artifacts = dependency.artifacts?.length
      ? dependency.artifacts
      : [dependency];
    for (const artifact of artifacts) {
      if (dependency.kind === 'model') continue;
      if (collectStrings(artifact, []).some(parseWheelFilename)) continue;
      unchecked.push(`${artifact.name} ${artifact.version}`);
    }
  }
  return [...new Set(unchecked)];
}

export function buildOsvQuery(packages) {
  return {
    queries: packages.map(({ name, version }) => ({
      package: { name, ecosystem: 'PyPI' },
      version,
    })),
  };
}

export function findingsFromOsvResponse(packages, response) {
  const results = Array.isArray(response?.results) ? response.results : [];
  return packages
    .map((pkg, index) => ({
      ...pkg,
      ids: (results[index]?.vulns ?? []).map((vuln) => vuln.id).sort(),
    }))
    .filter((finding) => finding.ids.length > 0);
}

export function formatReport({ packages, findings, unchecked }) {
  const lines = [
    `## Runtime dependency advisories`,
    '',
    `Checked ${packages.length} pinned PyPI packages against OSV.`,
    '',
  ];
  if (findings.length === 0) {
    lines.push('No known advisories.');
  } else {
    for (const { name, version, ids } of findings) {
      const links = ids.map(
        (id) => `[${id}](https://osv.dev/vulnerability/${id})`,
      );
      lines.push(`- **${name} ${version}**: ${links.join(', ')}`);
    }
  }
  if (unchecked.length > 0) {
    lines.push('', 'Not covered by OSV; review upstream advisories manually:');
    for (const item of unchecked) lines.push(`- ${item}`);
  }
  return `${lines.join('\n')}\n`;
}

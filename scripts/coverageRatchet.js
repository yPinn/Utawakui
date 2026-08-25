'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  APP_SOURCE_PATTERN,
  classifyAppSource,
  coveragePolicy,
} = require('./coveragePolicy');

const METRICS = ['statements', 'branches', 'functions', 'lines'];

function normalizedPercent(total, covered) {
  return total === 0 ? 100 : (covered / total) * 100;
}

function normalizeCoverageEntries(report, rootDirectory) {
  const entries = new Map();
  for (const [filePath, coverage] of Object.entries(report)) {
    if (filePath === 'total') continue;
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(rootDirectory, filePath)
      : filePath;
    entries.set(relativePath.replaceAll('\\', '/'), coverage);
  }
  return entries;
}

function aggregateCoverage(coverages) {
  return Object.fromEntries(
    METRICS.map((metricName) => {
      const totals = coverages.reduce(
        (result, coverage) => {
          result.total += coverage[metricName].total;
          result.covered += coverage[metricName].covered;
          result.skipped += coverage[metricName].skipped || 0;
          return result;
        },
        { total: 0, covered: 0, skipped: 0 },
      );
      return [
        metricName,
        {
          ...totals,
          pct: normalizedPercent(totals.total, totals.covered),
        },
      ];
    }),
  );
}

function listMeasuredAppSources(rootDirectory) {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        const relativePath = path
          .relative(rootDirectory, entryPath)
          .replaceAll('\\', '/');
        if (
          APP_SOURCE_PATTERN.test(relativePath) &&
          !/\.test\.(?:js|mjs)$/.test(relativePath) &&
          classifyAppSource(relativePath).status === 'measured'
        ) {
          files.push(relativePath);
        }
      }
    }
  }

  for (const sourceRoot of ['electron', 'overlay', 'shared', 'src']) {
    visit(path.join(rootDirectory, sourceRoot));
  }
  return files.sort();
}

function checkMinimums(name, coverage, minimum, failures) {
  for (const [metricName, floor] of Object.entries(minimum)) {
    const actual = coverage[metricName]?.pct;
    if (!Number.isFinite(actual) || actual < floor) {
      failures.push(
        `${name} ${metricName} ${Number(actual || 0).toFixed(2)}% < ${floor}%`,
      );
    }
  }
}

function evaluateCoverageSummary(
  entries,
  policy = coveragePolicy,
  { requiredFiles = [] } = {},
) {
  const failures = [];
  const results = [];

  for (const filePath of requiredFiles) {
    if (!entries.has(filePath)) {
      failures.push(
        `measured source ${filePath} is missing from the coverage report`,
      );
    }
  }

  for (const domain of policy.domains) {
    const matching = [...entries.entries()]
      .filter(([filePath]) => filePath.startsWith(domain.prefix))
      .map(([, coverage]) => coverage);
    if (matching.length === 0) {
      failures.push(`${domain.name} has no measured files`);
      continue;
    }
    const coverage = aggregateCoverage(matching);
    checkMinimums(domain.name, coverage, domain.minimum, failures);
    results.push({ kind: 'domain', name: domain.name, coverage });
  }

  for (const file of policy.files) {
    const coverage = entries.get(file.path);
    if (!coverage) {
      failures.push(`${file.path} is missing from the coverage report`);
      continue;
    }
    checkMinimums(file.path, coverage, file.minimum, failures);
    results.push({ kind: 'file', name: file.path, coverage });
  }

  return { passed: failures.length === 0, failures, results };
}

function formatMetricSummary(coverage) {
  return METRICS.map(
    (metricName) => `${metricName}=${coverage[metricName].pct.toFixed(2)}%`,
  ).join(' ');
}

function runCoverageRatchet({
  rootDirectory = process.cwd(),
  summaryPath = path.join(rootDirectory, 'coverage', 'coverage-summary.json'),
  output = console,
} = {}) {
  const report = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const entries = normalizeCoverageEntries(report, rootDirectory);
  const requiredFiles = listMeasuredAppSources(rootDirectory);
  const result = evaluateCoverageSummary(entries, coveragePolicy, {
    requiredFiles,
  });

  for (const item of result.results) {
    output.log(
      `[coverage] ${item.kind} ${item.name}: ${formatMetricSummary(item.coverage)}`,
    );
  }
  for (const failure of result.failures) {
    output.error(`[coverage] ${failure}`);
  }
  return result;
}

if (require.main === module) {
  try {
    const result = runCoverageRatchet();
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`[coverage] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  aggregateCoverage,
  evaluateCoverageSummary,
  listMeasuredAppSources,
  normalizeCoverageEntries,
  runCoverageRatchet,
};

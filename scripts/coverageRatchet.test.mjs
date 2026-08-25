import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateCoverage,
  evaluateCoverageSummary,
  normalizeCoverageEntries,
} from './coverageRatchet.js';

function metric(total, covered) {
  return {
    total,
    covered,
    skipped: 0,
    pct: total === 0 ? 100 : (covered / total) * 100,
  };
}

function summary(statements, branches = statements) {
  return {
    statements,
    branches,
    functions: statements,
    lines: statements,
  };
}

describe('coverage ratchet', () => {
  it('normalizes absolute report paths to portable repository paths', () => {
    const root = path.resolve('workspace');
    const report = {
      total: summary(metric(20, 18)),
      [path.join(root, 'electron', 'lib', 'safe.js')]: summary(metric(10, 9)),
    };

    expect(normalizeCoverageEntries(report, root)).toEqual(
      new Map([['electron/lib/safe.js', summary(metric(10, 9))]]),
    );
  });

  it('aggregates covered and total counts rather than averaging percentages', () => {
    const aggregate = aggregateCoverage([
      summary(metric(90, 90), metric(20, 18)),
      summary(metric(10, 0), metric(80, 32)),
    ]);

    expect(aggregate.statements.pct).toBe(90);
    expect(aggregate.branches.pct).toBe(50);
  });

  it('reports missing domains, missing named files, and regressed metrics', () => {
    const entries = new Map([
      ['electron/lib/safe.js', summary(metric(100, 79))],
    ]);
    const policy = {
      domains: [
        {
          name: 'electron-lib',
          prefix: 'electron/lib/',
          minimum: { statements: 80 },
        },
        {
          name: 'renderer-utils',
          prefix: 'src/utils/',
          minimum: { statements: 80 },
        },
      ],
      files: [
        {
          path: 'electron/lib/safe.js',
          minimum: { statements: 80 },
        },
        {
          path: 'electron/lib/missing.js',
          minimum: { statements: 80 },
        },
      ],
    };

    const result = evaluateCoverageSummary(entries, policy);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('electron-lib statements 79.00% < 80%'),
        expect.stringContaining('renderer-utils has no measured files'),
        expect.stringContaining('electron/lib/missing.js is missing'),
        expect.stringContaining('electron/lib/safe.js statements 79.00% < 80%'),
      ]),
    );
  });

  it('fails when a policy-measured source is absent from the report', () => {
    const entries = new Map([
      ['electron/lib/safe.js', summary(metric(10, 10))],
    ]);

    const result = evaluateCoverageSummary(
      entries,
      { domains: [], files: [] },
      {
        requiredFiles: ['electron/lib/safe.js', 'electron/main/newHandler.js'],
      },
    );

    expect(result.failures).toContain(
      'measured source electron/main/newHandler.js is missing from the coverage report',
    );
  });

  it('passes exact domain and named-file floors', () => {
    const entries = new Map([
      ['electron/lib/safe.js', summary(metric(100, 80))],
      ['electron/lib/other.js', summary(metric(100, 90))],
    ]);
    const policy = {
      domains: [
        {
          name: 'electron-lib',
          prefix: 'electron/lib/',
          minimum: { statements: 85 },
        },
      ],
      files: [
        {
          path: 'electron/lib/safe.js',
          minimum: { statements: 80 },
        },
      ],
    };

    const result = evaluateCoverageSummary(entries, policy);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'electron-lib', kind: 'domain' }),
        expect.objectContaining({
          name: 'electron/lib/safe.js',
          kind: 'file',
        }),
      ]),
    );
  });
});

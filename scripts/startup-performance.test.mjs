import { describe, expect, it } from 'vitest';
import {
  buildRunPlan,
  parseStartupTrace,
  percentile,
  summarizeRuns,
} from './startup-performance.mjs';

const completeTrace = (offset = 0) => [
  {
    version: 1,
    sessionId: `session-${offset}`,
    name: 'process-start',
    process: 'main',
    atUnixMs: 1000,
    elapsedMs: 0,
  },
  ...[
    ['electron-ready', 'main', 20],
    ['config-ready', 'main', 30],
    ['window-created', 'main', 40],
    ['dom-loaded', 'main', 80],
  ].map(([name, process, elapsedMs]) => ({
    version: 1,
    sessionId: `session-${offset}`,
    name,
    process,
    atUnixMs: 1000 + elapsedMs + offset,
    elapsedMs: elapsedMs + offset,
  })),
  {
    version: 1,
    sessionId: `session-${offset}`,
    name: 'first-paint',
    process: 'renderer',
    atUnixMs: 1100 + offset,
    elapsedMs: 100 + offset,
  },
  ...[
    ['interactive-shell', 'renderer', 110],
    ['output-listening', 'main', 120],
    ['source-synchronized', 'main', 130],
    ['first-instance-ready', 'overlay', 180],
  ].map(([name, process, elapsedMs]) => ({
    version: 1,
    sessionId: `session-${offset}`,
    name,
    process,
    atUnixMs: 1000 + elapsedMs + offset,
    elapsedMs: elapsedMs + offset,
  })),
  {
    version: 1,
    sessionId: `session-${offset}`,
    name: 'first-rendered-frame',
    process: 'overlay',
    atUnixMs: 1200 + offset,
    elapsedMs: 200 + offset,
  },
  {
    version: 1,
    sessionId: `session-${offset}`,
    name: 'baseline-complete',
    process: 'main',
    atUnixMs: 1210 + offset,
    elapsedMs: 210 + offset,
    metadata: {
      cpuPercent: 10 + offset,
      workingSetKb: 2048 + offset,
      peakWorkingSetKb: 4096 + offset,
      processCount: 4,
      outputQueuedBytes: 0,
      outputClients: 1,
      gpuAccelerationEnabled: true,
    },
  },
];

describe('startup performance harness', () => {
  it('builds isolated cold runs and a shared warm profile', () => {
    const plan = buildRunPlan({ coldRuns: 2, warmRuns: 3 });

    expect(plan.map(({ scenario }) => scenario)).toEqual([
      'cold',
      'cold',
      'warm-prime',
      'warm',
      'warm',
      'warm',
    ]);
    expect(plan[0].profileId).not.toBe(plan[1].profileId);
    expect(new Set(plan.slice(2).map(({ profileId }) => profileId))).toEqual(
      new Set(['warm']),
    );
  });

  it('parses one complete, single-session JSONL trace', () => {
    const parsed = parseStartupTrace(
      completeTrace().map(JSON.stringify).join('\n'),
    );

    expect(parsed.milestones['first-paint']).toBe(100);
    expect(parsed.milestones['first-rendered-frame']).toBe(200);
    expect(parsed.baseline.workingSetKb).toBe(2048);
  });

  it.each([
    ['invalid JSON', '{'],
    [
      'mixed sessions',
      completeTrace()
        .map((entry, index) =>
          JSON.stringify(
            index === 1 ? { ...entry, sessionId: 'other' } : entry,
          ),
        )
        .join('\n'),
    ],
    [
      'missing completion',
      completeTrace().slice(0, -1).map(JSON.stringify).join('\n'),
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => parseStartupTrace(input)).toThrow();
  });

  it('uses a deterministic nearest-rank percentile', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40);
  });

  it('summarizes cold and warm observations without inventing budgets', () => {
    const runs = [
      {
        scenario: 'cold',
        ...parseStartupTrace(completeTrace(0).map(JSON.stringify).join('\n')),
      },
      {
        scenario: 'cold',
        ...parseStartupTrace(completeTrace(20).map(JSON.stringify).join('\n')),
      },
      {
        scenario: 'warm',
        ...parseStartupTrace(completeTrace(10).map(JSON.stringify).join('\n')),
      },
    ];

    const summary = summarizeRuns(runs);
    expect(summary.budgets).toBeNull();
    expect(summary.scenarios.cold.milestones['first-paint']).toEqual({
      samples: 2,
      p50: 100,
      p95: 120,
    });
    expect(summary.scenarios.warm.baseline.workingSetKb).toEqual({
      samples: 1,
      p50: 2058,
      p95: 2058,
    });
  });
});

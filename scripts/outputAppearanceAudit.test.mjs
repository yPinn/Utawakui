import { describe, expect, it } from 'vitest';
import {
  buildAuditPlan,
  buildAuditProjection,
  createAuditReport,
  settleAuditReport,
  parseAuditArguments,
  collectAuditSources,
} from './outputAppearanceAudit.mjs';
import { parseOutputStreamEnvelope } from '../shared/outputStreamContract.js';
import { parseOutputSnapshot } from '../shared/outputContract.js';

describe('F4 bounded Output audit', () => {
  it('fingerprints the actual runtime, fonts, fixture corpus and immutable thumbnail inputs', () => {
    const source = collectAuditSources();
    expect(source.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof source.dirty).toBe('boolean');
    expect(source.files.length).toBeGreaterThan(100);
    expect(
      source.files.some(
        (r) => r.file === 'src/assets/output-template-thumbnails/art-card.jpg',
      ),
    ).toBe(true);
    expect(
      source.files.every(
        (r) => /^[a-f0-9]{64}$/.test(r.sha256) && !r.file.includes('.test.'),
      ),
    ).toBe(true);
    expect(parseAuditArguments([])).toEqual({});
    const report = createAuditReport(
      buildAuditPlan({ templates: ['art-card'], scenarios: ['image-error'] }),
      source,
    );
    expect(settleAuditReport(report).status).toBe('not-tested');
    report.errors.push('asset missing');
    expect(settleAuditReport(report).status).toBe('failed');
    expect(
      buildAuditProjection(buildAuditPlan().cases[0].snapshot, 'unavailable')
        .sourceEpoch,
    ).toBeNull();
  });
  it('defaults to nine synthetic, paused showcase captures with explicit limits', () => {
    const plan = buildAuditPlan();
    expect(plan.cases).toHaveLength(9);
    for (const row of plan.cases) {
      expect(row.scenarioId).toBe('showcase-t1-v1');
      expect(row.snapshot.playback.status).toBe('paused');
      expect(row.motion).toBe('reduce');
      expect(row.settings.captureSize).toBeTruthy();
      expect(row.evidence).toBe('visible-electron-capture');
    }
    expect(plan.matrix).toHaveLength(288);
    expect(
      plan.matrix.find(
        (r) => r.templateId === 'art-card' && r.scenarioId === 'playing-t2',
      ).applicability,
    ).toBe('not-applicable');
  });

  it('rejects unknown ids, duplicate options, arbitrary paths, URLs and excessive requests', () => {
    for (const options of [
      { templates: ['toString'] },
      { scenarios: ['../private'] },
      { scenarios: ['showcase-t1-v1', 'showcase-t1-v1'] },
      { templates: [] },
      { scenarios: [] },
    ])
      expect(() => buildAuditPlan(options)).toThrow();
    for (const args of [
      ['--url', 'https://example.com'],
      ['--out', '../src'],
      ['--scenario', 'empty', '--scenario', 'paused'],
      ['--template'],
      ['--wat'],
      ['toString', 'value'],
      ['__proto__', 'value'],
    ]) {
      expect(() => parseAuditArguments(args)).toThrow();
    }
    expect(
      parseAuditArguments([
        '--template',
        'art-card',
        '--scenario',
        'empty',
        '--list',
      ]),
    ).toEqual({ templates: ['art-card'], scenarios: ['empty'], list: true });
  });

  it('does not turn temporal or fault stimuli into a passing static capture', () => {
    const plan = buildAuditPlan({
      templates: ['live-stage'],
      scenarios: ['font-missing', 'source-reconnect', 'image-error', 'paused'],
    });
    expect(plan.cases.map((r) => r.captureStatus)).toEqual([
      'not-tested',
      'not-tested',
      'not-applicable',
      'pending',
    ]);
    expect(plan.cases[0].reason).toMatch(/stimulus/);
    expect(plan.cases[3].snapshot.playback.positionMs).toBe(5000);
  });

  it('uses schema-valid V3 documents for showcase, timing fallbacks and empty input', () => {
    for (const scenario of [
      'showcase-t1-v1',
      'playing-t0',
      'playing-t1',
      'playing-t2',
      'empty',
      'missing-duration',
      'track-change',
    ]) {
      const row = buildAuditPlan({
        templates: ['karaoke-stack'],
        scenarios: [scenario],
      }).cases[0];
      const projection = buildAuditProjection(row.snapshot);
      expect(() => parseOutputSnapshot(projection.snapshot)).not.toThrow();
      for (const [stream, entry] of [
        [
          'lyrics.document',
          {
            revision: projection.streams.lyrics.revision,
            payload: { document: projection.streams.lyrics.document },
          },
        ],
        [
          'queue.document',
          {
            revision: projection.streams.queue.revision,
            payload: { document: projection.streams.queue.document },
          },
        ],
        ['state.snapshot', projection.streams.state],
      ])
        expect(() =>
          parseOutputStreamEnvelope(
            {
              contractVersion: 3,
              bootId: projection.bootId,
              sourceEpoch: projection.sourceEpoch,
              kind: 'full',
              stream,
              ...entry,
            },
            projection.bootId,
          ),
        ).not.toThrow();
      if (scenario === 'empty')
        expect(projection.streams.lyrics.document).toBeNull();
    }
  });

  it('records requested and observed states separately and preserves cancellation/failure', () => {
    const report = createAuditReport(buildAuditPlan(), {
      commit: 'test',
      dirty: true,
      files: [],
    });
    expect(report.versions.obs).toBe('not-tested');
    expect(report.cases[0].visualReview).toBe('not-tested');
    const failed = structuredClone(report);
    failed.cases[0].captureStatus = 'failed';
    expect(settleAuditReport(failed).status).toBe('failed');
    const cancelled = settleAuditReport(report, 'cancelled');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cases.every((r) => r.captureStatus === 'not-tested')).toBe(
      true,
    );
    expect(cancelled.cases[0].reason).toBe('cancelled');
    const passed = createAuditReport(
      buildAuditPlan({
        templates: ['art-card'],
        scenarios: ['empty', 'image-error'],
      }),
      {},
    );
    passed.cases[0].captureStatus = 'passed';
    expect(settleAuditReport(passed).status).toBe('passed');
    expect(passed.cases[1].captureStatus).toBe('not-tested');
  });
});

// Development tooling only. Never imported by a shipping renderer or server.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAcceptanceMatrix,
  createOutputScenario,
  loadOutputAppearanceFixtures,
  validateOutputAppearanceBaseline,
} from './outputAppearanceBaseline.mjs';
import {
  createOutputPreviewSnapshot,
  createOutputPreviewScene,
  OUTPUT_PREVIEW_SCENARIO_ID,
  OUTPUT_PREVIEW_NOW_MS,
} from '../shared/presentation/outputPreviewScene.mjs';
import { normalizeOutputAppearance } from '../shared/outputAppearance.mjs';
import { parseOutputStreamEnvelope } from '../shared/outputStreamContract.js';
import {
  createEmptyOutputSnapshot,
  parseOutputSnapshot,
} from '../shared/outputContract.js';

export const AUDIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

export function parseAuditArguments(args) {
  const result = {};
  const names = { '--template': 'templates', '--scenario': 'scenarios' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const key = Object.hasOwn(names, flag) ? names[flag] : null;
    if (flag === '--list' && !result.list) result.list = true;
    else if (key && !Object.hasOwn(result, key)) {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        throw Error('Missing audit option value');
      result[key] = value.split(',');
    } else throw Error('Unknown or duplicate audit option');
  }
  return result;
}

function selectedIds(requested, allowed) {
  if (
    !Array.isArray(requested) ||
    !requested.length ||
    requested.length > allowed.length ||
    new Set(requested).size !== requested.length ||
    requested.some((id) => !allowed.includes(id))
  ) {
    throw Error('Unknown, empty or duplicate audit selection');
  }
  return requested;
}

export function buildAuditPlan(options = {}) {
  const fixtures = loadOutputAppearanceFixtures();
  if (validateOutputAppearanceBaseline(fixtures).length)
    throw Error('Output baseline drift');
  const templates = selectedIds(
    options.templates ?? fixtures.baseline.templates.map((t) => t.id),
    fixtures.baseline.templates.map((t) => t.id),
  );
  const scenarios = selectedIds(
    options.scenarios ?? [OUTPUT_PREVIEW_SCENARIO_ID],
    [OUTPUT_PREVIEW_SCENARIO_ID, ...fixtures.scenarios.cases.map((c) => c.id)],
  );
  const matrix = createAcceptanceMatrix().flatMap((t) =>
    t.cases.map((c) => ({
      templateId: t.id,
      scenarioId: c.id,
      ...c,
      status: 'not-tested',
    })),
  );
  const cases = templates.flatMap((templateId) =>
    scenarios.map((scenarioId) => {
      const template = fixtures.baseline.templates.find(
        (t) => t.id === templateId,
      );
      const applicability =
        matrix.find(
          (r) => r.templateId === templateId && r.scenarioId === scenarioId,
        )?.applicability ?? 'applicable';
      const scene =
        scenarioId === OUTPUT_PREVIEW_SCENARIO_ID
          ? {
              snapshot: createOutputPreviewSnapshot(),
              nowMs: OUTPUT_PREVIEW_NOW_MS,
              environment: {},
              steps: [],
            }
          : createOutputScenario(scenarioId);
      const settings = {
        ...normalizeOutputAppearance({}, { templateId }),
        captureSize: template.capture.default,
      };
      const snapshot = structuredClone(scene.snapshot);
      // Still-image observations: preserve position/terminal states, freeze a running clock.
      if (['playing', 'seeking'].includes(snapshot.playback.status))
        snapshot.playback.status = 'paused';
      const unimplemented =
        scene.steps.length > 0 ||
        ['font-denied', 'font-missing', 'font-delayed', 'image-error'].includes(
          scenarioId,
        );
      const captureStatus =
        applicability === 'not-applicable'
          ? 'not-applicable'
          : unimplemented
            ? 'not-tested'
            : 'pending';
      return {
        templateId,
        kind: template.kind,
        scenarioId,
        applicability,
        settings,
        requestedPlayback: scene.snapshot.playback,
        snapshot,
        nowMs: scene.nowMs,
        environment: scene.environment,
        assets: {
          injectedArtwork: 'none',
          localFontFiles: 'none',
          privateMedia: false,
        },
        steps: scene.steps,
        sourceStatus: scene.environment.sourceStatus ?? 'ready',
        motion: 'reduce',
        background: 'transparent',
        zoomFactor: template.kind === 'lyrics' ? 0.75 : 1,
        captureSize: fixtures.baseline.captureSizes[template.capture.default],
        evidence: 'visible-electron-capture',
        captureStatus,
        reason:
          applicability === 'not-applicable'
            ? 'template-does-not-consume-stimulus'
            : unimplemented
              ? 'stimulus-not-implemented; no fault or sequence claim'
              : null,
        expectedFrame: createOutputPreviewScene({
          kind: template.kind,
          templateId,
          settings,
          snapshot,
          nowMs: scene.nowMs,
          scenarioId,
        }).frame,
        visualReview: 'not-tested',
        obs: 'not-tested',
      };
    }),
  );
  return { version: 1, templates, scenarios, cases, matrix };
}

export function buildAuditProjection(snapshot, sourceStatus = 'ready') {
  const copy = structuredClone(snapshot);
  copy.revision = 1;
  const lyrics = copy.lyrics;
  copy.lyrics = lyrics
    ? {
        ...lyrics,
        lines: lyrics.lines.map((line) => ({
          ...line,
          startMs: line.startMs ?? null,
          endMs: line.endMs ?? null,
        })),
      }
    : createEmptyOutputSnapshot().lyrics;
  parseOutputSnapshot(copy);
  const document = lyrics
    ? {
        documentId: 'audit-lyrics',
        trackId: copy.playback.track.id,
        granularity: lyrics.lines.some((l) => l.segments?.length)
          ? 'T2'
          : lyrics.synced
            ? 'T1'
            : 'T0',
        source: lyrics.source,
        lines: lyrics.lines.map((line) => ({
          ...line,
          startMs: line.startMs ?? null,
          endMs: line.endMs ?? null,
        })),
        ...(lyrics.reading ? { reading: lyrics.reading } : {}),
      }
    : null;
  const projection = {
    bootId: 'audit-boot',
    sourceEpoch: sourceStatus === 'unavailable' ? null : 'audit-epoch',
    sourceSynchronization: sourceStatus,
    snapshot: copy,
    streams: {
      lyrics: { revision: 1, document },
      queue: {
        revision: 1,
        document: { documentId: 'audit-queue', ...copy.queue },
      },
      musicStructure: { revision: 0, document: null },
      state: {
        revision: 1,
        payload: {
          generatedAt: copy.generatedAt,
          displayDelayMs: 0,
          playback: copy.playback,
          lyrics: {
            documentId: document?.documentId ?? null,
            documentRevision: document ? 1 : 0,
            offsetMs: lyrics?.offsetMs ?? 0,
            activeLineId: lyrics?.lines[0]?.lineId ?? null,
            activeSegmentId: null,
          },
          queue: { documentId: 'audit-queue', documentRevision: 1 },
          musicStructure: { documentId: null, documentRevision: 0 },
        },
      },
    },
  };
  for (const [stream, revision, payload] of [
    ['lyrics.document', 1, { document }],
    ['queue.document', 1, { document: projection.streams.queue.document }],
    ['state.snapshot', 1, projection.streams.state.payload],
  ])
    parseOutputStreamEnvelope(
      {
        contractVersion: 3,
        bootId: projection.bootId,
        sourceEpoch: 'audit-epoch',
        kind: 'full',
        stream,
        revision,
        payload,
      },
      projection.bootId,
    );
  return projection;
}

export function createAuditReport(plan, source) {
  return {
    schemaVersion: 1,
    phase: 'F4',
    startedAt: new Date().toISOString(),
    status: 'running',
    source,
    versions: {
      app: JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
        .version,
      obs: 'not-tested',
    },
    cases: structuredClone(plan.cases),
    matrix: structuredClone(plan.matrix),
    errors: [],
    limitations: [
      'Capture emission and structural checks are not human visual approval.',
      'Static observations use reduced motion and freeze playing/seeking at the fixture position; no animation or seek-transition claim.',
      'Lyrics CSS viewport is 1920x1080 at zoom 0.75; PNG is 1440x810, not native FHD. Widgets use zoom 1.',
      'No synthetic-cover bytes are injected despite the F1 requested environment hint; observed images and font readiness are recorded, not glyph coverage or rights approval.',
      'OBS, alpha composition, font fault injection, image decode faults, temporal sequences and performance are not tested.',
      'Gallery thumbnails are not replaced. Existing G01 references remain blocked for delivery.',
    ],
  };
}

export function settleAuditReport(report, terminal) {
  for (const row of report.cases)
    if (row.captureStatus === 'pending') {
      row.captureStatus = 'not-tested';
      row.reason = terminal ?? 'capture-not-completed';
    }
  report.status =
    terminal ??
    (report.errors.length ||
    report.cases.some((r) => r.captureStatus === 'failed')
      ? 'failed'
      : report.cases.some((r) => r.captureStatus === 'passed')
        ? 'passed'
        : 'not-tested');
  report.finishedAt = new Date().toISOString();
  return report;
}

export function collectAuditSources(root = AUDIT_ROOT) {
  const files = [];
  const collect = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collect(relative);
      else if (!/\.test\.[^/]+$/.test(entry.name)) files.push(relative);
    }
  };
  for (const dir of [
    'overlay',
    'shared',
    'scripts/fixtures/output',
    'electron/lib/outputServer',
    'src/assets/output-template-thumbnails',
  ])
    collect(dir);
  files.push(
    'electron/lib/outputServer.js',
    'package.json',
    'package-lock.json',
    'scripts/outputAppearanceAudit.mjs',
    'scripts/output-appearance-audit.mjs',
    'scripts/output-appearance-capture.cjs',
    'scripts/outputAppearanceBaseline.mjs',
  );
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    }).trim();
  return {
    commit: git(['rev-parse', 'HEAD']),
    dirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal'])),
    files: files.sort().map((file) => ({
      file,
      sha256: sha256(readFileSync(path.join(root, file))),
    })),
  };
}

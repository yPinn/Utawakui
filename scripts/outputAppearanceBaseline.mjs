// F1 tooling only. Never import fixtures or this module into a shipping renderer.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  OUTPUT_APPEARANCE_SCHEMA_VERSION,
  outputAppearanceFieldsForTemplate,
} from '../shared/outputAppearance.mjs';
import { lyricsTemplateCapabilities } from '../shared/presentation/lyricsTemplateCapabilities.mjs';
import { selectReceiptSetlistFrame } from '../shared/presentation/receiptSetlist.mjs';
import {
  selectArtworkFrame,
  selectLyricsOverlayFrame,
  selectSetlistFrame,
} from '../shared/presentation/state.mjs';

const readJson = (relative) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const registry = readJson('../shared/outputTemplateValues.json');
const captureValues = readJson('../shared/outputCaptureValues.json');
const captureSizes = Object.fromEntries(
  [...captureValues.widgetSizes, captureValues.lyricsSize].map(
    ({ id, width, height }) => [id, { width, height }],
  ),
);
const REQUIRED_SCENARIOS = [
  'playing-t1',
  'empty',
  'missing-artwork',
  'image-error',
  'missing-reading',
  'missing-duration',
  'playing-t0',
  'playing-t2',
  'paused',
  'seek-forward',
  'seek-backward',
  'track-change',
  'rapid-track-changes',
  'natural-end',
  'source-unavailable',
  'source-syncing',
  'source-ready',
  'source-reconnect',
  'reduced-motion-initial',
  'reduced-motion-toggle',
  'font-denied',
  'font-missing',
  'font-delayed',
  'capture-declared',
  ...['zh-Hant', 'ja', 'ko', 'en'].flatMap((language) =>
    ['short', 'long'].map((length) => `language-${language}-${length}`),
  ),
];

export function loadOutputAppearanceFixtures() {
  return {
    baseline: readJson('./fixtures/output/appearance-baseline.json'),
    scenarios: readJson('./fixtures/output/scenarios.json'),
  };
}

export function validateOutputAppearanceBaseline({ baseline, scenarios }) {
  const issues = [];
  const templateIds = Object.keys(registry.templateKinds);
  if (!isDeepStrictEqual(baseline.captureSizes, captureSizes))
    issues.push('capture-geometry');
  if (baseline.version !== 1 || scenarios.version !== 1)
    issues.push('fixture-version');
  if (baseline.appearanceSchemaVersion !== OUTPUT_APPEARANCE_SCHEMA_VERSION) {
    issues.push('appearance-schema-version');
  }
  if (
    !isDeepStrictEqual(
      baseline.templates.map(({ id }) => id),
      templateIds,
    )
  ) {
    issues.push('active-templates');
  }
  for (const template of baseline.templates) {
    if (!templateIds.includes(template.id)) continue;
    const fields = outputAppearanceFieldsForTemplate(template.id);
    if (!isDeepStrictEqual(template.fields, fields))
      issues.push(`${template.id}:appearance-fields`);
    if (template.kind !== registry.templateKinds[template.id])
      issues.push(`${template.id}:kind`);
    if (
      !isDeepStrictEqual(
        template.capture,
        registry.templateCaptureSizes[template.id],
      )
    ) {
      issues.push(`${template.id}:capture`);
    }
    const timing =
      template.kind === 'lyrics'
        ? lyricsTemplateCapabilities(template.id)
        : null;
    if (!isDeepStrictEqual(template.timing, timing))
      issues.push(`${template.id}:timing`);
    if (!template.lockedInvariants?.length)
      issues.push(`${template.id}:lock-reasons`);
    for (const { key } of fields) {
      if (
        !['default', 'opt', 'advanced'].includes(
          baseline.fieldPolicy[key]?.level,
        )
      ) {
        issues.push(`${template.id}:field-policy:${key}`);
      }
    }
  }
  const ids = scenarios.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) issues.push('duplicate-scenario');
  for (const id of REQUIRED_SCENARIOS) {
    if (!ids.includes(id)) issues.push(`required-scenario:${id}`);
  }
  return issues;
}

export function createOutputScenario(id) {
  const { scenarios } = loadOutputAppearanceFixtures();
  const spec = scenarios.cases.find((item) => item.id === id);
  if (!spec) throw new Error('Unknown Output scenario');
  const snapshot = structuredClone(scenarios.baseSnapshot);
  Object.assign(snapshot.playback, spec.playback);
  if (spec.empty) {
    snapshot.playback = {
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      rate: 1,
      track: null,
    };
    snapshot.queue.items = [];
    snapshot.lyrics = null;
  }
  if (spec.track) {
    const track = {
      id: `synthetic-track-${spec.track}`,
      title: `合成測試曲${spec.track}`,
      artist: '測試演唱者乙',
    };
    snapshot.playback.track = track;
    snapshot.queue.items = [
      { state: 'current', track: structuredClone(track) },
    ];
    snapshot.lyrics = null;
  }
  if (spec.language) {
    const text =
      scenarios.languageSamples[spec.language][spec.length === 'short' ? 0 : 1];
    snapshot.playback.track.title = text;
    snapshot.queue.items[1].track.title = text;
    snapshot.lyrics.source.language = spec.language;
    snapshot.lyrics.lines[0].text = text;
  }
  if (spec.timing === 'T0') {
    snapshot.lyrics.synced = false;
    snapshot.lyrics.lines = snapshot.lyrics.lines.map(({ lineId, text }) => ({
      lineId,
      text,
    }));
  }
  if (spec.timing === 'T2') {
    snapshot.lyrics.lines[0].segments = [
      {
        segmentId: 'synthetic-segment-a',
        text: '測試',
        startMs: 0,
        endMs: 3000,
      },
      {
        segmentId: 'synthetic-segment-b',
        text: '第一',
        startMs: 3000,
        endMs: 6000,
      },
      {
        segmentId: 'synthetic-segment-c',
        text: '行',
        startMs: 6000,
        endMs: 8000,
      },
    ];
  }
  return {
    scenarioId: id,
    nowMs: Date.parse(snapshot.generatedAt),
    snapshot,
    environment: {
      sourceStatus: 'ready',
      bootId: 'synthetic-boot-a',
      sourceEpoch: 'synthetic-epoch-a',
      reducedMotion: false,
      artwork: 'synthetic-cover',
      font: 'bundled',
      ...spec.environment,
    },
    steps: structuredClone(spec.steps ?? []),
  };
}

// Environment and steps are stimuli for F2–F5, not side effects executed here.
export function projectOutputScenario(templateId, scene) {
  if (!Object.hasOwn(registry.templateKinds, templateId)) {
    throw new Error('Unknown Output template');
  }
  const kind = registry.templateKinds[templateId];
  if (kind === 'lyrics') {
    return selectLyricsOverlayFrame(scene.snapshot, {
      nowMs: scene.nowMs,
      templateId,
    });
  }
  return kind === 'setlist'
    ? templateId === 'receipt-setlist'
      ? selectReceiptSetlistFrame(scene.snapshot)
      : selectSetlistFrame(scene.snapshot)
    : selectArtworkFrame(scene.snapshot, { nowMs: scene.nowMs });
}

export function createAcceptanceMatrix() {
  const { baseline, scenarios } = loadOutputAppearanceFixtures();
  return baseline.templates.map((template) => ({
    id: template.id,
    capture: template.capture,
    cases: scenarios.cases.map(({ id, category }) => ({
      id,
      applicability:
        (category === 'lyrics' && template.kind !== 'lyrics') ||
        (['missing-artwork', 'image-error'].includes(id) &&
          template.kind !== 'now-playing') ||
        (id === 'font-denied' && template.id !== 'live-stage')
          ? 'not-applicable'
          : id === 'playing-t2' &&
              template.timing?.t2Progress === 'not-consumed'
            ? 'line-fallback'
            : 'applicable',
      evidence:
        category === 'runtime'
          ? 'runtime-pending'
          : ['asset', 'manual'].includes(category)
            ? 'manual-pending'
            : 'projection-only',
    })),
  }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixtures = loadOutputAppearanceFixtures();
  const issues = validateOutputAppearanceBaseline(fixtures);
  console.log(
    JSON.stringify(
      {
        ok: issues.length === 0,
        implementationPhase: 'F1',
        templates: fixtures.baseline.templates.length,
        scenarios: fixtures.scenarios.cases.length,
        issues,
      },
      null,
      2,
    ),
  );
  if (issues.length) process.exitCode = 1;
}

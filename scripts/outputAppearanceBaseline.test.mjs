import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAcceptanceMatrix,
  createOutputScenario,
  loadOutputAppearanceFixtures,
  projectOutputScenario,
  validateOutputAppearanceBaseline,
} from './outputAppearanceBaseline.mjs';
import {
  normalizeOutputAppearance,
  outputAppearanceFieldsForTemplate,
} from '../shared/outputAppearance.mjs';
import { selectLyricsOverlayFrame } from '../overlay/shared/state.mjs';
import { sanitizeOutputSlot } from '../electron/lib/outputSlots.js';
import { isAudioOutputPermissionAllowed } from '../electron/main/audioOutputPermissions.js';
import { normalizeOverlayAppearance } from '../overlay/shared/appearance.mjs';
import { getOutputWorkbenchData } from '../src/constants/outputTemplates.js';
import { buildOutputSlotPayload } from '../src/utils/outputSlotPayload.js';

const ids = [
  'queue-board',
  'karaoke-stack',
  'kinetic-pop',
  'ornate-vertical',
  'live-stage',
  'manga-frame',
  'art-card',
  'cover-player',
];

describe('Output F1 acceptance foundation', () => {
  it('pins exactly eight active templates and detects capability/default drift', () => {
    const fixtures = loadOutputAppearanceFixtures();
    expect(fixtures.baseline.templates.map(({ id }) => id)).toEqual(ids);
    expect(validateOutputAppearanceBaseline(fixtures)).toEqual([]);
    const changed = structuredClone(fixtures);
    changed.baseline.templates[0].fields[0].defaultValue = 'warm';
    expect(validateOutputAppearanceBaseline(changed)).toContain(
      'queue-board:appearance-fields',
    );
    changed.baseline.templates.push({ id: 'retired', fields: [] });
    expect(validateOutputAppearanceBaseline(changed)).toContain(
      'active-templates',
    );
  });

  it('rejects an incomplete scenario matrix instead of silently marking it tested', () => {
    const fixtures = loadOutputAppearanceFixtures();
    fixtures.scenarios.cases = fixtures.scenarios.cases.filter(
      ({ id }) => id !== 'seek-backward',
    );
    expect(validateOutputAppearanceBaseline(fixtures)).toContain(
      'required-scenario:seek-backward',
    );
  });

  it('detects capture geometry drift in addition to template size ids', () => {
    const fixtures = loadOutputAppearanceFixtures();
    expect(fixtures.baseline.captureSizes).toBeDefined();
    fixtures.baseline.captureSizes.small.width = 999;
    expect(validateOutputAppearanceBaseline(fixtures)).toContain(
      'capture-geometry',
    );
  });

  it('detects schema, scope, timing, policy, and scenario identity drift', () => {
    const fixtures = loadOutputAppearanceFixtures();
    fixtures.baseline.version = 99;
    fixtures.baseline.appearanceSchemaVersion = -1;
    const first = fixtures.baseline.templates[0];
    first.kind = 'lyrics';
    first.capture.default = 'small';
    first.timing = {};
    first.lockedInvariants = [];
    fixtures.baseline.fieldPolicy.paletteId.level = 'unknown';
    fixtures.scenarios.cases.push(fixtures.scenarios.cases[0]);
    expect(validateOutputAppearanceBaseline(fixtures)).toEqual(
      expect.arrayContaining([
        'fixture-version',
        'appearance-schema-version',
        'queue-board:kind',
        'queue-board:capture',
        'queue-board:timing',
        'queue-board:lock-reasons',
        'queue-board:field-policy:paletteId',
        'duplicate-scenario',
      ]),
    );
  });

  it.each(ids)(
    '%s has explicit settings, defaults, limits and lock reasons',
    (id) => {
      const { baseline } = loadOutputAppearanceFixtures();
      const template = baseline.templates.find((item) => item.id === id);
      expect(template.fields).toEqual(outputAppearanceFieldsForTemplate(id));
      expect(template.lockedInvariants.length).toBeGreaterThan(0);
      expect(template.unavailableControls.localImageImport.status).toBe(
        'not-implemented',
      );
      expect(template.unavailableControls.localFontFileImport.status).toBe(
        'planned',
      );
      for (const field of template.fields) {
        expect(baseline.fieldPolicy[field.key].level).toMatch(
          /^(default|opt|advanced)$/,
        );
        expect(
          normalizeOutputAppearance({}, { templateId: id })[field.key],
        ).toEqual(field.defaultValue);
      }
    },
  );

  it('keeps scenarios deterministic, independently mutable and entirely offline', () => {
    const { scenarios } = loadOutputAppearanceFixtures();
    for (const { id } of scenarios.cases) {
      const scene = createOutputScenario(id);
      expect(scene).toEqual(createOutputScenario(id));
      for (const templateId of ids) {
        const frame = projectOutputScenario(templateId, scene);
        expect(JSON.stringify(frame)).not.toMatch(/https?:\/\/|file:\/\//);
      }
    }
    const scene = createOutputScenario('playing-t1');
    scene.snapshot.playback.track.title = 'mutated';
    expect(
      createOutputScenario('playing-t1').snapshot.playback.track.title,
    ).not.toBe('mutated');
    expect(() => createOutputScenario('../../private')).toThrow(
      'Unknown Output scenario',
    );
    expect(() => projectOutputScenario('focus-line', scene)).toThrow(
      'Unknown Output template',
    );
    expect(() => projectOutputScenario('toString', scene)).toThrow(
      'Unknown Output template',
    );
  });

  it('does not imply executing reconnect, font or image loading from pure projections', () => {
    const matrix = createAcceptanceMatrix();
    expect(matrix).toHaveLength(8);
    for (const template of matrix) {
      expect(
        template.cases.find(({ id }) => id === 'font-denied'),
      ).toMatchObject({
        evidence: 'manual-pending',
      });
      expect(
        template.cases.find(({ id }) => id === 'source-reconnect'),
      ).toMatchObject({
        evidence: 'runtime-pending',
      });
    }
    expect(
      matrix
        .find(({ id }) => id === 'queue-board')
        .cases.find(({ id }) => id === 'playing-t2').applicability,
    ).toBe('not-applicable');
    expect(
      matrix
        .find(({ id }) => id === 'ornate-vertical')
        .cases.find(({ id }) => id === 'playing-t2').applicability,
    ).toBe('line-fallback');
    expect(
      matrix
        .find(({ id }) => id === 'manga-frame')
        .cases.find(({ id }) => id === 'image-error').applicability,
    ).toBe('not-applicable');
    expect(
      matrix
        .find(({ id }) => id === 'live-stage')
        .cases.find(({ id }) => id === 'font-denied').applicability,
    ).toBe('applicable');
  });

  it.each(ids)(
    '%s retains the same displayed defaults through Workbench, IPC, main and Overlay',
    (id) => {
      const template = getOutputWorkbenchData().templates.find(
        (item) => item.id === id,
      );
      const payload = buildOutputSlotPayload({ templateId: id, settings: {} });
      const stored = sanitizeOutputSlot(template.kind, payload);
      const rendered = normalizeOverlayAppearance(stored.settings, {
        templateId: id,
      });
      expect(template.appearanceFields).toEqual(
        outputAppearanceFieldsForTemplate(id),
      );
      for (const field of template.appearanceFields) {
        expect(rendered[field.key]).toEqual(field.defaultValue);
      }
      const invalidCapture = sanitizeOutputSlot(template.kind, {
        ...payload,
        settings: { captureSize: 'not-supported' },
      });
      const { baseline } = loadOutputAppearanceFixtures();
      expect(invalidCapture.settings.captureSize).toBe(
        baseline.templates.find((item) => item.id === id).capture.default,
      );
    },
  );

  it('classifies Live Stage text policy separately from ordinary appearance fields', () => {
    const template = getOutputWorkbenchData().templates.find(
      ({ id }) => id === 'live-stage',
    );
    expect(template.presentationFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'lyricsPresentationPolicyId',
          defaultValue: 'balanced',
        }),
      ]),
    );
    expect(
      sanitizeOutputSlot('lyrics', {
        templateId: 'live-stage',
        settings: { lyricsPresentationPolicyId: 'literal' },
      }).settings.lyricsPresentationPolicyId,
    ).toBe('literal');
    expect(
      sanitizeOutputSlot('lyrics', {
        templateId: 'karaoke-stack',
        settings: { lyricsPresentationPolicyId: 'literal' },
      }).settings,
    ).not.toHaveProperty('lyricsPresentationPolicyId');
  });

  it('preserves playback and lyrics semantics across pause, seek and track changes', () => {
    expect(
      projectOutputScenario('cover-player', createOutputScenario('paused')),
    ).toMatchObject({
      playbackStatus: 'paused',
      positionMs: 5000,
    });
    expect(
      projectOutputScenario(
        'karaoke-stack',
        createOutputScenario('seek-backward'),
      ),
    ).toMatchObject({
      timelineDiscontinuity: true,
    });
    const changed = projectOutputScenario(
      'art-card',
      createOutputScenario('track-change'),
    );
    expect(changed.trackId).toBe('synthetic-track-b');
    expect(changed.title).not.toBe(
      createOutputScenario('playing-t1').snapshot.playback.track.title,
    );
    expect(
      projectOutputScenario('art-card', createOutputScenario('empty')).visible,
    ).toBe(false);
    expect(
      projectOutputScenario(
        'cover-player',
        createOutputScenario('missing-duration'),
      ).progress,
    ).toBe(0);
    const scene = createOutputScenario('playing-t2');
    expect(projectOutputScenario('karaoke-stack', scene)).toEqual(
      selectLyricsOverlayFrame(scene.snapshot, {
        nowMs: scene.nowMs,
        templateId: 'karaoke-stack',
      }),
    );
    expect(
      projectOutputScenario('karaoke-stack', scene).currentTimingSource,
    ).toBe('t2');
  });

  it('keeps numeric and enum changes inside existing template-declared limits', () => {
    const result = normalizeOutputAppearance(
      {
        positionOffsetX: 999,
        positionOffsetY: -999,
        textColor: 'url(file:///private)',
        fontFamily: 'not-a-font',
        lookAmount: 53,
      },
      { templateId: 'ornate-vertical' },
    );
    expect(result).toMatchObject({
      positionOffsetX: 12,
      positionOffsetY: -25,
      lookAmount: 55,
      textColor: '#fff8ec',
      fontFamily: 'ornate',
    });
    expect(
      normalizeOutputAppearance(
        { positionOffsetX: 10 },
        {
          templateId: 'karaoke-stack',
        },
      ).positionOffsetX,
    ).toBe(0);
  });

  it.each(ids)(
    '%s allows installed local font descriptors only when declared',
    (id) => {
      const { baseline } = loadOutputAppearanceFixtures();
      const template = baseline.templates.find((item) => item.id === id);
      const font = {
        source: 'local',
        family: 'Synthetic Display',
        postscriptName: 'SyntheticDisplay',
        style: 'Regular',
      };
      const stored = sanitizeOutputSlot(template.kind, {
        templateId: id,
        settings: { fontFamily: font },
      });
      const appearance = normalizeOutputAppearance(stored.settings, {
        templateId: id,
      });
      if (id === 'live-stage') expect(appearance.fontFamily).toEqual(font);
      else expect(appearance.fontFamily).not.toEqual(font);
      const unsafe = normalizeOutputAppearance(
        { fontFamily: { ...font, family: 'url(file:///private)' } },
        { templateId: id },
      );
      expect(unsafe.fontFamily).not.toEqual(font);
    },
  );

  it('does not grant local font enumeration to an Overlay or nested renderer', () => {
    const main = { getURL: () => 'file:///app/index.html' };
    const details = { isMainFrame: true, requestingUrl: main.getURL() };
    expect(
      isAudioOutputPermissionAllowed(main, 'local-fonts', details, () => main),
    ).toBe(true);
    expect(
      isAudioOutputPermissionAllowed({}, 'local-fonts', details, () => main),
    ).toBe(false);
    expect(
      isAudioOutputPermissionAllowed(
        main,
        'local-fonts',
        { ...details, isMainFrame: false },
        () => main,
      ),
    ).toBe(false);
  });

  it('does not turn arbitrary local image paths or URLs into appearance capabilities', () => {
    for (const id of ids) {
      const value = normalizeOutputAppearance(
        {
          backgroundImage: 'file:///private/image.png',
          imageUrl: 'https://example.invalid/image.png',
        },
        { templateId: id },
      );
      expect(value).not.toHaveProperty('backgroundImage');
      expect(value).not.toHaveProperty('imageUrl');
    }
    const { baseline } = loadOutputAppearanceFixtures();
    expect(baseline.projectShared.automaticCrossTemplateSync).toBe(false);
    expect(baseline.assetPolicy.installedFontBytesTransferred).toBe(false);
    expect(baseline.assetPolicy.trackArtwork.owner).toBe(
      'main-managed-library',
    );
  });

  it('contains a self-authored raster fixture and no production import of F1 tooling', () => {
    const png = readFileSync(
      new URL('./fixtures/output/cover.png', import.meta.url),
    );
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(8);
    expect(png.readUInt32BE(20)).toBe(8);
    const { baseline } = loadOutputAppearanceFixtures();
    for (const file of baseline.productionEntrypoints) {
      expect(
        readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
      ).not.toMatch(/outputAppearanceBaseline|fixtures\/output/);
    }
  });

  it('runs the read-only F1 check without launching Electron or changing fixtures', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/outputAppearanceBaseline.mjs'],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      templates: 8,
      implementationPhase: 'F1',
    });
  });
});

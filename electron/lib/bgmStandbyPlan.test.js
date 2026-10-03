import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BGM_STANDBY_DEFAULT_SETTINGS,
  BGM_STANDBY_PLAN_FILENAME,
  BgmStandbyPlanValidationError,
  createBgmStandbyPlanStore,
  isBgmStandbyPlanValidationError,
} from './bgmStandbyPlan.js';

const tempDirectories = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createHarness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-bgm-'));
  tempDirectories.push(directory);
  const store = createBgmStandbyPlanStore({
    directory,
    now: () => new Date('2026-10-02T04:00:00.000Z'),
  });
  const tracksById = new Map([
    ['track-1', { id: 'track-1', title: 'Night Walk', artist: 'Aimer' }],
    ['track-2', { id: 'track-2', title: 'Morning Air', artist: 'milet' }],
    ['track-3', { id: 'track-3', title: 'Quiet Room', artist: '' }],
  ]);
  return { directory, store, tracksById };
}

describe('createBgmStandbyPlanStore', () => {
  it('starts with a paused scalar-only plan and contract defaults', () => {
    const { store, tracksById } = createHarness();

    expect(store).not.toHaveProperty('addTrack');
    expect(store).not.toHaveProperty('moveTrack');
    expect(store).not.toHaveProperty('removeTrack');
    expect(store).not.toHaveProperty('setCurrentTrack');
    expect(store).not.toHaveProperty('clear');

    expect(store.getProjected(tracksById)).toEqual({
      version: 3,
      updatedAt: null,
      trackIds: [],
      currentTrackId: null,
      positionSeconds: 0,
      settings: BGM_STANDBY_DEFAULT_SETTINGS,
      items: [],
    });
    expect(BGM_STANDBY_DEFAULT_SETTINGS.volume).toBe(0.25);
    expect(BGM_STANDBY_DEFAULT_SETTINGS.dimDb).toBe(-12);
  });

  it('atomically replaces the one main-verified track without persisting metadata or media locations', () => {
    const { directory, store, tracksById } = createHarness();

    const plan = store.setTrack('track-1', tracksById);
    const replaced = store.setTrack('track-2', tracksById);
    const persisted = JSON.parse(
      fs.readFileSync(path.join(directory, BGM_STANDBY_PLAN_FILENAME), 'utf8'),
    );

    expect(plan.currentTrackId).toBe('track-1');
    expect(plan.items).toEqual([
      {
        trackId: 'track-1',
        title: 'Night Walk',
        artist: 'Aimer',
      },
    ]);
    expect(replaced.trackIds).toEqual(['track-2']);
    expect(replaced.currentTrackId).toBe('track-2');
    expect(replaced.positionSeconds).toBe(0);
    expect(persisted.trackIds).toEqual(['track-2']);
    expect(JSON.stringify(persisted)).not.toContain('Night Walk');
    expect(JSON.stringify(persisted)).not.toContain('url');
    expect(store.getProjected(tracksById).trackIds).toEqual(['track-2']);
  });

  it('rejects unavailable and unsafe track ids with bounded validation errors', () => {
    const { store, tracksById } = createHarness();

    expect(() => store.setTrack('missing', tracksById)).toThrowError(
      expect.objectContaining({
        name: 'BgmStandbyPlanValidationError',
        code: 'BGM_TRACK_UNAVAILABLE',
        field: 'trackId',
      }),
    );
    expect(() => store.setTrack('../private', tracksById)).toThrowError(
      BgmStandbyPlanValidationError,
    );
  });

  it('collapses a legacy multi-track document to its selected source', () => {
    const { directory, store, tracksById } = createHarness();
    fs.writeFileSync(
      path.join(directory, BGM_STANDBY_PLAN_FILENAME),
      JSON.stringify({
        version: 1,
        trackIds: ['track-1', 'track-2', 'track-3'],
        currentTrackId: 'track-2',
        positionSeconds: 18,
      }),
      'utf8',
    );

    expect(store.getProjected(tracksById)).toEqual(
      expect.objectContaining({
        trackIds: ['track-2'],
        currentTrackId: 'track-2',
        positionSeconds: 18,
        items: [expect.objectContaining({ trackId: 'track-2' })],
      }),
    );
  });

  it('migrates the unreleased version-one transition defaults to the shorter handoff rhythm', () => {
    const { directory, store, tracksById } = createHarness();
    fs.writeFileSync(
      path.join(directory, BGM_STANDBY_PLAN_FILENAME),
      JSON.stringify({
        version: 1,
        trackIds: ['track-1'],
        currentTrackId: 'track-1',
        positionSeconds: 0,
        settings: {
          volume: 0.5,
          isMuted: false,
          loop: true,
          fadeInSeconds: 1.5,
          fadeOutSeconds: 1,
          dimDb: -12,
          dimAttackMs: 100,
          dimReleaseMs: 600,
          preRollSeconds: 2,
          postRollSeconds: 2,
        },
      }),
      'utf8',
    );

    expect(store.getProjected(tracksById)).toEqual(
      expect.objectContaining({
        version: 3,
        settings: expect.objectContaining({
          volume: 0.25,
          fadeInSeconds: 1,
          fadeOutSeconds: 0.6,
          preRollSeconds: 0.75,
          postRollSeconds: 1,
        }),
      }),
    );
  });

  it('migrates the unreleased version-two defaults without overwriting customized settings', () => {
    const { directory, store, tracksById } = createHarness();
    const filePath = path.join(directory, BGM_STANDBY_PLAN_FILENAME);
    const versionTwoDefaults = {
      volume: 0.5,
      isMuted: false,
      loop: true,
      fadeInSeconds: 1,
      fadeOutSeconds: 0.6,
      dimDb: 20 * Math.log10(0.25),
      dimAttackMs: 100,
      dimReleaseMs: 600,
      preRollSeconds: 0.75,
      postRollSeconds: 1,
    };
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        trackIds: ['track-1'],
        currentTrackId: 'track-1',
        positionSeconds: 12,
        settings: versionTwoDefaults,
      }),
      'utf8',
    );

    expect(store.getProjected(tracksById)).toEqual(
      expect.objectContaining({
        version: 3,
        settings: expect.objectContaining({ volume: 0.25, dimDb: -12 }),
      }),
    );

    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        trackIds: ['track-1'],
        currentTrackId: 'track-1',
        positionSeconds: 12,
        settings: { ...versionTwoDefaults, dimReleaseMs: 900 },
      }),
      'utf8',
    );

    expect(store.getProjected(tracksById).settings).toEqual(
      expect.objectContaining({ volume: 0.5, dimReleaseMs: 900 }),
    );
  });

  it('persists only bounded transition settings and a bounded current position', () => {
    const { store, tracksById } = createHarness();
    store.setTrack('track-1', tracksById);

    const updated = store.updateSettings(
      {
        volume: 0.36,
        isMuted: true,
        loop: false,
        fadeInSeconds: 2.4,
        fadeOutSeconds: 1.2,
        dimDb: -18,
        dimAttackMs: 160,
        dimReleaseMs: 900,
        preRollSeconds: 3,
        postRollSeconds: 4,
        privatePath: 'E:\\private',
      },
      tracksById,
    );
    const positioned = store.updatePosition(
      { trackId: 'track-1', positionSeconds: 42.25 },
      tracksById,
    );

    expect(updated.settings).toEqual({
      volume: 0.36,
      isMuted: true,
      loop: true,
      fadeInSeconds: 2.4,
      fadeOutSeconds: 1.2,
      dimDb: -18,
      dimAttackMs: 160,
      dimReleaseMs: 900,
      preRollSeconds: 3,
      postRollSeconds: 4,
    });
    expect(positioned.positionSeconds).toBe(42.25);
    expect(positioned.settings).not.toHaveProperty('privatePath');
    expect(() =>
      store.updateSettings({ fadeOutSeconds: 9 }, tracksById),
    ).toThrowError(
      expect.objectContaining({ code: 'BGM_SETTING_OUT_OF_RANGE' }),
    );
  });

  it('reconciles deleted tracks and restores preparation without an armed transport state', () => {
    const { store, tracksById } = createHarness();
    store.setTrack('track-2', tracksById);
    store.updatePosition(
      { trackId: 'track-2', positionSeconds: 18 },
      tracksById,
    );

    const projected = store.getProjected(
      new Map([['track-1', tracksById.get('track-1')]]),
    );

    expect(projected.trackIds).toEqual([]);
    expect(projected.currentTrackId).toBeNull();
    expect(projected.positionSeconds).toBe(0);
    expect(projected).not.toHaveProperty('isPlaying');
    expect(projected).not.toHaveProperty('armed');
  });

  it('backs up corrupt data and falls back to a silent empty plan', () => {
    const { directory, store, tracksById } = createHarness();
    fs.writeFileSync(
      path.join(directory, BGM_STANDBY_PLAN_FILENAME),
      '{not-json',
      'utf8',
    );

    expect(store.getProjected(tracksById).trackIds).toEqual([]);
    expect(
      fs
        .readdirSync(directory)
        .some((name) =>
          name.startsWith(`${BGM_STANDBY_PLAN_FILENAME}.corrupt`),
        ),
    ).toBe(true);
  });

  it('keeps no-op mutations silent and rejects malformed bounded intents', () => {
    const { directory, store, tracksById } = createHarness();
    const filePath = path.join(directory, BGM_STANDBY_PLAN_FILENAME);

    expect(store.getProjected(tracksById).trackIds).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);

    store.setTrack('track-1', tracksById);
    expect(store.setTrack('track-1', tracksById)).toEqual(
      expect.objectContaining({ trackIds: ['track-1'] }),
    );
    expect(
      store.updateSettings({ privatePath: 'E:\\private' }, tracksById),
    ).toEqual(
      expect.objectContaining({ settings: BGM_STANDBY_DEFAULT_SETTINGS }),
    );
    expect(
      store.updatePosition(
        { trackId: 'track-1', positionSeconds: 0 },
        tracksById,
      ).positionSeconds,
    ).toBe(0);

    for (const intent of [null, [], { volume: 'loud' }]) {
      expect(() => store.updateSettings(intent, tracksById)).toThrowError(
        expect.objectContaining({ code: 'BGM_INTENT_INVALID' }),
      );
    }

    for (const intent of [
      null,
      {},
      { trackId: '../private', positionSeconds: 1 },
      { trackId: 'track-1', positionSeconds: Number.NaN },
      { trackId: 'track-1', positionSeconds: -1 },
      { trackId: 'track-1', positionSeconds: 86_401 },
    ]) {
      expect(() => store.updatePosition(intent, tracksById)).toThrowError(
        expect.objectContaining({ code: 'BGM_POSITION_INVALID' }),
      );
    }
  });

  it('clears and cascades the selected reference without stale position', () => {
    const { store, tracksById } = createHarness();
    store.setTrack('track-2', tracksById);
    store.updatePosition(
      { trackId: 'track-2', positionSeconds: 12 },
      tracksById,
    );

    expect(store.removeTrackReference('../private')).toBe(false);
    expect(store.removeTrackReference('missing')).toBe(false);
    expect(store.removeTrackReference('track-2')).toBe(true);
    expect(store.removeTrackReference('track-2')).toBe(false);
    expect(store.getProjected(tracksById)).toEqual(
      expect.objectContaining({
        trackIds: [],
        currentTrackId: null,
        positionSeconds: 0,
      }),
    );
    expect(() =>
      store.updatePosition(
        { trackId: 'track-1', positionSeconds: 1 },
        tracksById,
      ),
    ).toThrowError(expect.objectContaining({ code: 'BGM_TRACK_NOT_FOUND' }));
  });

  it('normalizes recoverable scalar data and bounded library projections', () => {
    const { directory, store } = createHarness();
    fs.writeFileSync(
      path.join(directory, BGM_STANDBY_PLAN_FILENAME),
      JSON.stringify({
        version: 1,
        updatedAt: 'not-a-date',
        trackIds: ['track-1', 'track-1', '../unsafe', 'track-2'],
        currentTrackId: 'missing',
        positionSeconds: 86_401,
        settings: {
          volume: Number.NaN,
          isMuted: 'yes',
          loop: false,
          fadeInSeconds: 2,
        },
      }),
      'utf8',
    );

    const projected = store.getProjected([
      { id: 'track-1', title: '   ', artist: 42 },
      { id: '../unsafe', title: 'Unsafe' },
    ]);

    expect(projected).toEqual(
      expect.objectContaining({
        updatedAt: expect.any(String),
        trackIds: ['track-1'],
        currentTrackId: 'track-1',
        positionSeconds: 0,
        settings: expect.objectContaining({
          volume: BGM_STANDBY_DEFAULT_SETTINGS.volume,
          isMuted: BGM_STANDBY_DEFAULT_SETTINGS.isMuted,
          loop: true,
          fadeInSeconds: 2,
        }),
        items: [{ trackId: 'track-1', title: 'track-1', artist: '' }],
      }),
    );
  });

  it.each([
    null,
    [],
    { version: 3, trackIds: [] },
    { version: 1 },
    { version: 1, trackIds: Array.from({ length: 101 }, (_, i) => `t-${i}`) },
  ])('backs up structurally invalid documents: %j', (document) => {
    const { directory, store, tracksById } = createHarness();
    fs.writeFileSync(
      path.join(directory, BGM_STANDBY_PLAN_FILENAME),
      JSON.stringify(document),
      'utf8',
    );

    expect(store.getProjected(tracksById).trackIds).toEqual([]);
  });

  it('exposes bounded validation identity', () => {
    const { store, tracksById } = createHarness();
    let caught;
    try {
      store.setTrack('../private', tracksById);
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(
      expect.objectContaining({
        code: 'BGM_INTENT_INVALID',
      }),
    );
    expect(isBgmStandbyPlanValidationError(caught)).toBe(true);
    expect(isBgmStandbyPlanValidationError(new Error('private'))).toBe(false);
    expect(() => createBgmStandbyPlanStore({ directory: '' })).toThrowError(
      'BGM standby directory is required',
    );
  });
});

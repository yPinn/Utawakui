import { describe, expect, it } from 'vitest';
import {
  DEMO_TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
  resolveDemoTrackCollectionLayout,
  resolveDemoTrackCollectionResizeBounds,
  resolveDemoTrackCollectionResizeWidth,
} from './demoTrackCollectionLayout.js';

function roles(layout) {
  return layout.columns.map((column) => column.role);
}

describe('demo track collection layout', () => {
  it('uses the same token-equivalent gap budget before and after CSS measurement', () => {
    const firstFrame = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 704,
    });
    const measured = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 704,
      ...DEMO_TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
    });

    expect(DEMO_TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS).toEqual({
      columnGap: 8,
      inlinePadding: 24,
    });
    expect(measured).toEqual(firstFrame);
  });

  it('distributes wide default layouts by role while retaining a structural flexible gap', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 1200,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'spacer',
      'separation',
      'duration',
      'actions',
    ]);
    expect(layout.widths).toMatchObject({
      ordinal: 40,
      identity: 720,
      separation: 20,
      duration: 104,
      actions: 20,
    });
    expect(layout.gridTemplate).toContain('minmax(0, 1fr)');
    expect(layout.requiredWidth).toBe(968);
    expect(1200 - layout.requiredWidth).toBeGreaterThan(0);
    expect(layout.hiddenForWidth).toEqual([]);
  });

  it('recomputes the profile distribution when visible fields change', () => {
    const defaults = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 1280,
    });
    const expanded = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: {
        visibleAdvanced: ['release', 'membership', 'usage', 'releaseYear'],
      },
      availableWidth: 1280,
    });

    expect(defaults.widths.identity).toBeGreaterThan(288);
    expect(expanded.widths.identity).toBeGreaterThan(288);
    expect(expanded.widths.identity).toBeLessThan(defaults.widths.identity);
    expect(expanded.widths).toMatchObject({
      usage: 129,
      releaseYear: 121,
    });
    expect(expanded.requiredWidth).toBeLessThan(1280);
  });

  it('treats saved widths as one stable custom layout instead of redistributing neighbors', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: {
        visibleAdvanced: ['release', 'membership'],
        widths: { identity: 420, release: 260, membership: 180 },
      },
      availableWidth: 1200,
    });

    expect(layout.widths).toMatchObject({
      identity: 420,
      release: 260,
      membership: 180,
    });
    expect(layout.requiredWidth).toBe(1124);
  });

  it('projects enabled advanced columns in profile order without mutating preferences', () => {
    const preferences = {
      visibleAdvanced: ['release', 'membership', 'usage', 'releaseYear'],
      widths: { identity: 340, usage: 120 },
    };
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences,
      availableWidth: 1280,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'release',
      'membership',
      'usage',
      'releaseYear',
      'spacer',
      'separation',
      'duration',
      'actions',
    ]);
    expect(layout.widths).toMatchObject({ identity: 340, usage: 120 });
    expect(preferences).toEqual({
      visibleAdvanced: ['release', 'membership', 'usage', 'releaseYear'],
      widths: { identity: 340, usage: 120 },
    });
  });

  it('temporarily collapses advanced columns before default semantic columns', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'library-all',
      preferences: {
        visibleAdvanced: ['releaseYear', 'imported', 'usage'],
        widths: {},
      },
      availableWidth: 760,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'release',
      'releaseYear',
      'spacer',
      'separation',
      'duration',
      'actions',
    ]);
    expect(layout.hiddenForWidth).toEqual(['usage', 'imported']);
  });

  it('uses utility lane minimums during type or container pressure without making them user-resizable', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 704,
    });

    expect(layout.hiddenForWidth).toEqual([]);
    expect(layout.widths.ordinal).toBeGreaterThanOrEqual(32);
    expect(layout.widths.ordinal).toBeLessThan(40);
    expect(layout.widths.duration).toBeGreaterThanOrEqual(96);
    expect(layout.widths.duration).toBeLessThanOrEqual(104);
  });

  it('preserves the minimum identity lane and removes low-priority utility lanes at minimum width', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 336,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'spacer',
      'separation',
      'actions',
    ]);
    expect(layout.widths.identity).toBeGreaterThanOrEqual(200);
    expect(layout.requiredWidth).toBeLessThanOrEqual(336);
    expect(layout.hiddenForWidth).toEqual([
      'membership',
      'release',
      'duration',
    ]);
  });

  it.each(['library-all', 'library-local', 'playlist', 'album', 'artist'])(
    'keeps the %s profile inside the 336px minimum viewport',
    (kind) => {
      const layout = resolveDemoTrackCollectionLayout({
        kind,
        availableWidth: 336,
      });

      expect(layout.requiredWidth).toBeLessThanOrEqual(336);
    },
  );

  it('shrinks default donors deterministically before a saved width override', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: {
        visibleAdvanced: ['release', 'membership'],
        widths: { identity: 340 },
      },
      availableWidth: 840,
    });

    expect(layout.widths.identity).toBe(336);
    expect(layout.widths.membership).toBe(112);
    expect(layout.widths.release).toBe(144);
    expect(layout.widths.duration).toBe(96);
  });

  it('locks the visible role topology while a pointer resize is active', () => {
    const settled = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 720,
    });
    const lockedRoles = roles(settled).filter((role) => role !== 'spacer');
    const resizing = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: [], widths: { identity: 720 } },
      availableWidth: 720,
      lockedRoles,
    });

    expect(roles(resizing)).toEqual(roles(settled));
    expect(resizing.hiddenForWidth).toEqual(settled.hiddenForWidth);
    expect(resizing.widths.identity).toBeGreaterThanOrEqual(200);
  });

  it('clamps a resized column to its own profile bounds before solving fit', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'artist',
      preferences: {
        visibleAdvanced: ['release', 'releaseYear'],
        widths: { identity: 40, release: 900, releaseYear: 90 },
      },
      availableWidth: 1400,
    });

    expect(layout.widths).toMatchObject({
      identity: 200,
      release: 480,
      releaseYear: 90,
    });
  });

  it('uses the resolved CSS gap and inline padding in the fit contract', () => {
    const baseline = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 1200,
    });
    const measured = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 1200,
      columnGap: 12,
      inlinePadding: 40,
    });

    expect(measured.widths.identity).toBeLessThan(baseline.widths.identity);
    expect(measured.widths.release).toBeLessThan(baseline.widths.release);
    expect(measured.widths.membership).toBeLessThan(baseline.widths.membership);
    expect(measured.requiredWidth).toBeLessThanOrEqual(1200);
  });

  it('resizes only the separator start-side column and clamps growth to flexible space', () => {
    const layout = resolveDemoTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 1200,
    });
    const bounds = resolveDemoTrackCollectionResizeBounds({
      startWidth: layout.widths.identity,
      minWidth: 200,
      maxWidth: 720,
      availableWidth: 1200,
      requiredWidth: layout.requiredWidth,
    });

    expect(bounds).toEqual({ minWidth: 200, maxWidth: 476 });
    expect(
      resolveDemoTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: 48,
        direction: 'ltr',
      }),
    ).toBe(460);
    expect(
      resolveDemoTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: -48,
        direction: 'ltr',
      }),
    ).toBe(364);
    expect(
      resolveDemoTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: 1000,
        direction: 'ltr',
      }),
    ).toBe(476);
    expect(layout.widths).toMatchObject({ release: 270, membership: 190 });
  });

  it('reverses physical pointer deltas for a logical RTL column edge', () => {
    const bounds = { minWidth: 200, maxWidth: 420 };

    expect(
      resolveDemoTrackCollectionResizeWidth({
        ...bounds,
        startWidth: 300,
        delta: 40,
        direction: 'rtl',
      }),
    ).toBe(260);
    expect(
      resolveDemoTrackCollectionResizeWidth({
        ...bounds,
        startWidth: 300,
        delta: -40,
        direction: 'rtl',
      }),
    ).toBe(340);
  });
});

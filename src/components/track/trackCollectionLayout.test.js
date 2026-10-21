import { describe, expect, it } from 'vitest';
import {
  TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
  resolveTrackCollectionLayout,
  resolveTrackCollectionResizeBounds,
  resolveTrackCollectionResizeWidth,
} from './trackCollectionLayout.js';

function roles(layout) {
  return layout.columns.map((column) => column.role);
}

describe('track collection layout', () => {
  it.each(['performance-session', 'performance-archive'])(
    'gives %s remaining space to identity and anchors the trailing columns',
    (kind) => {
      const layout = resolveTrackCollectionLayout({
        kind,
        availableWidth: 960,
      });
      expect(layout.gridTemplate).toContain(
        `minmax(${layout.widths.identity}px, 1fr)`,
      );
      expect(layout.gridTemplate.split('minmax(')).toHaveLength(2);
      const spacer = roles(layout).indexOf('spacer');
      expect(spacer).toBeGreaterThan(0);
      expect(
        layout.columns.find((c) => c.role === 'performanceStatus'),
      ).toMatchObject({ align: 'end', headerAlign: 'end' });
      expect(layout.widths.performanceStatus).toBe(112);
    },
  );
  it('keeps session actions reachable and collapses status for the owner-provided subtitle at narrow widths', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'performance-session',
      availableWidth: 251,
    });
    expect(roles(layout)).toEqual(['identity', 'spacer', 'performanceActions']);
    expect(layout.hiddenForWidth).toEqual([
      'duration',
      'performanceStatus',
      'ordinal',
    ]);
    expect(layout.requiredWidth).toBeLessThanOrEqual(251);
    expect(layout.widths.performanceActions).toBe(80);
  });
  it('retains archive identity and status within a narrow document after collapsing duration and ordinal', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'performance-archive',
      availableWidth: 267,
    });
    expect(roles(layout)).toEqual(['identity', 'spacer', 'performanceStatus']);
    expect(layout.hiddenForWidth).toEqual(['duration', 'ordinal']);
    expect(layout.requiredWidth).toBeLessThanOrEqual(267);
    expect(layout.widths.identity).toBeGreaterThanOrEqual(112);
    expect(layout.widths.performanceStatus).toBeGreaterThanOrEqual(112);
  });
  it('uses the same token-equivalent gap budget before and after CSS measurement', () => {
    const firstFrame = resolveTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 704,
    });
    const measured = resolveTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 704,
      ...TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
    });

    expect(TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS).toEqual({
      columnGap: 8,
      inlinePadding: 24,
    });
    expect(measured).toEqual(firstFrame);
  });

  it('balances title, album, and the trailing group in the default-window content box', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'library-all',
      availableWidth: 768,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'release',
      'usage',
      'spacer',
      'duration',
      'actions',
    ]);
    expect(layout.widths).toMatchObject({
      ordinal: 40,
      identity: 296,
      release: 144,
      usage: 88,
      duration: 104,
      actions: 24,
    });
    expect(layout.requiredWidth).toBe(768);
    expect(768 - layout.requiredWidth).toBe(0);
    expect(layout.hiddenForWidth).toEqual([]);
  });

  it.each(['library-all', 'library-local', 'playlist', 'album', 'artist'])(
    'keeps every default %s field visible in the 768px default-window content box',
    (kind) => {
      const layout = resolveTrackCollectionLayout({
        kind,
        availableWidth: 768,
      });

      expect(layout.hiddenForWidth).toEqual([]);
      expect(layout.requiredWidth).toBeLessThanOrEqual(768);
    },
  );

  it('distributes wide default layouts by role while retaining a structural flexible gap', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 1200,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'spacer',
      'duration',
      'actions',
    ]);
    expect(layout.widths).toMatchObject({
      ordinal: 40,
      identity: 720,
      duration: 104,
      actions: 24,
    });
    expect(layout.gridTemplate).toContain('minmax(0, 1fr)');
    expect(layout.requiredWidth).toBe(944);
    expect(1200 - layout.requiredWidth).toBeGreaterThan(0);
    expect(layout.hiddenForWidth).toEqual([]);
  });

  it('recomputes the profile distribution when visible fields change', () => {
    const defaults = resolveTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 1280,
    });
    const expanded = resolveTrackCollectionLayout({
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
      usage: 132,
      releaseYear: 124,
    });
    expect(expanded.requiredWidth).toBeLessThan(1280);
  });

  it('treats saved widths as one stable custom layout instead of redistributing neighbors', () => {
    const layout = resolveTrackCollectionLayout({
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
    expect(layout.requiredWidth).toBe(1100);
  });

  it('projects enabled advanced columns in profile order without mutating preferences', () => {
    const preferences = {
      visibleAdvanced: ['release', 'membership', 'usage', 'releaseYear'],
      widths: { identity: 340, usage: 120 },
    };
    const layout = resolveTrackCollectionLayout({
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
    const layout = resolveTrackCollectionLayout({
      kind: 'library-all',
      preferences: {
        visibleAdvanced: ['releaseYear', 'imported'],
        widths: {},
      },
      availableWidth: 760,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'release',
      'usage',
      'releaseYear',
      'spacer',
      'duration',
      'actions',
    ]);
    expect(layout.hiddenForWidth).toEqual(['imported']);
  });

  it('preserves structural lanes while data columns absorb default-window pressure', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 704,
    });

    expect(layout.hiddenForWidth).toEqual([]);
    expect(layout.widths.ordinal).toBe(40);
    expect(layout.widths.duration).toBe(104);
    expect(layout.widths).toMatchObject({
      identity: 208,
      release: 144,
      membership: 112,
    });
  });

  it('preserves the minimum identity lane and removes low-priority utility lanes at minimum width', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 336,
    });

    expect(roles(layout)).toEqual([
      'ordinal',
      'identity',
      'spacer',
      'duration',
      'actions',
    ]);
    expect(layout.widths.identity).toBeGreaterThanOrEqual(128);
    expect(layout.requiredWidth).toBeLessThanOrEqual(336);
    expect(layout.hiddenForWidth).toEqual(['membership', 'release']);
  });

  it.each(['library-all', 'library-local', 'playlist', 'album', 'artist'])(
    'keeps the %s profile inside the 336px minimum viewport',
    (kind) => {
      const layout = resolveTrackCollectionLayout({
        kind,
        availableWidth: 336,
      });

      expect(layout.requiredWidth).toBeLessThanOrEqual(336);
    },
  );

  it('shrinks a saved width only after the remaining donor lanes reach their bounds', () => {
    const layout = resolveTrackCollectionLayout({
      kind: 'playlist',
      preferences: {
        visibleAdvanced: ['release', 'membership'],
        widths: { identity: 340 },
      },
      availableWidth: 840,
    });

    expect(layout.widths.identity).toBe(340);
    expect(layout.widths.membership).toBe(112);
    expect(layout.widths.release).toBe(148);
    expect(layout.widths.duration).toBe(104);
  });

  it('locks the visible role topology while a pointer resize is active', () => {
    const settled = resolveTrackCollectionLayout({
      kind: 'playlist',
      availableWidth: 720,
    });
    const lockedRoles = roles(settled).filter((role) => role !== 'spacer');
    const resizing = resolveTrackCollectionLayout({
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
    const layout = resolveTrackCollectionLayout({
      kind: 'artist',
      preferences: {
        visibleAdvanced: ['release', 'releaseYear'],
        widths: { identity: 40, release: 900, releaseYear: 90 },
      },
      availableWidth: 1400,
    });

    expect(layout.widths).toMatchObject({
      identity: 128,
      release: 480,
      releaseYear: 90,
    });
  });

  it('uses the resolved CSS gap and inline padding in the fit contract', () => {
    const baseline = resolveTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 1200,
    });
    const measured = resolveTrackCollectionLayout({
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
    const layout = resolveTrackCollectionLayout({
      kind: 'playlist',
      preferences: { visibleAdvanced: ['release', 'membership'] },
      availableWidth: 1200,
    });
    const bounds = resolveTrackCollectionResizeBounds({
      startWidth: layout.widths.identity,
      minWidth: 128,
      maxWidth: 720,
      availableWidth: 1200,
      requiredWidth: layout.requiredWidth,
    });

    expect(bounds).toEqual({ minWidth: 128, maxWidth: 490 });
    expect(
      resolveTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: 48,
        direction: 'ltr',
      }),
    ).toBe(470);
    expect(
      resolveTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: -48,
        direction: 'ltr',
      }),
    ).toBe(374);
    expect(
      resolveTrackCollectionResizeWidth({
        ...bounds,
        startWidth: layout.widths.identity,
        delta: 1000,
        direction: 'ltr',
      }),
    ).toBe(490);
    expect(layout.widths).toMatchObject({ release: 275, membership: 195 });
  });

  it('reverses physical pointer deltas for a logical RTL column edge', () => {
    const bounds = { minWidth: 200, maxWidth: 420 };

    expect(
      resolveTrackCollectionResizeWidth({
        ...bounds,
        startWidth: 300,
        delta: 40,
        direction: 'rtl',
      }),
    ).toBe(260);
    expect(
      resolveTrackCollectionResizeWidth({
        ...bounds,
        startWidth: 300,
        delta: -40,
        direction: 'rtl',
      }),
    ).toBe(340);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveShellLayout } from './shellLayout.js';
const resolve = (width, options = {}) =>
  resolveShellLayout({
    width,
    sidebarPreference: 256,
    dockPreference: 280,
    dockExpanded: true,
    ...options,
  });
describe('in-flow shell space allocation', () => {
  it('collapses navigation before reducing the requested Dock width', () => {
    expect(resolve(1216)).toMatchObject({
      sidebarWidth: 256,
      dockWidth: 280,
      dockBayWidth: 280,
    });
    expect(resolve(1215)).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 280,
      autoCollapsed: true,
    });
    expect(resolve(1320, { dockPreference: 384 }).sidebarWidth).toBe(256);
    expect(resolve(1319, { dockPreference: 384 })).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 384,
    });
  });
  it('keeps the Dock in flow at the narrowest supported window, letting the center reflow', () => {
    expect(resolve(1120, { dockPreference: 384 })).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 376,
      dockMaximum: 376,
      dockBayWidth: 376,
    });
    const narrow = resolve(960, { dockPreference: 384 });
    expect(narrow).toMatchObject({
      sidebarWidth: 64,
      dockWidth: 272,
      dockBayWidth: 272,
    });
    expect(960 - narrow.sidebarWidth - narrow.dockBayWidth - 40).toBe(584);
  });
  it('preserves the requested composition bay while collapsed at roomy widths', () => {
    expect(
      resolve(1280, { dockPreference: 384, dockExpanded: false }),
    ).toMatchObject({ sidebarWidth: 64, dockWidth: 384, dockBayWidth: 384 });
    expect(resolve(1440, { dockExpanded: false })).toMatchObject({
      sidebarWidth: 256,
      dockBayWidth: 280,
    });
    expect(resolve(1216, { dockExpanded: false }).sidebarWidth).toBe(256);
    expect(resolve(1215, { dockExpanded: false })).toMatchObject({
      sidebarWidth: 64,
      dockBayWidth: 280,
    });
  });
  it('compresses folded whitespace to the same minimum as expanded content', () => {
    for (const [width, expected] of [
      [1128, 384],
      [1127, 383],
      [1016, 272],
      [960, 272],
    ]) {
      expect(
        resolve(width, { dockPreference: 384, dockExpanded: false }),
      ).toMatchObject({
        sidebarWidth: 64,
        dockWidth: 384,
        dockBayWidth: expected,
      });
    }
    expect(resolve(1024, { dockExpanded: false }).dockBayWidth).toBe(280);
    expect(resolve(1023, { dockExpanded: false }).dockBayWidth).toBe(279);
    expect(
      resolve(960, { dockPreference: 384, dockExpanded: false }),
    ).toMatchObject({ sidebarWidth: 64, dockWidth: 384, dockBayWidth: 272 });
  });
  it('uses recovery headroom and preserves manual collapse', () => {
    expect(resolve(1279, { wasAutoCollapsed: true }).sidebarWidth).toBe(64);
    expect(resolve(1280, { wasAutoCollapsed: true }).sidebarWidth).toBe(256);
    expect(
      resolve(1279, { dockExpanded: false, wasAutoCollapsed: true })
        .sidebarWidth,
    ).toBe(64);
    expect(
      resolve(1280, { dockExpanded: false, wasAutoCollapsed: true })
        .sidebarWidth,
    ).toBe(256);
    expect(
      resolve(1920, { sidebarPreference: 64, wasAutoCollapsed: true }),
    ).toMatchObject({ sidebarWidth: 64, autoCollapsed: false });
  });
  it('lets explicit navigation expansion occupy its full width at a narrow window', () => {
    const forced = resolve(960, {
      dockPreference: 384,
      forceSidebarExpanded: true,
    });
    expect(forced).toMatchObject({
      sidebarWidth: 256,
      autoCollapsed: false,
      dockBayWidth: 272,
    });
    expect(960 - forced.sidebarWidth - forced.dockBayWidth - 40).toBe(392);
    const folded = resolve(960, {
      dockExpanded: false,
      forceSidebarExpanded: true,
    });
    expect(folded).toMatchObject({ sidebarWidth: 256, dockBayWidth: 272 });
    expect(960 - folded.sidebarWidth - folded.dockBayWidth - 40).toBe(392);
  });
  it('accounts for measured tokens and bounds exceptional measurements', () => {
    expect(resolve(1216, { overhead: 56 }).sidebarWidth).toBe(64);
    expect(resolve(1216, { minimumWorkspace: 704 }).sidebarWidth).toBe(64);
    expect(resolve(NaN).sidebarWidth).toBe(64);
    expect(
      resolve(200, { dockPreference: Infinity }).dockWidth,
    ).toBeLessThanOrEqual(200);
    expect(
      resolve(1920, { sidebarPreference: 900, dockPreference: 999 }).dockWidth,
    ).toBe(384);
  });
  it.each([true, false])(
    'never overlaps during a full shrink/recovery sweep, expanded=%s',
    (dockExpanded) => {
      let previous = {};
      for (const width of [
        ...Array.from({ length: 801 }, (_, i) => 1760 - i),
        ...Array.from({ length: 801 }, (_, i) => 960 + i),
      ]) {
        const next = resolve(width, {
          dockPreference: 384,
          dockExpanded,
          wasAutoCollapsed: previous.autoCollapsed,
        });
        expect(
          width - next.sidebarWidth - next.dockBayWidth - 40,
        ).toBeGreaterThanOrEqual(584);
        if (dockExpanded) expect(next.dockBayWidth).toBe(next.dockWidth);
        else expect(next.dockWidth).toBe(384);
        previous = next;
      }
      expect(previous).toMatchObject({
        sidebarWidth: 256,
        dockWidth: 384,
        dockBayWidth: 384,
      });
    },
  );
  it.each([272, 280, 384])(
    'keeps workspace geometry invariant on disclosure at every supported width, preferred=%s',
    (dockPreference) => {
      for (const sidebarPreference of [64, 256]) {
        for (const forceSidebarExpanded of [false, true]) {
          for (let width = 960; width <= 1760; width++) {
            const options = {
              dockPreference,
              sidebarPreference,
              forceSidebarExpanded,
            };
            const open = resolve(width, options);
            const closed = resolve(width, { ...options, dockExpanded: false });
            expect(closed.sidebarWidth).toBe(open.sidebarWidth);
            expect(closed.dockBayWidth).toBe(open.dockBayWidth);
            expect(closed.autoCollapsed).toBe(open.autoCollapsed);
          }
        }
      }
    },
  );
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const html = readFileSync(
  fileURLToPath(new URL('./index.html', import.meta.url)),
  'utf8',
);
const css = readFileSync(
  fileURLToPath(new URL('./lyrics.css', import.meta.url)),
  'utf8',
);

function numericTypeStep(variableName) {
  const match = css.match(
    new RegExp(`--${variableName}:\\s*([0-9.]+)(?:rem|em);`, 'u'),
  );
  return match ? Number(match[1]) : null;
}

describe('Live Stage overlay layout contract', () => {
  it('owns bounded Workbench composition inside the live inspection iframe', () => {
    expect(html).toContain('class="lyrics-workbench__backdrop"');
    expect(html).toContain('class="lyrics-workbench__guide"');
    expect(css).toContain(
      ":root[data-overlay-workbench='true'] .lyrics-workbench__backdrop",
    );
    expect(css).toMatch(
      /:root\[data-overlay-workbench='true'\]\[data-overlay-guide='true'\]\s+\.lyrics-workbench__guide/u,
    );
    expect(css).toContain(
      ":root[data-overlay-backdrop='checker'] .lyrics-workbench__backdrop",
    );
    expect(css).toContain("url('/workbench/streamer-guide.png')");
  });

  it('owns original display-first branding and balanced lower information lanes', () => {
    expect(html).toContain('id="lyrics-live-stage-chrome"');
    expect(html).toContain('id="lyrics-live-stage-card"');
    expect(html).toContain('id="lyrics-live-stage-title"');
    expect(html).toContain('id="lyrics-live-stage-artist"');
    expect(html).not.toMatch(/Mnet|M COUNTDOWN|Genie/i);

    expect(css).toContain(":root[data-ovl-template='live-stage']");
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\],\s*:root\[data-ovl-template='live-stage'\] body\s*\{\s*background: transparent;/u,
    );
    expect(css).toContain('--ovl-live-stage-inline-start: 6.25%');
    expect(css).toContain('--ovl-live-stage-inline-end: 5%');
    expect(css).toContain('--ovl-live-stage-block-start: 5.556%');
    expect(css).toContain('--ovl-live-stage-block-end: 8.333%');
    expect(css).toContain(
      '--ovl-live-stage-caption-inline-size: min(34%, 42rem)',
    );
    expect(css).toContain('--ovl-live-stage-card-inline-size: min(32%, 39rem)');
    expect(css).toContain('--ovl-live-stage-brand-mark-size: 4.5rem');
    expect(css).toContain('--ovl-live-stage-channel-size: 4rem');
    expect(css).toContain('--ovl-live-stage-card-block-size: 7.5rem');
    expect(css).toContain('--ovl-live-stage-card-mark-inline-size: 9rem');
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\] \.lyrics-overlay__current\s*\{[\s\S]*?inline-size:\s*var\(--ovl-live-stage-caption-inline-size\);/u,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-card\s*\{[\s\S]*?display: grid/u,
    );
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\] \.lyrics-overlay__live-stage-card\s*\{[\s\S]*?inline-size:\s*var\(--ovl-live-stage-card-inline-size\);/u,
    );
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\] \.lyrics-overlay__live-stage-card-copy\s*\{[\s\S]*?display: grid;/u,
    );
    expect(css).toContain('.lyrics-overlay__live-stage-caption-line');
    expect(css).toContain('white-space: nowrap');
    expect(css).not.toContain('data-live-stage-caption-length');
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\] \.lyrics-overlay__current\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-caption\);[\s\S]*?font-weight: 700;[\s\S]*?line-height: 1\.06;/u,
    );
    expect(css).toContain('.lyrics-overlay__next');
    expect(css).not.toContain('inline-size: min(20%, 24rem)');
    expect(css).not.toContain('grid-template-columns: 10rem minmax(0, 1fr)');
  });

  it('uses an explicit display-first type ladder for every visible text role', () => {
    const steps = [
      numericTypeStep('ovl-live-stage-type-label'),
      numericTypeStep('ovl-live-stage-type-support'),
      numericTypeStep('ovl-live-stage-type-title'),
      numericTypeStep('ovl-live-stage-type-caption'),
    ];

    expect(steps).toEqual([1.125, 1.5, 2.5, 3.5]);
    expect(
      steps.every((step, index) => index === 0 || step > steps[index - 1]),
    ).toBe(true);
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-brand-copy\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-label\);/u,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-brand-copy\s+strong\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-support\);/u,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-title\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-title\);/u,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-artist\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-support\);/u,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__current\s*\{[\s\S]*?font-size:\s*var\(--ovl-live-stage-type-caption\);/u,
    );
  });

  it('keeps the enlarged stage brand legible over bright stage lighting', () => {
    expect(css).toMatch(
      /:root\[data-ovl-template='live-stage'\] \.lyrics-overlay__live-stage-brand-copy\s*\{[\s\S]*?-webkit-text-stroke:\s*0\.04em var\(--ovl-user-stroke-strong\);[\s\S]*?paint-order:\s*stroke fill;/u,
    );
  });
});

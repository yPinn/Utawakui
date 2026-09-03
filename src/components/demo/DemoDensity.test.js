import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoDensity from './DemoDensity.vue';

const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoDensity.vue', import.meta.url),
  'utf8',
);
const researchSource = readFileSync(
  new URL(
    '../../../docs/research/visual-system-foundation-2026-08-28.md',
    import.meta.url,
  ),
  'utf8',
);

const densityContracts = [
  [
    'control',
    'Ordinary control height',
    '--ui-control-height',
    '2.25rem',
    36,
    '2rem',
    32,
  ],
  [
    'live',
    'Live action target',
    '--ui-control-height-live',
    '2.75rem',
    44,
    '2.75rem',
    44,
  ],
  [
    'emergency',
    'Emergency action target',
    '--ui-control-height-emergency',
    '3rem',
    48,
    '3rem',
    48,
  ],
  [
    'track-row',
    'Track row minimum',
    '--ui-track-row-min-height',
    '3.25rem',
    52,
    '2.75rem',
    44,
  ],
  [
    'sidebar-row',
    'Sidebar row minimum',
    '--ui-sidebar-row-min-height',
    '3.25rem',
    52,
    '3rem',
    48,
  ],
  [
    'artwork',
    'Track artwork',
    '--ui-track-artwork-size',
    '2.5rem',
    40,
    '2.25rem',
    36,
  ],
  [
    'list-header',
    'List header',
    '--ui-list-header-height',
    '2.25rem',
    36,
    '2rem',
    32,
  ],
  [
    'player-bar',
    'Player bar',
    '--ui-player-bar-height',
    '4.75rem',
    76,
    '4.25rem',
    68,
  ],
  ['panel-inset', 'Panel inset', '--ui-panel-inset', '1rem', 16, '0.75rem', 12],
  [
    'shell-gutter',
    'Shell gutter',
    '--ui-shell-gutter',
    '0.75rem',
    12,
    '0.5rem',
    8,
  ],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('DemoDensity', () => {
  it('keeps visible labels outside both density previews', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    for (const mode of ['standard', 'compact']) {
      const preview = html.match(
        new RegExp(
          `<div[^>]*data-density-preview="${mode}"[^>]*>([\\s\\S]*?)</div>`,
          'u',
        ),
      )?.[1];

      expect(preview).toBeDefined();
      expect(preview.replace(/<[^>]+>/gu, '').trim()).toBe('');
      expect(preview.match(/class="demo-density-specimen"/gu)).toHaveLength(10);
      expect(html).toMatch(
        new RegExp(
          `<div[^>]*data-density-preview="${mode}"[^>]*aria-hidden="true"`,
          'u',
        ),
      );
      expect(preview).not.toContain('aria-label');
    }
  });

  it('shows the complete candidate matrix in a separate reference table', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    expect(html).toContain('Standard 是目前預設工作密度');
    expect(html).toContain('Compact 是窄幅候選');
    expect(html).toContain('Live／緊急操作維持固定安全下限');
    expect(html).toContain('data-density-reference="matrix"');

    for (const [
      key,
      researchLabel,
      token,
      standard,
      standardDip,
      compact,
      compactDip,
    ] of densityContracts) {
      expect(tokenSource).toContain(`${token}: ${standard};`);
      expect(html).toMatch(
        new RegExp(
          `data-density-contract="${key}"[^>]*>[\\s\\S]*?${escapeRegExp(token)}[\\s\\S]*?${escapeRegExp(standard)}[\\s\\S]*?${standardDip} DIP[\\s\\S]*?${escapeRegExp(compact)}[\\s\\S]*?${compactDip} DIP[\\s\\S]*?</tr>`,
          'u',
        ),
      );
      expect(researchSource).toMatch(
        new RegExp(
          `\\|\\s*${escapeRegExp(researchLabel)}\\s*\\|\\s*\`${escapeRegExp(standard)}\`\\s*\\|\\s*\`${escapeRegExp(compact)}\`\\s*\\|`,
          'u',
        ),
      );
    }
  });

  it('keeps compact as a discrete remap and preserves safety floors', () => {
    const compactBlock = tokenSource.match(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    for (const [key, , token, , , compact] of densityContracts) {
      if (key === 'live' || key === 'emergency') continue;
      expect(compactBlock).toContain(`${token}: ${compact};`);
    }
    expect(compactBlock).not.toContain('--ui-control-height-live');
    expect(compactBlock).not.toContain('--ui-control-height-emergency');
  });

  it('wraps previews from their actual container width', () => {
    expect(componentSource).toContain(
      'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
    );
    expect(componentSource).not.toContain('repeat(2, minmax(14rem, 1fr))');
  });
});

import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoDensity from './DemoDensity.vue';

const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const activeTokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoDensity.vue', import.meta.url),
  'utf8',
);
const consumerSources = [
  '../ui/UiButton.vue',
  '../ui/UiIconButton.vue',
  '../ui/UiTrackRow.vue',
  '../playlists/PlaylistSidebarRow.vue',
  '../playlists/StudioLibraryTrackTable.vue',
  '../playback/PlayerBar.vue',
  '../playlists/StudioLibraryDossier.vue',
  '../layout/AppArchiveFrame.vue',
].map((filename) => ({
  filename,
  source: readFileSync(new URL(filename, import.meta.url), 'utf8'),
}));

const densityContracts = [
  ['control', '一般控制高度', '--ui-control-height', '2.25rem', 36, '2rem', 32],
  [
    'live',
    'Live 操作下限',
    '--ui-control-height-live',
    '2.75rem',
    44,
    '2.75rem',
    44,
  ],
  [
    'emergency',
    '緊急操作下限',
    '--ui-control-height-emergency',
    '3rem',
    48,
    '3rem',
    48,
  ],
  [
    'track-row',
    '曲目列最小高度',
    '--ui-track-row-min-height',
    '3.25rem',
    52,
    '2.75rem',
    44,
  ],
  [
    'sidebar-row',
    '側欄列最小高度',
    '--ui-sidebar-row-min-height',
    '3.25rem',
    52,
    '3rem',
    48,
  ],
  [
    'artwork',
    '曲目封面',
    '--ui-track-artwork-size',
    '2.5rem',
    40,
    '2.25rem',
    36,
  ],
  [
    'list-header',
    '列表標頭',
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
  it('separates Token v2 candidates from current implementation mappings', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));
    const candidateIndex = html.indexOf('data-density-layer="candidate"');
    const currentIndex = html.indexOf('data-density-layer="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 密度候選');
    expect(html).toContain('現有設定檔／元件映射');
    expect(html).toContain('data-density-visual="candidate"');
    expect(html).toContain('data-density-visual="current"');
  });

  it('shows the complete candidate matrix in CSS px rather than DIP', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    expect(html).toContain('Standard 是預設候選密度');
    expect(html).toContain('Compact 是離散候選映射');
    expect(html).toContain('Live／緊急操作維持固定安全下限');
    expect(html).toContain('data-density-reference="candidate"');
    expect(html).not.toContain('DIP');
    expect(html).not.toContain('1440 × 810');
    expect(html).not.toContain('960 × 650');

    for (const [
      key,
      label,
      token,
      standard,
      standardPx,
      compact,
      compactPx,
    ] of densityContracts) {
      expect(tokenSource).toContain(`${token}: ${standard};`);
      expect(html).toMatch(
        new RegExp(
          `data-density-contract="${key}"[^>]*>[\\s\\S]*?${escapeRegExp(label)}[\\s\\S]*?${escapeRegExp(token)}[\\s\\S]*?${escapeRegExp(standard)}[\\s\\S]*?${standardPx} CSS px[\\s\\S]*?${escapeRegExp(compact)}[\\s\\S]*?${compactPx} CSS px[\\s\\S]*?</article>`,
          'u',
        ),
      );
    }
    expect(html.match(/data-density-contract=/gu)).toHaveLength(10);
  });

  it('renders one-to-one geometry while keeping copy outside every stage', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));
    const stages = [
      ...html.matchAll(
        /<div class="demo-density__stage"[^>]*>([\s\S]*?)<\/div>/gu,
      ),
    ];

    expect(stages).toHaveLength(20);
    expect(html.match(/data-density-specimen=/gu)).toHaveLength(27);
    expect(html.match(/data-density-specimen="standard"/gu)).toHaveLength(10);
    expect(html.match(/data-density-specimen="compact"/gu)).toHaveLength(10);
    expect(html.match(/data-density-specimen="current"/gu)).toHaveLength(7);
    expect(componentSource).toContain("'--demo-density-size': sample.size");
    expect(componentSource).toContain('height: var(--demo-density-size)');
    expect(componentSource).toContain('inline-size: var(--demo-density-size)');

    for (const [, stageContents] of stages) {
      expect(stageContents.replace(/<[^>]*>/gu, '').trim()).toBe('');
    }

    for (const size of [
      '2.25rem',
      '2rem',
      '2.75rem',
      '3rem',
      '3.25rem',
      '2.5rem',
      '4.75rem',
      '4.25rem',
      '1rem',
      '0.75rem',
      '0.5rem',
      '1.875rem',
      '3.375rem',
    ]) {
      expect(html).toContain(`--demo-density-size:${size}`);
    }

    for (const shape of ['square', 'height', 'space']) {
      expect(html).toContain(`data-density-shape="${shape}"`);
    }
    expect(html.match(/data-density-unmapped="true"/gu)).toHaveLength(4);
  });

  it('reflows from its own available width without undefined typography tokens', () => {
    expect(componentSource).toContain('container-type: inline-size;');
    expect(componentSource).toMatch(
      /@container \(max-width: 48rem\)[\s\S]*?\.demo-density__row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u,
    );
    expect(componentSource).not.toContain('@media (max-width: 48rem)');
    expect(componentSource).not.toContain('--ui-font-size-xs');
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

  it('lists one truthful current mapping for every candidate contract', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    for (const [key] of densityContracts) {
      expect(html).toContain(`data-current-density-mapping="${key}"`);
    }
    expect(html.match(/data-current-density-mapping=/gu)).toHaveLength(10);
    expect(html).toContain('一般控制 1.875rem／30 CSS px');
    expect(html).toContain('Icon Button 另有 2rem／32 CSS px 下限');
    expect(html).toContain('Sidebar 列 54 CSS px');
    expect(html).toContain('列表標頭尚無 active token');
    expect(html).toContain('Panel inset 尚無 active token');
    expect(html).toContain('Shell gutter 尚無 active token');
    expect(html).toContain('尚未映射');
    expect(html).toContain('部分映射');
  });

  it('anchors current mappings to active tokens and real consumers', () => {
    for (const declaration of [
      '--ui-control-height: 1.875rem;',
      '--ui-icon-button-size-md: var(--ui-space-6);',
      '--ui-icon-button-size-lg: 2.75rem;',
      '--ui-track-row-min-height: 3.25rem;',
      '--ui-track-row-thumb-size: 2.5rem;',
      '--ui-playlist-row-min-height: var(',
      '--ui-player-bar-height: calc(',
    ]) {
      expect(activeTokenSource).toContain(declaration);
    }
    for (const missing of [
      '--ui-control-height-emergency',
      '--ui-sidebar-row-min-height',
      '--ui-track-artwork-size',
      '--ui-list-header-height',
      '--ui-panel-inset',
      '--ui-shell-gutter',
    ]) {
      expect(activeTokenSource).not.toContain(missing);
    }

    const sourceByName = new Map(
      consumerSources.map(({ filename, source }) => [filename, source]),
    );
    expect(sourceByName.get('../ui/UiButton.vue')).toContain(
      'min-height: var(--ui-control-height)',
    );
    expect(sourceByName.get('../ui/UiIconButton.vue')).toContain(
      '--ui-icon-btn-size: var(--ui-icon-button-size-md)',
    );
    expect(sourceByName.get('../ui/UiTrackRow.vue')).toContain(
      'min-height: var(--ui-track-row-min-height)',
    );
    expect(sourceByName.get('../playlists/PlaylistSidebarRow.vue')).toContain(
      'min-height: var(--ui-playlist-row-min-height)',
    );
    expect(
      sourceByName.get('../playlists/StudioLibraryTrackTable.vue'),
    ).toContain('min-height: var(--ui-list-header-height)');
    expect(sourceByName.get('../playback/PlayerBar.vue')).toContain(
      'height: var(--ui-player-bar-height)',
    );
    expect(sourceByName.get('../playlists/StudioLibraryDossier.vue')).toContain(
      'padding: var(--ui-panel-inset)',
    );
    expect(sourceByName.get('../layout/AppArchiveFrame.vue')).toContain(
      'gap: var(--ui-shell-gutter)',
    );
  });
});

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import { Headphones, Volume2 } from '../../icons/index.js';

const source = fs.readFileSync(
  new URL('./PlayerToolsPanel.vue', import.meta.url),
  'utf8',
);
const barSource = fs.readFileSync(
  new URL('./PlayerBar.vue', import.meta.url),
  'utf8',
);

async function render(props = {}) {
  const context = {};
  const html = await renderToString(
    createSSRApp({
      render: () => h(PlayerToolsPanel, { open: true, ...props }),
    }),
    context,
  );
  return html + Object.values(context.teleports ?? {}).join('');
}

describe('PlayerToolsPanel shared surface', () => {
  it('reads the reference frequency before the primary cents value', async () => {
    const html = await render({
      hasTrack: true,
      pitchTempoRows: [
        {
          key: 'pitch',
          label: '音高微調',
          value: '+50 音分',
          secondaryValue: '452.9 Hz',
          sliderValue: 50,
          defaultValue: 0,
          min: -50,
          max: 50,
          step: 1,
          sliderLabel: '音分',
          minusLabel: '降低音分',
          plusLabel: '提高音分',
        },
      ],
    });
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text.indexOf('452.9 Hz')).toBeLessThan(text.indexOf('+50 音分'));
  });

  it('uses an anchored shared popover with guide mixing as the second linked tab', async () => {
    expect(source).toContain('<UiPopover');
    expect(source).not.toContain('PlayerBarPanel');
    expect(source).toContain('placement="top-end"');
    expect(source).toContain('scroll-axis="vertical"');
    expect(source).toContain('focus-on-open');
    expect(source).toContain('variant="bar"');
    const html = await render();
    expect(html).toContain('演出工具');
    expect(html).toContain('調整');
    expect(html).not.toContain('選擇節拍監聽裝置');
    for (const id of ['adjust', 'guide', 'live'])
      expect(html).toContain(`player-tools-${id}-panel`);
    expect(html.indexOf('id="player-tools-adjust-tab"')).toBeLessThan(
      html.indexOf('id="player-tools-guide-tab"'),
    );
    expect(html.indexOf('id="player-tools-guide-tab"')).toBeLessThan(
      html.indexOf('id="player-tools-live-tab"'),
    );
    expect(html).not.toContain('player-tools-process-panel');
  });

  it('follows the shared RightDock width without a second width owner', async () => {
    const dock = useAppRightDockWidth();
    try {
      dock.setWidth(272);
      expect(await render()).toContain('inline-size:272px');
      dock.setWidth(280);
      expect(await render()).toContain('inline-size:280px');
      expect(source).not.toMatch(/22\.5rem|position:\s*fixed/);
    } finally {
      dock.setWidth(280);
    }
  });

  it('removes the duplicate separation entry and dedicated PlayerBar wiring', async () => {
    for (const value of [
      'SeparationPresetControl',
      'generateSeparation',
      'selectSeparationPreset',
      'separationPresetOptions',
    ]) {
      expect(source).not.toContain(value);
      expect(barSource).not.toContain(value);
    }
    expect(barSource).not.toContain('useSeparation');
    expect(source).toContain('<UiIconButton');
    const html = await render();
    expect(html).not.toContain('產生伴奏');
    expect(html).not.toContain('處理模式');
  });

  it('keeps independent guide controls in their own pane without percentage preset buttons', async () => {
    const html = await render({
      activeTab: 'guide',
      hasTrack: true,
      guideVocalVisible: true,
      guideVocalRows: ['監聽', '擷取'].map((label) => ({
        key: label,
        label,
        icon: Headphones,
        deviceName: `${label}裝置`,
        onIcon: Volume2,
        on: true,
        onLabel: `關閉導唱(${label})`,
        value: '50%',
        sliderValue: 0.5,
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        sliderLabel: `導唱比例(${label})`,
        marks: [0, 0.25, 0.5, 0.75, 1],
      })),
    });
    for (const label of ['監聽', '擷取']) {
      expect(html).toContain(`關閉導唱(${label})`);
      expect(html).toContain(`aria-label="導唱比例(${label})"`);
    }
    expect(html).not.toContain('player-tools__stop-button');
    const adjust = html.slice(
      html.indexOf('id="player-tools-adjust-panel"'),
      html.indexOf(
        '</section>',
        html.indexOf('id="player-tools-adjust-panel"'),
      ),
    );
    const guide = html.slice(
      html.indexOf('id="player-tools-guide-panel"'),
      html.indexOf('</section>', html.indexOf('id="player-tools-guide-panel"')),
    );
    expect(adjust).not.toContain('導唱比例');
    expect(guide).toContain('導唱比例(監聽)');
    expect(guide).toContain('導唱比例(擷取)');
  });

  it('explains the unavailable guide controls without adding another preparation entry', async () => {
    const html = await render({ activeTab: 'guide' });
    expect(html).toContain('使用伴奏音訊後可調整導唱比例。');
    expect(html).not.toContain('產生伴奏');
  });
});

import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import Controls from './PlayerPerformanceSettingsControls.vue';
async function render(state) {
  const context = {};
  const html = await renderToString(
    createSSRApp({ render: () => h(Controls, { state }) }),
    context,
  );
  return (html + Object.values(context.teleports ?? {}).join('')).replace(
    /<!--[\s\S]*?-->/g,
    '',
  );
}
describe('per-track performance commands', () => {
  it('disables the set buttons, save and more without a track', async () => {
    const html = await render({ hasTrack: false, canSave: false });
    const buttons = html.match(/<button\b[^>]*>/g);
    expect(buttons).toHaveLength(5);
    expect(buttons.every((button) => button.includes(' disabled'))).toBe(true);
    expect(html).toContain('請先選擇曲目');
  });
  it('shows one save action and distinguishes unsaved adjustments from baseline', async () => {
    const html = await render({
      hasTrack: true,
      canSave: true,
      dirty: true,
      hasSaved: true,
    });
    expect(html).toContain('未保存變更');
    expect(html).toMatch(
      /class="ui-visually-hidden" role="status"[^>]*>未保存變更</,
    );
    expect(html).not.toContain('ui-hint');
    expect(html).toContain('保存本曲');
    expect(html).toContain('歌曲設定選項');
    expect(html).toContain('本曲設定組別');
    expect(html.indexOf('role="group"')).toBeLessThan(
      html.indexOf('ui-separator--vertical'),
    );
    expect(html.indexOf('ui-separator--vertical')).toBeLessThan(
      html.indexOf('保存本曲'),
    );
    expect(html.indexOf('保存本曲')).toBeLessThan(html.indexOf('歌曲設定選項'));
    expect(html).not.toContain('★');
    expect(html).not.toContain('ui-segmented');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).not.toContain('input');
  });
  it.each([
    [false, false, '空組'],
    [true, false, '已保存'],
    [false, true, '未保存變更'],
  ])(
    'keeps saved=%s, dirty=%s accessible as %s without a visible status row',
    async (hasSaved, dirty, label) => {
      const html = await render({
        hasTrack: true,
        selectedSlot: 2,
        savedSlots: [true, hasSaved, false],
        hasSaved,
        dirty,
      });
      expect(html).toMatch(new RegExp(`role="status"[^>]*>${label}<`));
      expect(html).toContain('performance-settings-controls__slot--empty');
      expect(html).toContain('ui-visually-hidden" role="status');
      expect(html).not.toContain('ui-hint');
      expect(html.includes('ui-icon-btn--accent')).toBe(dirty || !hasSaved);
    },
  );
  it('offers retry or explicit one-time defaults when a start is blocked', async () => {
    const html = await render({
      blocked: true,
      error: '歌曲設定已損壞，原檔已保留。',
    });
    expect(html).toContain('重新讀取');
    expect(html).toContain('本次使用預設');
    expect(html).not.toContain('已損壞');
    expect(html).not.toContain('ui-notice');
  });
});

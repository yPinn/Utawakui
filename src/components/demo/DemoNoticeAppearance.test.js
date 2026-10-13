import { existsSync, readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';
const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const feedbackSource = readSource('./DemoFeedback.vue');
const primitiveSource = readSource('./DemoNoticePrimitive.vue');
const notificationRecipeSource = readSource(
  './DemoNoticeNotificationRecipe.vue',
);
const candidateSource = readSource('./DemoCandidateNotice.vue');
const candidateStatusIconSource = readSource('./DemoCandidateStatusIcon.vue');
const candidateNotificationHostUrl = new URL(
  './DemoCandidateNotificationHost.vue',
  import.meta.url,
);
const candidateNotificationHostSource = existsSync(candidateNotificationHostUrl)
  ? readFileSync(candidateNotificationHostUrl, 'utf8')
  : '';
const currentSource = readSource('../ui/UiNotice.vue');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);
for (const [component, filename] of [
  [DemoCandidateNotice, './DemoCandidateNotice.vue'],
  [DemoCandidateStatusIcon, './DemoCandidateStatusIcon.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
function layerHtml(html, source) {
  const start = html.indexOf(`data-notice-source="${source}"`);
  const next =
    source === 'candidate'
      ? html.indexOf('data-notice-source="current"')
      : html.length;
  return html.slice(start, next);
}
function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}
describe('DemoNoticeAppearance', () => {
  it('replaces only the notices sample with the staged review', () => {
    expect(feedbackSource).toContain(
      "import DemoNoticeAppearance from './DemoNoticeAppearance.vue';",
    );
    expect(feedbackSource).toMatch(
      /<DemoNoticeAppearance\s+v-else-if="section\.key === 'notices'"\s*\/>/u,
    );
    expect(feedbackSource).not.toContain(
      "import UiNotice from '../ui/UiNotice.vue'",
    );
    expect(feedbackSource).toMatch(
      /<DemoProgressAppearance\s+v-else-if="section\.key === 'progress'"\s*\/>/u,
    );
  });
  it('keeps inline notice, field support, modal, toast, and banner ownership separate', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));
    expect(html).toContain('共用的結構化內嵌通知');
    expect(html).toContain('欄位與說明／錯誤之間的關聯由 UiField 負責');
    expect(html).toContain('UiHint 目前保留為相容元件');
    expect(html).toContain('跨功能的使用數量只證明有共用需求');
    expect(html).toContain('Modal 負責焦點保護與中斷流程');
    expect(html).toContain('負責位置、尺寸、佇列、關閉與顯示時間');
    expect(html).toContain('結構化內容支持共用元件的責任');
    expect(html).not.toContain('UiHint owns standalone supporting text');
    expect(primitiveSource).not.toMatch(
      /import\s+UiField|import\s+UiHint|import\s+UiModal/u,
    );
  });
  it('makes the optional notice action visible and moves it below narrow content without reserving an empty row', async () => {
    const withAction = await renderToString(
      createSSRApp(DemoCandidateNotice, {
        title: '來源檔案無法讀取',
        message: '請確認檔案仍存在，再重新嘗試。',
        actionLabel: '重試讀取',
      }),
    );
    const withoutAction = await renderToString(
      createSSRApp(DemoCandidateNotice, {
        title: '設定已儲存',
        message: '下次開啟時會套用。',
      }),
    );
    expect(withAction).toContain('ui-btn--secondary');
    expect(withAction).toContain('重試讀取');
    expect(withoutAction).not.toContain('demo-candidate-notice__action');
    expect(candidateSource).toContain('variant="secondary"');
    expect(candidateSource).toContain('@container (max-width: 26rem)');
    expect(candidateSource).toMatch(
      /@container \(max-width: 26rem\)[\s\S]*?\.demo-candidate-notice__action\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end;/u,
    );
  });
  it('times out only transient notifications and leaves progress or persistent records owner-controlled', async () => {
    vi.useFakeTimers();
    try {
      const { default: DemoCandidateNotificationHost } =
        await import('./DemoCandidateNotificationHost.vue');
      attachClientRender(
        DemoCandidateNotificationHost,
        './DemoCandidateNotificationHost.vue',
        import.meta.url,
      );
      const transientDismiss = vi.fn();
      const transient = mount(DemoCandidateNotificationHost, {
        notificationKey: 'saved-1',
        lifecycle: 'transient',
        durationMs: 6000,
        title: '設定已儲存',
        message: '下次開啟時會套用。',
        onDismiss: transientDismiss,
      });
      await vi.advanceTimersByTimeAsync(5999);
      expect(transientDismiss).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(transientDismiss).toHaveBeenCalledWith('timeout');
      transient.app.unmount();
      for (const lifecycle of ['progress', 'persistent']) {
        const dismiss = vi.fn();
        const mounted = mount(DemoCandidateNotificationHost, {
          notificationKey: `${lifecycle}-1`,
          lifecycle,
          durationMs: 1,
          title: '通知仍在畫面上',
          onDismiss: dismiss,
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(dismiss).not.toHaveBeenCalled();
        mounted.app.unmount();
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it('pauses a transient countdown during pointer interaction and resumes the remaining duration', async () => {
    vi.useFakeTimers();
    try {
      const { default: DemoCandidateNotificationHost } =
        await import('./DemoCandidateNotificationHost.vue');
      attachClientRender(
        DemoCandidateNotificationHost,
        './DemoCandidateNotificationHost.vue',
        import.meta.url,
      );
      const dismiss = vi.fn();
      const mounted = mount(DemoCandidateNotificationHost, {
        notificationKey: 'paused-1',
        lifecycle: 'transient',
        durationMs: 6000,
        title: '設定已儲存',
        onDismiss: dismiss,
      });
      const notification = findAll(
        mounted.root,
        (node) => node.type === 'article',
      )[0];
      await vi.advanceTimersByTimeAsync(3000);
      trigger(notification, 'onPointerenter');
      await vi.advanceTimersByTimeAsync(10000);
      expect(dismiss).not.toHaveBeenCalled();
      trigger(notification, 'onPointerleave');
      await vi.advanceTimersByTimeAsync(2999);
      expect(dismiss).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(dismiss).toHaveBeenCalledWith('timeout');
      mounted.app.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
  it('allows a dismissible fixed notification to be swiped left or right by touch without replacing the close button', async () => {
    const { default: DemoCandidateNotificationHost } =
      await import('./DemoCandidateNotificationHost.vue');
    attachClientRender(
      DemoCandidateNotificationHost,
      './DemoCandidateNotificationHost.vue',
      import.meta.url,
    );
    for (const [startX, endX] of [
      [160, 80],
      [80, 160],
    ]) {
      const dismiss = vi.fn();
      const mounted = mount(DemoCandidateNotificationHost, {
        notificationKey: `swipe-${startX}`,
        lifecycle: 'transient',
        dismissible: true,
        title: '設定已儲存',
        onDismiss: dismiss,
      });
      const notification = findAll(
        mounted.root,
        (node) => node.type === 'article',
      )[0];
      const pointerTarget = {
        setPointerCapture: vi.fn(),
      };
      trigger(notification, 'onPointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: startX,
        currentTarget: pointerTarget,
      });
      trigger(notification, 'onPointermove', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: endX,
      });
      trigger(notification, 'onPointerup', {
        pointerType: 'touch',
        pointerId: 1,
      });
      expect(dismiss).toHaveBeenCalledWith('swipe');
      mounted.app.unmount();
    }
    expect(candidateNotificationHostSource).toContain(
      'const SWIPE_DISMISS_DISTANCE = 72;',
    );
    expect(candidateNotificationHostSource).toContain(
      "!['touch', 'pen'].includes(event.pointerType)",
    );
    expect(candidateNotificationHostSource).toContain(
      'Math.abs(dragOffset.value) >= SWIPE_DISMISS_DISTANCE',
    );
    expect(candidateNotificationHostSource).toMatch(
      /\.demo-candidate-notification-host--swipeable\s*\{\s*touch-action:\s*pan-y;/u,
    );
    expect(candidateNotificationHostSource).not.toMatch(
      /\.demo-candidate-notification-host\s*\{[^}]*touch-action:\s*pan-y;/u,
    );
    // The whole selector sits inside :global(); `:global(x) .y` compiles to x.
    expect(candidateNotificationHostSource).toContain(
      ":global(:root[data-ui-motion='reduced'] .demo-candidate-notification-host)",
    );
    expect(candidateNotificationHostSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(candidateNotificationHostSource).toContain('label="關閉通知"');
  });
  it('prevents accidental text selection only on the fixed notification host', () => {
    expect(candidateNotificationHostSource).toMatch(
      /\.demo-candidate-notification-host\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(candidateSource).not.toContain('user-select: none');
    expect(currentSource).not.toContain('user-select: none');
  });
  it('routes bounded error guidance to the existing error record without exposing diagnostics internals', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));
    const text = visibleText(html);
    expect(text).toContain('部分內容未能載入');
    expect(text).toContain('查看錯誤紀錄');
    expect(text).toContain('可以立即再試時，唯一操作優先使用「重試」');
    expect(text).toContain('沒有更直接的處理方式時，才提供「查看錯誤紀錄」');
    expect(candidateNotificationHostSource).toContain(
      ':action-label="actionLabel"',
    );
    expect(candidateNotificationHostSource).not.toMatch(
      /rawError|stderr|filePath|payload|correlationId/u,
    );
    expect(notificationRecipeSource).not.toMatch(
      /rawError|stderr|filePath|payload|correlationId/u,
    );
    expect(candidateSource).not.toMatch(
      /reportError|diagnostics|rawError|stderr|filePath|payload|correlationId/u,
    );
  });
  it('uses necessary disclosure in visible notices and announcements', async () => {
    const text = visibleText(
      await renderToString(createSSRApp(DemoNoticeAppearance)),
    );
    expect(text).toContain('準備尚未完成');
    expect(text).toContain('準備完成後即可繼續。');
    expect(text).toContain('正在檢查可用功能');
    expect(text).toContain('完成後會自動更新。');
    expect(text).toContain('檢查完成');
    expect(text).toContain('需要的功能已可使用。');
    expect(text).toContain(
      'SummerLiveSessionFinalMixWithoutSpaces20260912.wav',
    );
    expect(text).not.toMatch(
      /runtime|sidecar|metadata|adapter|\bhost\b|\bparent\b|\bcaller\b|\bprimitive\b|\bproduction\b|consumer count|\blifecycle\b|\banatomy\b|\bwrapper\b/iu,
    );
    expect(notificationRecipeSource).not.toContain(
      'Development-only host recipe',
    );
  });
  it('composes the reviewed Status Icon on the 14px first-line rhythm', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));
    const candidate = layerHtml(html, 'candidate');
    expect(candidateSource).toContain(
      "import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';",
    );
    expect(candidateSource).toMatch(
      /<DemoCandidateStatusIcon[\s\S]*size="compact"[\s\S]*decorative/u,
    );
    expect(candidateSource).not.toMatch(
      /<component[\s\S]*:is="icon"[\s\S]*aria-hidden="true"/u,
    );
    expect(candidate).toContain('demo-candidate-status-icon');
    expect(candidate).toContain('aria-hidden="true"');
    expect(candidateSource).toContain(
      '--demo-notice-status-icon-size: 1.25rem;',
    );
    expect(candidateSource).toContain('column-gap: var(--ui-space-2);');
    expect(candidateStatusIconSource).toContain(
      "import UiStatusIcon from '../ui/UiStatusIcon.vue';",
    );
    expect(candidateStatusIconSource).toContain(
      "size === 'compact' ? '1.25rem' : '1.5rem'",
    );
    expect(html).toContain('20px 狀態圖示與 14px 首行置中對齊');
    expect(html).toContain('圖示與文字間距固定為 8px');
  });
  it('preserves the completed UiNotice contract after opening Progress', () => {
    expect(reviewContract).toContain(
      '`runtime`、`sidecar`、`adapter`、`host`、`parent`、`token` 等實作名詞',
    );
    expect(reviewContract).toContain(
      '只有在會影響使用者選擇、隱私期待或復原方式時才揭露',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiHint Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiNotice Candidate／Current 檢查',
    );
    expect(reviewContract).toContain('Inline notice／結構化內嵌通知');
    expect(reviewContract).toContain(
      'Candidate compound 重用已審查的 `DemoCandidateStatusIcon`',
    );
    expect(reviewContract).toContain(
      '固定使用 Compact 20px box／16-unit glyph，與 14px 首行置中對齊',
    );
    expect(reviewContract).toContain(
      'Action 使用既有 Button hierarchy 的 contextual Secondary action',
    );
    expect(reviewContract).toContain(
      '`transient`／`progress`／`persistent` 由 fixed notification host 明確指定',
    );
    expect(reviewContract).toContain(
      '不得擴到獨立 Inline Notice、診斷紀錄或 production `UiNotice`',
    );
    expect(reviewContract).toContain(
      '錯誤沿用既有 `useAppDiagnostics` 的 bounded public record',
    );
    expect(reviewContract).toContain('不新增 `UiAlert`、`UiCallout`');
  });
});

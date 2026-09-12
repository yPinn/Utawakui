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
import DemoCandidateNotice from './DemoCandidateNotice.vue';
import DemoNoticeAppearance from './DemoNoticeAppearance.vue';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const feedbackSource = readSource('./DemoFeedback.vue');
const appearanceSource = readSource('./DemoNoticeAppearance.vue');
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

function layerHtml(html, source) {
  const start = html.indexOf(`data-notice-source="${source}"`);
  const next =
    source === 'candidate'
      ? html.indexOf('data-notice-source="current"')
      : html.length;
  return html.slice(start, next);
}

function articleHtml(html, marker) {
  return (
    html.match(
      new RegExp(
        `<article[^>]*data-notice-${marker}[\\s\\S]*?<\\/article>`,
        'u',
      ),
    )?.[0] ?? ''
  );
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
    expect(feedbackSource).toContain(
      '<div v-else-if="section.key === \'progress\'"',
    );
  });

  it('orders Candidate and Current through the inline-notice contract', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));
    const candidateIndex = html.indexOf('data-notice-source="candidate"');
    const currentIndex = html.indexOf('data-notice-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      '使用時機',
      '尺寸與內容結構',
      '長內容與換行',
      '訊息類型',
      '操作行為',
      '輔助技術與公開介面',
      '固定通知尺寸',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = layerHtml(html, source);
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
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

  it('keeps inline width fluid and puts fixed notification sizing in a demo-only host recipe', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    expect(html.match(/data-notification-recipe="fixed"/gu)).toHaveLength(2);
    expect(html).toContain('桌面下限 · 20rem／320 CSS px');
    expect(html).toContain('建議寬度 · 22rem／352 CSS px');
    expect(html).toContain('最大寬度 · 26rem／416 CSS px');
    expect(html).toContain('視窗邊距 · 兩側各 1rem');
    expect(html).toContain(
      '位置、視窗邊距、堆疊、關閉與顯示時間由通知容器負責',
    );
    expect(candidateSource).toContain('min-inline-size: 0;');
    expect(candidateSource).toContain('max-inline-size: 100%;');
    expect(candidateSource).not.toMatch(/minWidth|maxWidth|position:\s*fixed/u);
    expect(notificationRecipeSource).toContain(
      '--demo-notification-min-inline-size: 20rem;',
    );
    expect(notificationRecipeSource).toContain(
      '--demo-notification-preferred-inline-size: 22rem;',
    );
    expect(notificationRecipeSource).toContain(
      '--demo-notification-max-inline-size: 26rem;',
    );
    expect(notificationRecipeSource).toContain(
      '--demo-notification-safe-inset: var(--ui-space-4);',
    );
    expect(notificationRecipeSource).toContain(
      '--demo-notification-inline-size: var(',
    );
    expect(notificationRecipeSource).toMatch(
      /--demo-notification-inline-size:\s*var\(\s*--demo-notification-preferred-inline-size\s*\);/u,
    );
    expect(notificationRecipeSource).toContain('inline-size: clamp(');
    expect(notificationRecipeSource).toContain(
      'var(--demo-notification-inline-size),',
    );
    expect(notificationRecipeSource).toContain('max-inline-size: calc(');
    expect(notificationRecipeSource).toContain('@container (max-width: 45rem)');
    expect(notificationRecipeSource).not.toContain('@media');
    expect(notificationRecipeSource).not.toMatch(
      /defineProps\(\{[^}]*minWidth|defineProps\(\{[^}]*maxWidth/u,
    );
    expect(notificationRecipeSource).toContain(
      "import DemoCandidateNotificationHost from './DemoCandidateNotificationHost.vue';",
    );
    expect(candidateNotificationHostSource).toContain(
      "import DemoCandidateNotice from './DemoCandidateNotice.vue';",
    );
    expect(candidateNotificationHostSource).toContain(
      "import DemoCandidateIconButton from './DemoCandidateIconButton.vue';",
    );
    expect(candidateNotificationHostSource).toContain(
      "import { X } from '../../icons/index.js';",
    );
    expect(candidateNotificationHostSource).toContain('variant="ghost"');
    expect(candidateNotificationHostSource).not.toContain('variant="overlay"');
    expect(candidateNotificationHostSource).toContain(
      '--demo-icon-button-size: var(--ui-icon-button-size-md);',
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

    expect(withAction).toContain('demo-candidate-btn--secondary');
    expect(withAction).toContain('重試讀取');
    expect(withoutAction).not.toContain('demo-candidate-notice__action');
    expect(candidateSource).toContain('variant="secondary"');
    expect(candidateSource).toContain('@container (max-width: 26rem)');
    expect(candidateSource).toMatch(
      /@container \(max-width: 26rem\)[\s\S]*?\.demo-candidate-notice__action\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?justify-self:\s*end;/u,
    );
  });

  it('keeps fixed-notification lifecycle explicit instead of inferring it from tone', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    expect(html).toContain('短暫通知');
    expect(html).toContain('6 秒後自動關閉');
    expect(html).toContain('游標停留、鍵盤焦點或視窗暫停時停止計時');
    expect(html).toContain('進度通知');
    expect(html).toContain('以同一項目更新，完成後再換成短暫通知');
    expect(html).toContain('持續通知');
    expect(html).toContain('不會自動關閉');
    expect(html).toContain('通知類型不由顏色決定');
    expect(html).toContain('正式產品目前沒有固定通知容器');
    expect(candidateNotificationHostSource).toMatch(
      /validator:[\s\S]*\['transient', 'progress', 'persistent'\]/u,
    );
    expect(candidateNotificationHostSource).toContain(
      "props.lifecycle !== 'transient'",
    );
    expect(candidateNotificationHostSource).toContain(
      "document.addEventListener('visibilitychange'",
    );
    expect(candidateNotificationHostSource).toContain(
      '@pointerenter="pauseTimer',
    );
    expect(candidateNotificationHostSource).toContain('@focusin="pauseTimer');
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
      const pointerTarget = { setPointerCapture: vi.fn() };

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
    expect(candidateNotificationHostSource).toContain(
      ":global(:root[data-ui-motion='reduced'])",
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

  it('compares Standard and Compact without shrinking action targets below the Candidate floor', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    for (const density of ['standard', 'compact']) {
      expect(
        html.match(new RegExp(`data-notice-density="${density}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard · 12px inset／36px action');
    expect(html).toContain('Compact · 8px inset／32px action');
    expect(html).toContain('Current Standard · 12px inset／30px action');
    expect(html).toContain('Current Compact · 8px inset／30px action');
    expect(candidateSource).toContain('--demo-notice-action-height: 2.25rem;');
    expect(candidateSource).toContain('--demo-notice-action-height: 2rem;');
  });

  it('shows the owned icon, title-or-message body, optional action, and empty omission', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    for (const anatomy of [
      'title-message',
      'title-only',
      'message-only',
      'optional-action',
    ]) {
      expect(
        html.match(new RegExp(`data-notice-anatomy="${anatomy}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('裝飾性狀態圖示');
    expect(html).toContain('標題或說明至少顯示一項');
    expect(html).toContain('選用的情境操作');

    const candidateBlank = await renderToString(
      createSSRApp(DemoCandidateNotice),
    );
    expect(candidateBlank).not.toContain('demo-candidate-notice');
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

  it('keeps narrow CJK, Latin, multilingual, and unbroken content bounded', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    for (const content of [
      'long-cjk',
      'long-latin',
      'multilingual',
      'unbroken',
    ]) {
      expect(
        html.match(new RegExp(`data-notice-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('繁體中文、日本語、한국어 and English');
    expect(html).toContain(
      'This inline notice keeps its recovery guidance readable in a narrow operational panel.',
    );
    expect(candidateSource).toContain('overflow-wrap: anywhere;');
    expect(primitiveSource).toContain('width: min(20rem, 100%);');
    expect(primitiveSource).toContain('overflow-x: auto;');
    expect(candidateSource).toContain('@container (max-width: 26rem)');
  });

  it('uses Neutral by default and pairs every semantic tone with explicit copy and icon shape', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    for (const tone of ['neutral', 'info', 'success', 'warning', 'danger']) {
      expect(
        html.match(new RegExp(`data-notice-tone="${tone}"`, 'gu')),
      ).toHaveLength(2);
      expect(candidateSource).toContain(`.demo-candidate-notice--${tone}`);
    }
    expect(html).toContain('內容類型、格式與來源說明預設使用 Neutral');
    expect(html).toContain('文字與圖示形狀仍保留完整語意');
    expect(html).toContain('需確認公開輸出內容');
    expect(html).not.toContain('permission denied');
  });

  it('keeps action behavior, placement, and busy state parent-owned', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    expect(html.match(/data-notice-action="retry"/gu)).toHaveLength(2);
    expect(html.match(/data-notice-action="details"/gu)).toHaveLength(2);
    expect(html).toContain('重試讀取');
    expect(html).toContain('查看說明');
    expect(html).toContain('重試、前往其他畫面與處理中狀態由整合畫面負責');
    expect(html).toContain('內嵌位置由所在畫面決定');
    expect(html).toContain('固定位置、堆疊、關閉與顯示時間由通知容器負責');
    expect(candidateSource).toContain("const emit = defineEmits(['action']);");
    expect(candidateSource).toContain('@click="emit(\'action\')"');
    expect(primitiveSource).toContain(
      'actionOutcome.value = `已選擇「${label}」。`;',
    );
  });

  it('keeps announcements caller-owned in Candidate and exposes Current implicit roles as truth', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));
    const candidate = layerHtml(html, 'candidate');
    const current = layerHtml(html, 'current');
    const candidateStatic = articleHtml(candidate, 'aria="static"');
    const candidatePolite = articleHtml(candidate, 'aria="polite"');
    const candidateUrgent = articleHtml(candidate, 'aria="urgent"');
    const currentStatic = articleHtml(current, 'aria="static"');

    expect(candidateStatic).not.toContain('role="status"');
    expect(candidateStatic).not.toContain('role="alert"');
    expect(candidatePolite).toContain('role="status"');
    expect(candidatePolite).toContain('aria-live="polite"');
    expect(candidatePolite).toContain('aria-atomic="true"');
    expect(candidateUrgent).toContain('role="alert"');
    expect(currentStatic).toContain('role="status"');
    expect(html).toContain('候選版的訊息類型不決定宣告急迫性');
    expect(html).toContain('現行版會自動將一般訊息設為 status、失敗設為 alert');
    expect(candidateSource).not.toContain(':role=');
    expect(candidateSource).not.toContain('aria-live');
    expect(currentSource).toContain(
      "resolvedTone.value === 'danger' ? 'alert' : 'status'",
    );
    expect(html).toMatch(/aria-hidden="true"/u);
  });

  it('documents the compatibility adapter without adding feature-specific Candidate props', async () => {
    const html = await renderToString(createSSRApp(DemoNoticeAppearance));

    for (const [term, description] of [
      ['title／message', '由使用畫面提供的標題與說明'],
      ['actionLabel＋action', '選用的情境操作'],
      ['attrs', '原生屬性套用到外層'],
      ['notice object', '現行錯誤訊息相容格式'],
    ]) {
      expect(html).toContain(`>${term}</dt>`);
      expect(html).toContain(`>${description}</dd>`);
    }
    expect(html).toContain('不加入驗證、權限或特定功能屬性');
    expect(candidateSource).not.toMatch(
      /validation|permission|provider|lyrics|track/u,
    );
    expect(appearanceSource).toContain('.demo-notice-layer--current');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-notice-layer--current)",
    );
    expect(appearanceSource).toContain(
      "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui",
    );
    expect(appearanceSource).not.toContain("'Segoe UI Variable Text'");
    expect(appearanceSource).toContain(
      '--ui-motion-easing-standard: ease-out;',
    );
    expect(currentSource).not.toContain('demo-candidate-notice');
  });

  it('records UiHint approval and a pending UiNotice checkpoint without opening Progress', () => {
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
      '## 待 Owner 檢查階段：UiNotice Candidate／Current 標本',
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
    expect(reviewContract).toMatch(
      /在 owner 明確核准 UiNotice 前，不得開始\s+`UiProgress`/u,
    );
  });
});

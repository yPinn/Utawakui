import { createSSRApp, h, readonly, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';
import CompanionDockPhone from './CompanionDockPhone.vue';

const performer = vi.hoisted(() => ({ remoteReaders: 0 }));
vi.mock('../../composables/useCompanionRemote.js', () => ({
  useCompanionRemote: () => ({ apply: vi.fn() }),
}));
vi.mock('../../composables/usePerformerSelfView.js', () => ({
  usePerformerSelfView: () => ({
    state: performer,
    latestSnapshot: shallowRef(null),
  }),
}));

const base = {
  enabled: true,
  running: true,
  interfaceAddress: '192.168.1.20',
  error: null,
  interfaces: [
    { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
    { name: 'Hotel', address: '10.0.0.8', privateNetwork: false },
  ],
  devices: [{ id: 'd1', label: 'Pixel', lastSeenAt: '2026-11-17T12:00:00Z' }],
  pairing: { pending: false },
};

function companionWith(status, pairing = null) {
  return {
    status: readonly(shallowRef(status)),
    busy: readonly(shallowRef(false)),
    error: readonly(shallowRef('')),
    pairing: readonly(shallowRef(pairing)),
    start: vi.fn(async () => true),
    stop: vi.fn(),
    configure: vi.fn(async () => true),
    beginPairing: vi.fn(async () => true),
    cancelPairing: vi.fn(async () => true),
  };
}

const render = (companion, active = true) =>
  renderToString(
    createSSRApp({
      render: () => h(CompanionDockPhone, { companion, active }),
    }),
  );

const pairing = (offset) => ({
  url: 'http://192.168.1.20:8710/m/#pair=abc',
  expiresAt: Date.now() + offset,
});

describe('CompanionDockPhone', () => {
  it('shows the QR inside a phone frame with the steps beneath it', async () => {
    const html = await render(
      companionWith({ ...base, devices: [] }, pairing(60_000)),
    );
    expect(html).toMatch(
      /companion-phone-frame[\s\S]*companion-phone-frame__island[\s\S]*companion-pairing-qr/u,
    );
    expect(html).toContain('aria-label="手機配對畫面"');
    // Decorative status bar, left to right: time, location arrow, the island
    // with its lens, then signal, Wi-Fi and battery.
    expect(html).toMatch(
      /companion-phone-frame__status" aria-hidden="true"[\s\S]*?companion-phone-frame__time[^>]*>\d{2}:\d{2}<[\s\S]*?lucide-navigation[\s\S]*?companion-phone-frame__island[\s\S]*?companion-phone-frame__lens[\s\S]*?lucide-signal(?!-)[\s\S]*?lucide-wifi[\s\S]*?lucide-battery-full/u,
    );
    expect(html).toContain('用手機相機掃描。');
    expect(html).not.toContain('配對碼已失效');
    expect(html).not.toContain('app-right-dock-panel');
    // Always on: no on／off state or control.
    for (const absent of ['ui-chip', '啟動', '停止', '手機可連線', '未開啟'])
      expect(html).not.toContain(absent);
  });

  it('keeps an empty QR frame while getting ready, without a status screen', async () => {
    const html = await render(companionWith({ ...base, running: false }));
    expect(html).toContain('companion-dock-phone__qr');
    expect(html).not.toContain('companion-pairing-qr');
    expect(html).not.toContain('ui-hint--danger');
    expect(html).not.toContain('ui-btn--accent');
  });

  it('keeps the full pairing instructions when a paired phone is offline', async () => {
    const html = await render(companionWith(base, pairing(60_000)));
    expect(html).toContain('companion-pairing-qr');
    expect(html).toContain('配對步驟');
    expect(html).toContain('手機和電腦需連同一個網路。');
    expect(html).toContain('私人網路');
    expect(html).not.toContain('companion-interface');
  });

  it('shows the live phone page only while the listener has a connected reader', async () => {
    performer.remoteReaders = 1;
    try {
      const companion = companionWith(base, pairing(60_000));
      const live = await render(companion);
      expect(live).toContain('companion-dock-preview__viewport');
      expect(live).toContain('companion-lyrics-tab');
      expect(live).toContain('已連線');
      expect(live).not.toContain('lucide-qr-code');
      expect(live).not.toContain('companion-dock-phone__steps');
      expect(live).not.toContain('companion.setup.states.undefined');
      expect(live).not.toContain('companion-pairing-qr');
      expect(companion.beginPairing).not.toHaveBeenCalled();
      expect(await render(companion, false)).not.toContain(
        'companion-lyrics-tab',
      );
      expect(
        await render(companionWith({ ...base, running: false })),
      ).not.toContain('companion-lyrics-tab');
      const pending = await render(
        companionWith({ ...base, pairing: { request: { id: 'r1' } } }),
      );
      expect(pending).not.toContain('請在視窗中確認。');
      expect(pending).toContain('companion-lyrics-tab');
    } finally {
      performer.remoteReaders = 0;
    }
    const offline = await render(companionWith(base, pairing(60_000)));
    expect(offline).toContain('companion-pairing-qr');
    expect(offline).toContain('companion-dock-phone__steps');
    expect(offline).toContain('手機和電腦需連同一個網路。');
  });

  it('creates a code only while shown and running', async () => {
    const shown = companionWith(base);
    await render(shown, true);
    expect(shown.beginPairing).toHaveBeenCalledOnce();
    const hidden = companionWith(base);
    await render(hidden, false);
    expect(hidden.beginPairing).not.toHaveBeenCalled();
  });

  it('covers a lapsed code with an overlay that renews it', async () => {
    const html = await render(companionWith(base, pairing(-1)));
    expect(html).toMatch(/ui-artwork-overlay[\s\S]*配對碼已失效/u);
    expect(html).toContain('ui-btn--overlay');
    expect(html).toContain('重新產生');
  });

  it('splits the screen into flow, notes and network choice, all inside the phone', async () => {
    const html = await render(
      companionWith({
        ...base,
        running: false,
        error: 'listen-failed',
        devices: [],
        interfaces: [
          ...base.interfaces,
          { name: 'Ethernet', address: '192.168.1.30', privateNetwork: true },
        ],
      }),
    );
    expect(html).not.toContain('companion-pairing-qr');
    const screen = html.slice(
      html.indexOf('companion-phone-frame__content'),
      html.indexOf('</figure>'),
    );
    const [flow, notes, network] = screen.split(/class="ui-separator[^"]*"/u);
    expect(flow).toContain('無法開啟手機遙控');
    expect(notes).toContain('手機和電腦需連同一個網路。');
    expect(notes).toContain('Windows 詢問時，只允許私人網路。');
    expect(network).toContain('companion-interface');
    expect(html.slice(html.indexOf('</figure>'))).not.toContain('ui-hint');
  });

  it('lets a public network be used anyway, once, by its name', async () => {
    const companion = companionWith({
      ...base,
      running: false,
      error: 'public-network',
      interfaces: [
        {
          name: 'Wi-Fi',
          address: '10.0.0.8',
          network: 'Hotel Guest',
          privateNetwork: false,
        },
      ],
    });
    const html = await render(companion);
    expect(html).toContain('這是公用網路。建議在 Windows 改為私人網路');
    expect(html).toMatch(/ui-btn--accent[\s\S]*仍要使用/u);
    expect(html).not.toContain('>啟動<');
  });

  it('asks to allow public networks in the firewall while on one', async () => {
    const html = await render(
      companionWith({
        ...base,
        devices: [],
        interfaceAddress: '10.0.0.8',
        allowedNetworks: ['Hotel Guest'],
        interfaces: [
          {
            name: 'Wi-Fi',
            address: '10.0.0.8',
            network: 'Hotel Guest',
            privateNetwork: false,
          },
        ],
      }),
    );
    expect(html).toContain('Windows 詢問時，請一併允許公用網路。');
  });

  it('waits for the approval dialog instead of showing the QR', async () => {
    const html = await render(
      companionWith({
        ...base,
        pairing: { request: { id: 'r1', label: 'Pixel', matchCode: '1' } },
      }),
    );
    expect(html).not.toContain('companion-pairing-qr');
    expect(html).toContain('請在視窗中確認。');
  });

  it('asks for a network only between several private ones', async () => {
    const html = await render(
      companionWith({
        ...base,
        running: false,
        error: 'choose-interface',
        interfaces: [
          ...base.interfaces,
          { name: 'Ethernet', address: '192.168.1.30', privateNetwork: true },
        ],
      }),
    );
    expect(html).toContain('companion-interface');
    expect(html).toContain('請選擇手機所在的網路');
  });
});

describe('Companion phone geometry and placement', () => {
  const read = (path) => readCatalogSource(new URL(path, import.meta.url));

  it('styles every phone-remote surface through tokens and type recipes', () => {
    const files = [
      './CompanionPhoneFrame.vue',
      './CompanionDockPhone.vue',
      './CompanionPairingQr.vue',
      '../settings/CompanionSettingsBlock.vue',
      '../layout/AppCompanionApprovalModal.vue',
      '../../companion/CompanionApp.vue',
    ];
    const raw = /(?<![\w-])-?\d*\.?\d+(px|rem|ms)\b|#[0-9a-f]{3,8}\b|rgba?\(/iu;
    for (const file of files) {
      const css = read(file).split('<style scoped>')[1] ?? '';
      const declarations = css
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .split('\n')
        .filter((line) => raw.test(line));
      expect(declarations, file).toEqual([]);
      // Text sizes come from type recipes, never foundation font sizes.
      expect(css, file).not.toMatch(/font-size: var\(--ui-font-size-/u);
    }
    const frame = read('./CompanionPhoneFrame.vue');
    expect(frame).toMatch(
      /\.companion-phone-frame__status \{[^}]*font-size: var\(--ui-type-label-size\);[^}]*font-weight: var\(--ui-type-label-weight\);/u,
    );
  });

  it('outlines the QR with the strong border token', () => {
    const phone = read('./CompanionDockPhone.vue');
    expect(phone).toMatch(
      /\.companion-dock-phone__qr \{[^}]*border: var\(--ui-border-width\) solid var\(--ui-color-border-strong\);/u,
    );
  });

  it('keeps the phone unselectable and animates code changes with motion tokens', () => {
    const phone = read('./CompanionDockPhone.vue');
    expect(phone).toMatch(/\.companion-dock-phone \{[^}]*user-select: none;/u);
    expect(phone).toMatch(
      /<Transition name="companion-dock-phone-qr">\s*<CompanionPairingQr[\s\S]*?:key="qr\.url\.value"/u,
    );
    expect(phone).toContain('<Transition name="companion-dock-phone-scrim">');
    const motion = phone.slice(phone.indexOf('.companion-dock-phone-qr-enter'));
    expect(motion).toContain('var(--ui-motion-duration-slow)');
    expect(motion).toContain('var(--ui-motion-easing-exit)');
    expect(motion).not.toMatch(/\d+m?s\b/u);
  });

  it('builds the iPhone-proportioned frame from token recipes', () => {
    const frame = read('./CompanionPhoneFrame.vue');
    // The screen, not the outer frame, keeps 9:19.5; the bezel wraps it.
    expect(frame).toMatch(
      /\.companion-phone-frame__screen \{[^}]*aspect-ratio: 9 \/ 19\.5;/u,
    );
    // Full bay width unless the bay's height only fits a narrower phone.
    expect(frame).toMatch(/inline-size: min\(\s*100cqi,[\s\S]*?100cqb/u);
    // The outer corner is a device value in tokens.css, not a radius-scale
    // step; the screen corner stays concentric inside the bezel.
    expect(read('../../styles/tokens.css')).toContain(
      '--ui-companion-phone-radius: 2rem;',
    );
    expect(frame).not.toMatch(/--ui-companion-phone-radius:/u);
    expect(frame).toMatch(
      /--ui-companion-phone-screen-radius: calc\(\s*var\(--ui-companion-phone-radius\) - var\(--ui-companion-phone-bezel\)\s*\);/u,
    );
    expect(frame).toContain('border-radius: var(--ui-radius-pill);');
    // Status bar: icons use the shared ICON_SIZE, full-bar signal first, and
    // the bar is the island's height so all three share one centre line.
    expect(frame).toMatch(
      /<Signal :size="ICON_SIZE" \/>\s*<Wifi :size="ICON_SIZE" \/>\s*<BatteryFull :size="ICON_SIZE" \/>/u,
    );
    expect(frame).toContain(
      '<Navigation :size="ICON_SIZE" fill="currentColor" />',
    );
    // Both side groups share one rule: centred in equal halves, same gap.
    expect(frame).toContain(
      'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);',
    );
    expect(frame.match(/class="companion-phone-frame__group"/gu)).toHaveLength(
      2,
    );
    expect(frame).toMatch(
      /\.companion-phone-frame__lens \{[\s\S]*?inline-size: var\(--ui-status-dot-size\);/u,
    );
    expect(frame).toMatch(
      /\.companion-phone-frame__status \{[^}]*grid-template-rows: var\(--ui-companion-phone-island-block-size\);/u,
    );
    expect(frame).toMatch(
      /\.companion-phone-frame__island \{[^}]*block-size: var\(--ui-companion-phone-island-block-size\);/u,
    );
    // No raw lengths: every size resolves through a token.
    expect(frame.match(/<style[\s\S]*<\/style>/u)[0]).not.toMatch(
      /:\s*-?\d+(\.\d+)?(px|rem)\b/u,
    );
  });

  it('stands in the Dock bay itself, not inside a Dock panel', () => {
    const app = read('../../App.vue');
    expect(app).toContain('@toggle-companion="toggleCompanionPhone"');
    expect(app).toContain(':companion-active="companionVisible"');
    expect(app).toContain('ensureFeatureGate(FEATURE_IDS.MOBILE_COMPANION)');
    expect(app).toMatch(
      /<\/AppRightDock>\s*<div[\s\S]*?class="shell__dock-phone"[\s\S]*?<CompanionDockPhone/u,
    );
    expect(app).not.toContain('RIGHT_DOCK_SURFACE_COMPANION');
    expect(app).toMatch(/\.shell__dock-phone \{[^}]*container-type: size;/u);
    // Top-aligned with the Folder body, below its tab row.
    expect(app).toMatch(
      /\.shell__dock-phone \{[^}]*var\(--ui-shell-content-inset-block\)\s*\+\s*var\(--ui-folder-tab-height-active\)\s*-\s*var\(--ui-folder-tab-cover-size\)[^}]*place-items: start center;/u,
    );
    // Showing the phone collapses the Dock; expanding the Dock puts it away.
    expect(app).toMatch(
      /collapseRightDock\(\);\s*companionMounted\.value = true;/u,
    );
    expect(app).toMatch(
      /watch\(rightDock\.isExpanded, \(expanded\) => \{\s*if \(expanded\) companionVisible\.value = false;/u,
    );
  });
});

import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { nextTick, reactive } from 'vue';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import Surface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';
let Marquee, TextButton, Overflow, Row, body, observers, frames, sequence;
attachClientRender(Surface, './tooltip/UiTooltipSurface.vue', import.meta.url);
beforeAll(async () => {
  Row = (await import('./UiTrackRow.vue')).default;
  attachClientRender(Row, './UiTrackRow.vue', import.meta.url);
  for (const f of [
    'UiTrackThumb',
    'TrackArtworkContent',
    'UiTrackArtworkButton',
  ]) {
    const c = (await import('./' + f + '.vue')).default;
    attachClientRender(c, './' + f + '.vue', import.meta.url);
  }
  TextButton = (await import('./UiTextButton.vue')).default;
  attachClientRender(TextButton, './UiTextButton.vue', import.meta.url);
  Overflow = (await import('./UiOverflowTooltip.vue')).default;
  attachClientRender(Overflow, './UiOverflowTooltip.vue', import.meta.url);
  Marquee = (await import('./UiMarqueeText.vue')).default;
  attachClientRender(Marquee, './UiMarqueeText.vue', import.meta.url);
});
beforeEach(() => {
  vi.useFakeTimers();
  body = hostNode('body');
  observers = [];
  frames = new Map();
  sequence = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb) => {
      frames.set(++sequence, cb);
      return sequence;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb) {
        this.cb = cb;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  vi.stubGlobal('document', {
    body,
    // Marquee hints exist only while motion is reduced.
    documentElement: Object.assign(hostNode('html'), {
      dataset: { uiMotion: 'reduced' },
    }),
    querySelector: (s) => (s === 'body' ? body : null),
  });
  const computedStyle = (e) => ({
    paddingRight: e.paddingRight ?? '0px',
    fontSize: '16px',
    direction: 'ltr',
    getPropertyValue: () => '',
  });
  vi.stubGlobal('getComputedStyle', computedStyle);
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: computedStyle,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const flush = async () => {
  await nextTick();
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((cb) => cb());
  await nextTick();
};
const has = (n, c) =>
  String(n.props.class ?? '')
    .split(' ')
    .includes(c);
const tips = () => findAll(body, (n) => n.props.role === 'tooltip');
function specimen(props) {
  const m = mount(Row, props),
    row = findAll(m.root, (n) => n.type === 'li')[0];
  const find = (c) => findAll(row, (n) => has(n, c))[0];
  return { ...m, row, find };
}
function size(m, width = 80, natural = 240) {
  const r =
    m.find('ui-marquee') ??
    m.find('ui-track__title-text') ??
    m.find('ui-text-btn__text');
  r.clientWidth = width;
  r.clientHeight = 20;
  r.scrollWidth = natural;
  r.scrollHeight = 20;
  const t = r.children.find((n) => n.type === 'span');
  if (t) t.scrollWidth = natural;
  observers.forEach((o) => o.cb());
}
describe('UiTrackRow state and overflow integration', () => {
  it('keeps row-content selection guards and supports a normal Enter command', () => {
    const click = vi.fn(),
      double = vi.fn(),
      activate = vi.fn(),
      m = specimen({
        interactive: true,
        title: '曲目',
        onRowClick: click,
        onRowDblclick: double,
        onActivate: activate,
      });
    const info = m.find('ui-track__info');
    trigger(info, 'onClick', {
      view: { getSelection: () => ({ isCollapsed: false }) },
    });
    expect(click).not.toHaveBeenCalled();
    trigger(info, 'onClick', {
      view: { getSelection: () => ({ isCollapsed: true }) },
    });
    expect(click).toHaveBeenCalledOnce();
    trigger(info, 'onDblclick', {});
    expect(double).toHaveBeenCalledOnce();
    trigger(m.find('ui-track__action'), 'onKeydown', {
      key: 'Enter',
      preventDefault: vi.fn(),
    });
    expect(activate).not.toHaveBeenCalled();
    m.app.unmount();
    const plain = specimen({ title: '普通曲目', onRowClick: click });
    trigger(plain.find('ui-track__info'), 'onClick', {});
    expect(click).toHaveBeenCalledOnce();
    plain.app.unmount();
  });
  it('server-renders separate title/artwork actions and caller-owned slots', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            Row,
            {
              track: {
                id: 'b',
                title: '帶有操作的曲目',
                artist: '演出者',
                duration: 90,
              },
              interactive: true,
              titleClickable: true,
              artworkClickable: true,
              disabled: true,
              hideDuration: true,
            },
            {
              lead: ({ disabled }) => {
                expect(disabled).toBe(true);
                return h('button', { disabled }, 'lead');
              },
              trail: () => h('span', 'trail'),
              artist: () => h('span', 'artist'),
              artworkOverlay: () => h('span', 'artwork'),
              overlay: () => h('span', 'overlay'),
            },
          ),
      }),
    );
    expect(html).toContain('ui-text-btn');
    expect(html).toContain('ui-track__artwork-action');
    expect(html).toContain('lead');
    expect(html).toContain('trail');
    expect(html).toContain('artwork');
    expect(html).not.toContain('ui-track__duration');
    const ellipsis = await renderToString(
      createSSRApp(Row, { title: '靜態截斷曲目', overflow: 'ellipsis' }),
    );
    expect(ellipsis).toContain('靜態截斷曲目');
  });
  it.each(['marquee', 'ellipsis'])(
    '%s keeps the independent title action on the formal text button through track replacement',
    async (overflow) => {
      const props = reactive({
        track: { id: 'a', title: '原曲目', artist: '演出者' },
        interactive: true,
        titleClickable: true,
        overflow,
      });
      const m = specimen(props);
      size(m);
      await flush();
      const title = m.find('ui-text-btn');
      trigger(title, 'onFocusin', { target: title });
      await nextTick();
      expect(tips()).toHaveLength(1);
      expect(title.props['aria-describedby']).toBe(tips()[0].props.id);
      expect(
        m.find('ui-track__action').props['aria-describedby'],
      ).toBeUndefined();
      props.track = { id: 'b', title: '更換後的曲目', artist: '另一位演出者' };
      await nextTick();
      size(m);
      await flush();
      expect(textContent(tips()[0])).toBe(props.track.title);
      expect(textContent(m.find('ui-track__artist'))).toBe(props.track.artist);
      size(m, 300);
      await flush();
      expect(tips()).toHaveLength(0);
      size(m);
      await flush();
      expect(tips()).toHaveLength(1);
      m.app.unmount();
    },
  );
  it.each(['marquee', 'ellipsis'])(
    '%s bridges plain title hints to row action and recovers content/size',
    async (overflow) => {
      const props = reactive({
          title: '原始長曲目名稱',
          interactive: true,
          overflow,
        }),
        m = specimen(props);
      size(m);
      await flush();
      const action = m.find('ui-track__action');
      trigger(action, 'onFocusin', { target: action });
      await nextTick();
      expect(tips()).toHaveLength(1);
      expect(action.props['aria-describedby']).toBe(tips()[0].props.id);
      size(m, 300);
      await flush();
      expect(tips()).toHaveLength(0);
      size(m);
      await flush();
      expect(tips()).toHaveLength(1);
      props.title = '更新的長曲目';
      await nextTick();
      size(m);
      await flush();
      expect(textContent(tips()[0])).toBe(props.title);
      trigger(action, 'onKeydown', { key: 'Escape', stopPropagation: vi.fn() });
      await vi.advanceTimersByTimeAsync(600);
      expect(tips()).toHaveLength(0);
      m.app.unmount();
    },
  );
  it('disables owned actions, suppresses content/double click and keyboard emits, then recovers', async () => {
    const clicks = vi.fn(),
      double = vi.fn(),
      activate = vi.fn(),
      title = vi.fn(),
      art = vi.fn(),
      props = reactive({
        title: '不可操作',
        interactive: true,
        titleClickable: true,
        artworkClickable: true,
        activateOnEnter: true,
        disabled: true,
        onRowClick: clicks,
        onRowDblclick: double,
        onActivate: activate,
        onTitleClick: title,
        onArtworkClick: art,
      }),
      m = specimen(props);
    const buttons = findAll(m.row, (n) => n.type === 'button');
    expect(m.row.props['aria-disabled']).toBe('true');
    buttons.forEach((b) => expect(b.props.disabled).toBe(true));
    const action = m.find('ui-track__action');
    trigger(action, 'onClick', {});
    trigger(action, 'onDblclick', {});
    trigger(action, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    trigger(m.find('ui-track__info'), 'onClick', {});
    trigger(m.find('ui-track__info'), 'onDblclick', {});
    expect(clicks).not.toHaveBeenCalled();
    expect(double).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    props.disabled = false;
    await nextTick();
    trigger(action, 'onClick', {});
    expect(clicks).toHaveBeenCalledOnce();
    m.app.unmount();
  });
  it('respects cancelled Enter and repeat, retains separate row keyboard contract', () => {
    const primary = vi.fn(),
      key = vi.fn((e) => {
        if (e.cancel) e.preventDefault();
      }),
      m = specimen({
        interactive: true,
        title: '曲目',
        activateOnEnter: true,
        onActivate: primary,
        onActionKeydown: key,
      });
    const action = m.find('ui-track__action');
    const event = (extra = {}) => ({
      key: 'Enter',
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    });
    trigger(action, 'onKeydown', event({ cancel: true }));
    expect(primary).not.toHaveBeenCalled();
    const repeat = event({ repeat: true });
    trigger(action, 'onKeydown', repeat);
    expect(repeat.defaultPrevented).toBe(true);
    expect(primary).not.toHaveBeenCalled();
    trigger(action, 'onKeydown', event());
    expect(primary).toHaveBeenCalledOnce();
    trigger(action, 'onKeydown', event({ key: ' ' }));
    expect(primary).toHaveBeenCalledOnce();
    expect(key).toHaveBeenCalledTimes(4);
    m.app.unmount();
  });
  it('guards disabled plain text hints and allows title click without row activation', async () => {
    const rowClick = vi.fn(),
      titleClick = vi.fn(),
      props = reactive({
        title: '很長曲目',
        interactive: true,
        disabled: true,
        onRowClick: rowClick,
        onTitleClick: titleClick,
      }),
      m = specimen(props);
    size(m);
    await flush();
    trigger(m.find('ui-marquee'), 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(550);
    expect(tips()).toHaveLength(0);
    props.disabled = false;
    props.titleClickable = true;
    await nextTick();
    const b = m.find('ui-text-btn'),
      e = { stopPropagation: vi.fn() };
    trigger(b, 'onClick', e);
    expect(titleClick).toHaveBeenCalledOnce();
    expect(rowClick).not.toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    m.app.unmount();
  });
  it('preserves selection/current semantics and flat prop precedence when disabled', async () => {
    const html = await renderToString(
      createSSRApp(Row, {
        track: { id: 'a', title: '舊曲', artist: '舊演出者', duration: 90 },
        title: '新曲',
        artist: '新演出者',
        active: true,
        current: true,
        interactive: true,
        selectionAction: true,
        disabled: true,
      }),
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('新曲');
    expect(html).not.toContain('舊曲');
    expect(html).toContain('1:30');
  });
});

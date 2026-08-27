import { describe, expect, it, vi } from 'vitest';
import {
  createLyricsDiagnostics,
  createLyricsFrameScheduler,
  destroyLyricsAnimations,
  renderLyricsFrame,
} from './lyrics.mjs';

function gsapHarness() {
  const timelines = [];
  const gsap = {
    killTweensOf: vi.fn(),
    set: vi.fn(),
    to: vi.fn(),
    timeline: vi.fn((options = {}) => {
      const timeline = {
        additions: [],
        labels: [],
        options,
        tweens: [],
        kill: vi.fn(),
        addLabel(label) {
          this.labels.push(label);
          return this;
        },
        to(target, vars, position) {
          this.tweens.push({ position, target, vars });
          return this;
        },
        add(callback) {
          this.additions.push(callback);
          return this;
        },
      };
      timelines.push(timeline);
      return timeline;
    }),
  };
  return { gsap, timelines };
}

function element(ownerDocument = null) {
  let ownText = '';
  let textContentWriteCount = 0;
  const value = {
    ownerDocument,
    children: [],
    hidden: false,
    dataset: {},
    attributes: {},
    animate: vi.fn(),
    style: {
      values: {},
      removeProperty(name) {
        delete this.values[name];
      },
      setProperty(name, nextValue) {
        this.values[name] = nextValue;
      },
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      ownText = '';
      this.children = children;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      delete this[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      this[name] = value;
    },
  };
  Object.defineProperty(value, 'textContent', {
    get() {
      return ownText + this.children.map((child) => child.textContent).join('');
    },
    set(nextValue) {
      textContentWriteCount += 1;
      ownText = String(nextValue);
      this.children = [];
    },
  });
  Object.defineProperty(value, 'textContentWriteCount', {
    get() {
      return textContentWriteCount;
    },
  });
  Object.defineProperty(value, 'innerHTML', {
    set() {
      throw new Error('innerHTML must not be used');
    },
  });
  return value;
}

function domElements() {
  const documentApi = {
    createElement: vi.fn(() => element(documentApi)),
    createElementNS: vi.fn(() => {
      const svgElement = element(documentApi);
      Object.defineProperty(svgElement, 'className', {
        get: () => ({ baseVal: '' }),
      });
      return svgElement;
    }),
  };
  return {
    root: element(documentApi),
    current: element(documentApi),
    liveStageCard: element(documentApi),
    liveStageChrome: element(documentApi),
    liveStageTitle: element(documentApi),
    liveStageArtist: element(documentApi),
    mangaBubbles: element(documentApi),
    next: element(documentApi),
    ktvCountIn: element(documentApi),
  };
}

describe('lyrics overlay renderer', () => {
  it('emits bounded sweep diagnostics only when lyricsDebug is explicitly enabled', () => {
    const consoleApi = { debug: vi.fn() };
    const disabled = createLyricsDiagnostics({
      consoleApi,
      location: { search: '?workbench=1' },
    });
    const enabled = createLyricsDiagnostics({
      consoleApi,
      location: { search: '?workbench=1&lyricsDebug=1' },
    });

    expect(disabled).toBeNull();
    expect(enabled).toEqual(expect.any(Function));
    enabled('sweep-start', {
      lineIndex: 3,
      mode: 't1',
      progress: 25,
      templateId: 'karaoke-stack',
    });
    expect(consoleApi.debug).toHaveBeenCalledWith(
      '[Utawakui lyrics]',
      'sweep-start',
      {
        lineIndex: 3,
        mode: 't1',
        progress: 25,
        templateId: 'karaoke-stack',
      },
    );
  });

  it('shows a four-beat Classic KTV cue without exposing it to other templates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: false,
      currentText: '',
      nextText: '',
      language: 'zh-Hant',
      ktv: {
        visible: true,
        currentText: '[女]第一句',
        nextText: '第二句',
        currentVisibleLineIndex: 0,
        nextVisibleLineIndex: 1,
        lineProgress: 0,
        countIn: {
          remainingBeats: 4,
          totalBeats: 4,
          timingSource: 'fixed-window',
        },
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'karaoke-stack',
      reducedMotion: true,
    });

    expect(elements.root.hidden).toBe(false);
    expect(elements.current.textContent).toBe('第一句');
    expect(elements.next.textContent).toBe('第二句');
    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.current.dataset.ktvRole).toBe('female');
    expect(elements.ktvCountIn.hidden).toBe(false);
    expect(elements.ktvCountIn.dataset.remainingBeats).toBe('4');
    expect(elements.ktvCountIn.dataset.ktvRole).toBe('female');
    expect(elements.ktvCountIn.dataset.ktvLane).toBe('a');

    renderLyricsFrame(elements, frame, { templateId: 'quiet-caption' });

    expect(elements.root.hidden).toBe(true);
    expect(elements.ktvCountIn.hidden).toBe(true);
  });

  it('places an overlapping slow-BPM count-in on the upcoming KTV lane', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '副歌尾句',
        nextText: '慢歌下段',
        ktv: {
          visible: true,
          currentText: '副歌尾句',
          nextText: '慢歌下段',
          currentVisibleLineIndex: 0,
          nextVisibleLineIndex: 1,
          currentRole: 'male',
          nextRole: 'female',
          lineProgress: 0.8,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'tempo',
            visibleLineIndex: 1,
            role: 'female',
          },
        },
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('副歌尾句');
    expect(elements.next.textContent).toBe('慢歌下段');
    expect(elements.ktvCountIn.hidden).toBe(false);
    expect(elements.ktvCountIn.dataset.ktvLane).toBe('b');
    expect(elements.ktvCountIn.dataset.ktvRole).toBe('female');
  });

  it('renders external lyrics as text and clears hidden state', () => {
    const elements = domElements();
    const malicious = '<img src=x onerror=alert(1)>';

    renderLyricsFrame(elements, {
      revision: 2,
      visible: true,
      currentText: malicious,
      nextText: '下一句',
      language: 'zh-Hant',
    });

    expect(elements.current.textContent).toBe(malicious);
    expect(elements.next.textContent).toBe('下一句');
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.lang).toBe('zh-Hant');
  });

  it('keeps a Classic KTV T1 line mounted and does not restart its sweep on clock-only updates', () => {
    const elements = domElements();
    const animation = { cancel: vi.fn() };
    elements.current.animate.mockReturnValue(animation);
    const baseFrame = {
      revision: 1,
      visible: true,
      currentText: '同一句保持穩定',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      lineIndex: 0,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, baseFrame, { templateId: 'karaoke-stack' });
    const currentWrites = elements.current.textContentWriteCount;
    const nextWrites = elements.next.textContentWriteCount;

    renderLyricsFrame(
      elements,
      {
        ...baseFrame,
        revision: 2,
        lineProgress: 0.35,
        lineRemainingMs: 3000,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.textContentWriteCount).toBe(currentWrites);
    expect(elements.next.textContentWriteCount).toBe(nextWrites);
    expect(elements.current.animate).toHaveBeenCalledOnce();
    expect(animation.cancel).not.toHaveBeenCalled();
  });

  it('traces one Classic KTV sweep start followed by reuse without logging lyric text', () => {
    const elements = domElements();
    const trace = vi.fn();
    elements.current.animate.mockReturnValue({ cancel: vi.fn() });
    const frame = {
      revision: 1,
      visible: true,
      currentText: '不可寫入診斷的歌詞',
      currentVisibleLineIndex: 2,
      nextText: '',
      lineIndex: 2,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'karaoke-stack',
      trace,
    });
    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.4, lineRemainingMs: 3000 },
      { templateId: 'karaoke-stack', trace },
    );

    expect(trace).toHaveBeenCalledWith(
      'sweep-start',
      expect.objectContaining({ lineIndex: 2, mode: 't1', revision: 1 }),
    );
    expect(trace).toHaveBeenCalledWith(
      'sweep-reuse',
      expect.objectContaining({ lineIndex: 2, mode: 't1', revision: 2 }),
    );
    expect(JSON.stringify(trace.mock.calls)).not.toContain(
      '不可寫入診斷的歌詞',
    );
  });

  it('resynchronizes a mounted Classic KTV line only when playback pauses, resumes, or seeks', () => {
    const elements = domElements();
    const firstAnimation = { cancel: vi.fn() };
    const resumedAnimation = { cancel: vi.fn() };
    const seekAnimation = { cancel: vi.fn() };
    elements.current.animate
      .mockReturnValueOnce(firstAnimation)
      .mockReturnValueOnce(resumedAnimation)
      .mockReturnValueOnce(seekAnimation);
    const frame = {
      revision: 1,
      visible: true,
      currentText: '暫停與 seek 不換字',
      currentVisibleLineIndex: 0,
      nextText: '',
      lineIndex: 0,
      lineProgress: 0.2,
      lineRemainingMs: 4000,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    const textWrites = elements.current.textContentWriteCount;
    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.4, lineRemainingMs: null },
      { templateId: 'karaoke-stack' },
    );

    expect(firstAnimation.cancel).toHaveBeenCalledOnce();
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('40%');
    expect(elements.current.textContentWriteCount).toBe(textWrites);

    renderLyricsFrame(
      elements,
      { ...frame, revision: 3, lineProgress: 0.4, lineRemainingMs: 3000 },
      { templateId: 'karaoke-stack' },
    );
    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 4,
        lineProgress: 0.7,
        lineRemainingMs: 1500,
        timelineDiscontinuity: true,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(resumedAnimation.cancel).toHaveBeenCalledOnce();
    expect(elements.current.animate).toHaveBeenCalledTimes(3);
    expect(elements.current.textContentWriteCount).toBe(textWrites);
  });

  it('keeps generic caption text mounted on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '普通字幕也不重建',
      nextText: '下一句',
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'quiet-caption',
      reducedMotion: true,
    });
    const currentWrites = elements.current.textContentWriteCount;
    const nextWrites = elements.next.textContentWriteCount;

    renderLyricsFrame(
      elements,
      { ...frame, revision: 2 },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(elements.current.textContentWriteCount).toBe(currentWrites);
    expect(elements.next.textContentWriteCount).toBe(nextWrites);
  });

  it('reuses T2 segment nodes and active sweep animations on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '逐字保持穩定',
      nextText: '',
      lineIndex: 0,
      currentVisibleLineIndex: 0,
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: '逐字',
          state: 'active',
          progress: 0.2,
          remainingMs: 800,
        },
        {
          segmentId: 'segment-2',
          text: '保持穩定',
          state: 'upcoming',
          progress: 0,
        },
      ],
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    const segmentNodes = [...elements.current.children];

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentSegments: [
          { ...frame.currentSegments[0], progress: 0.4, remainingMs: 600 },
          frame.currentSegments[1],
        ],
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.children).toEqual(segmentNodes);
    expect(segmentNodes[0].animate).toHaveBeenCalledOnce();
  });

  it('keeps Live Stage caption line nodes mounted on clock-only updates', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '第一行\n第二行',
      nextText: '',
      language: 'zh-Hant',
      lineIndex: 0,
      liveStage: {
        active: true,
        cardVisible: false,
        trackId: 'track-1',
        title: 'Song',
        artist: 'Singer',
      },
    };

    renderLyricsFrame(elements, frame, {
      templateId: 'live-stage',
      reducedMotion: true,
    });
    const captionLines = [...elements.current.children];

    renderLyricsFrame(
      elements,
      { ...frame, revision: 2, lineProgress: 0.25 },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.current.children).toEqual(captionLines);
  });

  it('keeps Manga Frame bubbles and segment nodes mounted on clock-only updates', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '漫画保持穩定',
      nextText: '',
      language: 'zh-Hant',
      lineIndex: 0,
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: '漫画保持穩定',
          state: 'active',
          progress: 0.2,
          remainingMs: 800,
        },
      ],
    };

    renderLyricsFrame(elements, frame, { gsap, templateId: 'manga-frame' });
    timelines[0].options.onComplete();
    const bubble = elements.mangaBubbles.children[0];
    const segment = bubble.children[1].children[0];

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentSegments: [
          { ...frame.currentSegments[0], progress: 0.4, remainingMs: 600 },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children[0]).toBe(bubble);
    expect(bubble.children[1].children[0]).toBe(segment);
    expect(gsap.to).toHaveBeenCalledOnce();
  });

  it('keeps Classic KTV A and B as fixed lanes while the active lyric alternates in place', () => {
    const elements = domElements();
    const scheduled = [];
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        const token = { callback, delayMs };
        scheduled.push(token);
        return token;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'A 正在唱',
        currentVisibleLineIndex: 0,
        nextText: 'B 等待中',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.root.dataset.ktvActiveLane).toBe('a');

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'B 等待中',
        currentVisibleLineIndex: 1,
        nextText: 'A 換成下一句',
        nextVisibleLineIndex: 2,
        language: 'zh-Hant',
        lineIndex: 1,
        lineProgress: 0.65,
      },
      options,
    );

    expect(elements.current.textContent).toBe('B 等待中');
    expect(elements.current.dataset.ktvLane).toBe('b');
    expect(elements.next.textContent).toBe('A 正在唱');
    expect(elements.next.dataset.ktvLane).toBe('a');
    expect(elements.next.dataset.ktvHeld).toBe('true');
    expect(elements.root.dataset.ktvActiveLane).toBe('b');
    expect(scheduled[0]?.delayMs).toBe(600);

    scheduled[0].callback();

    expect(elements.next.textContent).toBe('A 換成下一句');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'A 換成下一句',
        currentVisibleLineIndex: 2,
        nextText: 'B 再換下一句',
        nextVisibleLineIndex: 3,
        language: 'zh-Hant',
        lineIndex: 3,
      },
      options,
    );

    expect(elements.current.dataset.ktvLane).toBe('a');
    expect(elements.next.textContent).toBe('B 等待中');
    expect(elements.next.dataset.ktvLane).toBe('b');
    expect(elements.root.dataset.ktvActiveLane).toBe('a');
  });

  it('uses explicit vocal roles, strips speaker cues, and keeps the completed role during the hold', () => {
    const elements = domElements();
    let release;
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback) => {
        release = callback;
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '[男] 他的歌詞',
        currentVisibleLineIndex: 0,
        nextText: '[女]她的歌詞',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );

    expect(elements.current.textContent).toBe('他的歌詞');
    expect(elements.current.dataset.ktvRole).toBe('male');
    expect(elements.next.textContent).toBe('她的歌詞');
    expect(elements.next.dataset.ktvRole).toBe('female');

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '[女]她的歌詞',
        currentVisibleLineIndex: 1,
        nextText: '[合] 一起唱',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.current.textContent).toBe('她的歌詞');
    expect(elements.current.dataset.ktvRole).toBe('female');
    expect(elements.next.textContent).toBe('他的歌詞');
    expect(elements.next.dataset.ktvRole).toBe('male');
    expect(elements.next.dataset.ktvHeld).toBe('true');

    release();

    expect(elements.next.textContent).toBe('一起唱');
    expect(elements.next.dataset.ktvRole).toBe('group');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
  });

  it('removes an explicit KTV speaker cue from the first T2 segment without changing its projection', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '[女] 歌詞',
        currentVisibleLineIndex: 0,
        currentSegments: [
          {
            segmentId: 'first-word',
            text: '[女] 歌',
            state: 'active',
            progress: 0.25,
            remainingMs: 900,
          },
          {
            segmentId: 'second-word',
            text: '詞',
            state: 'upcoming',
            progress: 0,
          },
        ],
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 0,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('歌詞');
    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children[0]).toMatchObject({
      textContent: '歌',
      dataset: expect.objectContaining({
        segmentId: 'first-word',
        segmentState: 'active',
      }),
    });
    expect(elements.current.children[1]).toMatchObject({
      textContent: '詞',
      dataset: expect.objectContaining({ segmentId: 'second-word' }),
    });
    expect(elements.current.dataset.ktvRole).toBe('female');
  });

  it('keeps Classic KTV lanes still while preserving generic lyric entrance motion', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '固定不抖動',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });

    expect(elements.current.animate).not.toHaveBeenCalled();

    renderLyricsFrame(
      elements,
      {
        ...frame,
        revision: 2,
        currentText: '其他模板仍可動態進場',
        lineIndex: 1,
      },
      { templateId: 'quiet-caption' },
    );

    expect(elements.current.animate).toHaveBeenCalledWith(
      [
        { opacity: 0.35, transform: 'translateY(0.3em)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  });

  it('estimates Classic KTV sung progress from synced line timing without T2 segments', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '沒有逐字也會掃色',
        currentVisibleLineIndex: 0,
        nextText: '下一句',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
        lineProgress: 0.25,
        lineRemainingMs: 3000,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.dataset.lineProgress).toBe('true');
    expect(elements.current.dataset.text).toBe('沒有逐字也會掃色');
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('25%');
    expect(elements.current.animate).toHaveBeenCalledWith(
      [
        { '--ovl-segment-progress': '25%' },
        { '--ovl-segment-progress': '100%' },
      ],
      { duration: 3000, easing: 'linear', fill: 'forwards' },
    );
    expect(elements.current.animate).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: expect.any(String) }),
      ]),
      expect.anything(),
    );
  });

  it('freezes estimated Classic KTV progress when playback is not advancing', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '暫停在這裡',
        currentVisibleLineIndex: 0,
        nextText: '下一句',
        nextVisibleLineIndex: 1,
        language: 'zh-Hant',
        lineIndex: 0,
        lineProgress: 0.4,
      },
      { templateId: 'karaoke-stack' },
    );

    expect(elements.current.dataset.lineProgress).toBe('true');
    expect(elements.current.style.values['--ovl-segment-progress']).toBe('40%');
    expect(elements.current.animate).not.toHaveBeenCalled();
  });

  it('does not retain a stale Classic KTV lane after seeking into the middle of a line', () => {
    const elements = domElements();
    const timer = {};
    const schedule = vi.fn(() => timer);
    const cancelSchedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule,
      cancelSchedule,
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '原本的 A',
        currentVisibleLineIndex: 0,
        nextText: '原本的 B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'B 從起點接唱',
        currentVisibleLineIndex: 1,
        nextText: '新的 A',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.next.textContent).toBe('原本的 A');
    expect(schedule).toHaveBeenCalledOnce();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'B 從起點接唱',
        currentVisibleLineIndex: 1,
        nextText: '新的 A',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
        lineProgress: 0.65,
        timelineDiscontinuity: true,
      },
      options,
    );

    expect(elements.next.textContent).toBe('新的 A');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
    expect(cancelSchedule).toHaveBeenCalledWith(timer);
  });

  it('does not start a lane hold when seeking into a Classic KTV count-in', () => {
    const elements = domElements();
    const schedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule,
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'Seek 前的 A',
        currentVisibleLineIndex: 0,
        nextText: 'Seek 前的 B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: false,
        currentText: '',
        nextText: '',
        timelineDiscontinuity: true,
        ktv: {
          visible: true,
          currentText: 'Seek 後的 B',
          currentVisibleLineIndex: 1,
          nextText: 'Seek 後的 A',
          nextVisibleLineIndex: 2,
          lineProgress: 0,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'fixed-window',
          },
        },
      },
      options,
    );

    expect(elements.current.textContent).toBe('Seek 後的 B');
    expect(elements.next.textContent).toBe('Seek 後的 A');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('briefly keeps the completed Classic KTV lane beside the final line', () => {
    const elements = domElements();
    let release;
    let releaseDelayMs;
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        release = callback;
        releaseDelayMs = delayMs;
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '倒數第二句',
        currentVisibleLineIndex: 0,
        nextText: '最後一句',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '最後一句',
        currentVisibleLineIndex: 1,
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 1,
        lineProgress: 0,
      },
      options,
    );

    expect(elements.next.dataset.ktvLane).toBe('a');
    expect(elements.next.textContent).toBe('倒數第二句');
    expect(elements.next.dataset.ktvHeld).toBe('true');
    expect(releaseDelayMs).toBe(600);

    release();

    expect(elements.next.textContent).toBe('');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
  });

  it('uses only the remaining lane hold when a count-in begins', () => {
    const elements = domElements();
    const scheduled = [];
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return callback;
      }),
      cancelSchedule: vi.fn(),
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: '副歌尾句',
        currentVisibleLineIndex: 0,
        nextText: '',
        nextVisibleLineIndex: null,
        lineIndex: 0,
        lineProgress: 1,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: false,
        currentText: '',
        nextText: '',
        ktv: {
          visible: true,
          currentText: '下段開頭',
          currentVisibleLineIndex: 1,
          nextText: '下一句',
          nextVisibleLineIndex: 2,
          lineProgress: 0,
          laneReplacementDelayMs: 100,
          countIn: {
            remainingBeats: 4,
            totalBeats: 4,
            timingSource: 'fixed-window',
          },
        },
      },
      options,
    );

    expect(elements.next.textContent).toBe('副歌尾句');
    expect(elements.next.dataset.ktvHeld).toBe('true');
    expect(scheduled[0]?.delayMs).toBe(100);
  });

  it('cancels a pending Classic KTV lane replacement when the template changes', () => {
    const elements = domElements();
    const timer = {};
    let staleCallback;
    const cancelSchedule = vi.fn();
    const options = {
      templateId: 'karaoke-stack',
      reducedMotion: true,
      schedule: vi.fn((callback) => {
        staleCallback = callback;
        return timer;
      }),
      cancelSchedule,
    };

    renderLyricsFrame(
      elements,
      {
        revision: 1,
        visible: true,
        currentText: 'KTV A',
        currentVisibleLineIndex: 0,
        nextText: 'KTV B',
        nextVisibleLineIndex: 1,
        lineIndex: 0,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'KTV B',
        currentVisibleLineIndex: 1,
        nextText: 'KTV A2',
        nextVisibleLineIndex: 2,
        lineIndex: 1,
      },
      options,
    );
    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '一般字幕',
        nextText: '一般下一句',
        lineIndex: 1,
      },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(cancelSchedule).toHaveBeenCalledWith(timer);
    expect(elements.next.textContent).toBe('一般下一句');

    staleCallback();

    expect(elements.next.textContent).toBe('一般下一句');
  });

  it('clears Classic KTV lane metadata when another template takes over', () => {
    const elements = domElements();
    const frame = {
      revision: 1,
      visible: true,
      currentText: '固定槽位',
      currentVisibleLineIndex: 0,
      nextText: '下一句',
      nextVisibleLineIndex: 1,
      language: 'zh-Hant',
      lineIndex: 0,
    };

    renderLyricsFrame(elements, frame, { templateId: 'karaoke-stack' });
    renderLyricsFrame(elements, frame, { templateId: 'quiet-caption' });

    expect(elements.current.dataset).not.toHaveProperty('ktvLane');
    expect(elements.next.dataset).not.toHaveProperty('ktvLane');
    expect(elements.current.dataset).not.toHaveProperty('ktvRole');
    expect(elements.next.dataset).not.toHaveProperty('ktvRole');
    expect(elements.next.dataset).not.toHaveProperty('ktvHeld');
    expect(elements.root.dataset).not.toHaveProperty('ktvActiveLane');
  });

  it('keeps an upcoming lyric in its deterministic lane while the active source row is blank', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '',
        currentVisibleLineIndex: null,
        nextText: '空白後的第三個可見句',
        nextVisibleLineIndex: 2,
        language: 'zh-Hant',
        lineIndex: 4,
      },
      { templateId: 'karaoke-stack', reducedMotion: true },
    );

    expect(elements.current.dataset).not.toHaveProperty('ktvLane');
    expect(elements.next.dataset.ktvLane).toBe('a');
    expect(elements.root.dataset).not.toHaveProperty('ktvActiveLane');
  });

  it('renders Live Stage lyrics and its independently visible track card together', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: "[아사]\nBut if you're killing my mood\nGood riddance",
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: "But if you're killing my mood",
            state: 'active',
            progress: 0.5,
            remainingMs: 400,
          },
        ],
        nextText: 'must not render',
        language: 'ko',
        liveStage: {
          active: true,
          cardVisible: true,
          trackId: 'track-1',
          title: 'MOON',
          artist: 'BABYMONSTER',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.liveStageChrome.hidden).toBe(false);
    expect(elements.liveStageCard.hidden).toBe(false);
    expect(elements.liveStageTitle.textContent).toBe('MOON');
    expect(elements.liveStageArtist.textContent).toBe('BABYMONSTER');
    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children.map((line) => line.textContent)).toEqual([
      "But if you're killing my mood",
      'Good riddance',
    ]);
    expect(elements.current.textContent).not.toContain('[아사]');
    expect(elements.current.dataset.segmented).toBeUndefined();
    expect(elements.next.hidden).toBe(true);
    expect(elements.next.textContent).toBe('');
  });

  it('keeps one typography contract for a long asymmetric Live Stage pair', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '[리즈] 네가 보낸 DM을 읽고 나서 답이 없는 게',
        nextText: '',
        language: 'ko',
        lineProgress: 0.5,
        liveStage: { active: true, cardVisible: false },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.current.children.map((line) => line.textContent)).toEqual([
      '네가 보낸 DM을',
      '읽고 나서 답이 없는 게',
    ]);
    expect(elements.root.dataset.liveStageCaptionLength).toBeUndefined();
  });

  it('keeps Live Stage chrome visible without lyrics and hides an absent artist safely', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: false,
        currentText: '',
        nextText: '',
        language: '',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Instrumental',
          artist: '',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.liveStageChrome.hidden).toBe(false);
    expect(elements.liveStageCard.hidden).toBe(true);
    expect(elements.liveStageArtist.hidden).toBe(true);
    expect(elements.current.hidden).toBe(true);
  });

  it('does not send empty Manga target lists through GSAP during Live Stage cleanup', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '一二三四五六 七八九十甲乙',
        nextText: '',
        language: 'zh-Hant',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Song',
          artist: 'Singer',
        },
      },
      { gsap, templateId: 'live-stage', reducedMotion: true },
    );

    const emptyTargetCalls = [
      ...gsap.killTweensOf.mock.calls,
      ...gsap.set.mock.calls,
    ].filter(([target]) => Array.isArray(target) && target.length === 0);
    expect(emptyTargetCalls).toEqual([]);
  });

  it('uses one interruptible GSAP timeline to dismiss the Live Stage card', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const baseFrame = {
      revision: 4,
      visible: true,
      currentText: '歌詞仍然顯示',
      nextText: '',
      language: 'zh-Hant',
      liveStage: {
        active: true,
        cardVisible: true,
        trackId: 'track-1',
        title: '如果可以',
        artist: '韋禮安',
      },
    };

    renderLyricsFrame(elements, baseFrame, {
      gsap,
      templateId: 'live-stage',
      reducedMotion: true,
    });
    renderLyricsFrame(
      elements,
      {
        ...baseFrame,
        revision: 5,
        liveStage: { ...baseFrame.liveStage, cardVisible: false },
      },
      { gsap, templateId: 'live-stage' },
    );

    expect(timelines).toHaveLength(1);
    expect(timelines[0].tweens).toHaveLength(1);
    expect(timelines[0].tweens[0]).toMatchObject({
      target: elements.liveStageCard,
      vars: {
        autoAlpha: 0,
        x: 24,
        duration: 0.18,
        ease: 'power2.in',
        overwrite: 'auto',
      },
    });
    expect(elements.current.textContent).toBe('歌詞仍然顯示');

    timelines[0].options.onComplete();
    expect(elements.liveStageCard.hidden).toBe(true);
  });

  it('interrupts the Live Stage card entrance when its playback window closes', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    const liveStage = {
      active: true,
      cardVisible: true,
      trackId: 'track-1',
      title: '海螺記',
      artist: '163braces',
    };

    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'zh-Hant',
        liveStage,
      },
      { gsap, templateId: 'live-stage' },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 7,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'zh-Hant',
        liveStage: { ...liveStage, cardVisible: false },
      },
      { gsap, templateId: 'live-stage' },
    );

    expect(timelines).toHaveLength(2);
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(timelines[1].tweens[0]).toMatchObject({
      target: elements.liveStageCard,
      vars: { autoAlpha: 0, duration: 0.18 },
    });
  });

  it('clears Live Stage accessibility metadata when another template takes over', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 8,
        visible: true,
        currentText: '[리즈]\nLive Stage line',
        nextText: '',
        language: 'ko',
        liveStage: {
          active: true,
          cardVisible: false,
          trackId: 'track-1',
          title: 'Song',
          artist: 'Singer',
        },
      },
      { templateId: 'live-stage', reducedMotion: true },
    );
    expect(elements.root.attributes['aria-label']).toBe(
      '[리즈]\nLive Stage line',
    );

    renderLyricsFrame(
      elements,
      {
        revision: 9,
        visible: true,
        currentText: 'Quiet caption line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'quiet-caption', reducedMotion: true },
    );

    expect(elements.root.attributes['aria-label']).toBeUndefined();
  });

  it('fades one Manga utterance as one whole bubble', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: 'previous line',
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    const outgoingBubble = elements.mangaBubbles.children[0];

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'current line',
        nextText: 'must not render',
        language: 'en',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.current.textContent).toBe('previous line');
    expect(elements.next.textContent).toBe('');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['exit']);
    expect(timelines[0].tweens[0]).toMatchObject({
      target: [outgoingBubble],
      vars: {
        autoAlpha: 0,
        duration: 0.14,
        ease: 'power2.in',
        overwrite: 'auto',
        stagger: { each: 0.06, from: 'start' },
      },
    });
    expect(elements.current.animate).not.toHaveBeenCalled();

    timelines[0].additions[0]();

    expect(elements.current.textContent).toBe('current line');
    expect(elements.next.textContent).toBe('');
    const bubble = elements.mangaBubbles.children[0];
    expect(gsap.set).toHaveBeenCalledWith([bubble], { autoAlpha: 0 });
    expect(timelines[0].labels).toEqual(['exit', 'enter']);
    expect(timelines[0].tweens[1]).toMatchObject({
      position: 'enter',
      target: bubble,
      vars: {
        autoAlpha: 1,
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    });
    expect(elements.root.dataset).toMatchObject({
      mangaFrame: 'spoken',
      mangaLength: 'short',
      mangaSide: 'right',
    });
    expect(bubble.dataset.mangaSide).toBe('right');
    expect(bubble.dataset.mangaOrder).toBe('1');
    expect(bubble.style.values['--ovl-manga-anchor-y']).toMatch(/%$/);
    expect(bubble.style.values['--ovl-manga-inline-jitter']).toMatch(/rem$/);
  });

  it('renders every Manga T1 phrase and parenthetical as an independent bubble', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'マニュアル 私だけにフォーカス （フォーカス）',
        nextText: '',
        language: 'und',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.root.attributes['aria-label']).toBe(
      'マニュアル 私だけにフォーカス （フォーカス）',
    );
    expect(elements.mangaBubbles.dataset.mangaCount).toBe('3');
    expect(elements.mangaBubbles.children).toHaveLength(3);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.dataset.lyricKind),
    ).toEqual(['main', 'main', 'aside']);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.textContent),
    ).toEqual(['マニュアル', '私だけにフォーカス', 'フォーカス']);
    expect(
      elements.mangaBubbles.children.map((bubble) => bubble.dataset.mangaSide),
    ).toEqual(['right', 'left', 'right']);
    expect(
      elements.mangaBubbles.children.map((bubble) =>
        Number.parseFloat(bubble.style.values['--ovl-manga-anchor-y']),
      ),
    ).toEqual(
      elements.mangaBubbles.children
        .map((bubble) =>
          Number.parseFloat(bubble.style.values['--ovl-manga-anchor-y']),
        )
        .sort((a, b) => a - b),
    );
    expect(
      elements.mangaBubbles.children.every(
        (bubble) =>
          bubble.children[0].attributes.class ===
            'lyrics-overlay__manga-frame' &&
          bubble.children[1].className === 'lyrics-overlay__manga-text',
      ),
    ).toBe(true);
    expect(elements.mangaBubbles.children[2].children[0].dataset.frameId).toBe(
      'whisper',
    );
  });

  it('keeps an aside frame distinct when whisper is the selected main frame', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '主詞 （低語）',
        nextText: '',
        language: 'zh-Hant',
        lineIndex: 0,
      },
      {
        templateId: 'manga-frame',
        mangaFrameId: 'whisper',
        reducedMotion: true,
      },
    );

    expect(elements.mangaBubbles.children[0].children[0].dataset.frameId).toBe(
      'whisper',
    );
    expect(elements.mangaBubbles.children[1].children[0].dataset.frameId).toBe(
      'thought',
    );
  });

  it('keeps a parenthetical-only T2 aside delimiter-free', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '（echo）',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '（echo）',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const bubble = elements.mangaBubbles.children[0];
    const segment = bubble.children[1].children[0];
    expect(bubble.dataset.lyricKind).toBe('aside');
    expect(segment.textContent).toBe('echo');
    expect(elements.root.attributes['aria-label']).toBe('（echo）');
  });

  it('reveals each bubble one second after the prior fade completes', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '旧一 旧二 （旧三）',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    const outgoing = [...elements.mangaBubbles.children];

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '新一 新二 （新三）',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines[0].tweens[0]).toMatchObject({
      target: outgoing,
      vars: {
        autoAlpha: 0,
        duration: 0.14,
        stagger: { each: 0.06, from: 'start' },
      },
    });

    timelines[0].additions[0]();

    const incoming = [...elements.mangaBubbles.children];
    expect(incoming.map((bubble) => bubble.textContent)).toEqual([
      '新一',
      '新二',
      '新三',
    ]);
    expect(gsap.set).toHaveBeenCalledWith(incoming, { autoAlpha: 0 });
    expect(timelines[0].tweens.slice(1)).toMatchObject([
      {
        position: 'enter',
        target: incoming[0],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
      {
        position: '+=1',
        target: incoming[1],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
      {
        position: '+=1',
        target: incoming[2],
        vars: { autoAlpha: 1, duration: 0.16 },
      },
    ]);
  });

  it('applies a count-aware text fit to a long phrase inside three bubbles', () => {
    const elements = domElements();
    const longPhrase = '長'.repeat(25);

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: `短句 ${longPhrase} （echo）`,
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    const longBubble = elements.mangaBubbles.children[1];
    expect(
      Number.parseFloat(longBubble.style.values['--ovl-manga-text-fit-size']),
    ).toBeLessThan(1.9);
  });

  it('projects T2 progress across independent authored phrase bubbles', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '前半 後半',
            state: 'active',
            progress: 0.5,
            remainingMs: 200,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('2');
    const segmentBubbles = elements.mangaBubbles.children.map(
      (bubble) => bubble.children[1].children[0],
    );
    expect(segmentBubbles.map((segment) => segment.textContent)).toEqual([
      '前半',
      '後半',
    ]);
    expect(
      segmentBubbles.map(
        (segment) => segment.style.values['--ovl-segment-progress'],
      ),
    ).toEqual(['100%', '0%']);
  });

  it('sequences one T2 segment across bubble boundaries without waiting for another snapshot', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '前半 後半',
            state: 'active',
            progress: 0.25,
            remainingMs: 750,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame' },
    );

    const segmentBubbles = elements.mangaBubbles.children.map(
      (bubble) => bubble.children[1].children[0],
    );
    expect(
      segmentBubbles.map(
        (segment) => segment.style.values['--ovl-segment-progress'],
      ),
    ).toEqual(['50%', '0%']);
    expect(gsap.to).toHaveBeenNthCalledWith(
      1,
      segmentBubbles[0],
      expect.objectContaining({
        '--ovl-segment-progress': '100%',
        delay: 0,
        duration: 0.25,
      }),
    );
    expect(gsap.to).toHaveBeenNthCalledWith(
      2,
      segmentBubbles[1],
      expect.objectContaining({
        '--ovl-segment-progress': '100%',
        delay: 0.25,
        duration: 0.5,
      }),
    );
  });

  it('replaces a multi-bubble M0 line without retaining prior phrase content', () => {
    const elements = domElements();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '前半 後半 （echo）',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );
    expect(elements.mangaBubbles.children).toHaveLength(3);

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '新しい行',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.mangaBubbles.dataset.mangaCount).toBe('1');
    expect(elements.mangaBubbles.children).toHaveLength(1);
    expect(elements.mangaBubbles.textContent).toBe('新しい行');
  });

  it('switches Manga Frame immediately when reduced motion is requested', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'previous line';
    elements.current.dataset.currentText = 'previous line';

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'pending line',
        nextText: '',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame' },
    );

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'current line',
        nextText: 'must not render',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );

    expect(elements.current.textContent).toBe('current line');
    expect(elements.next.textContent).toBe('');
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(gsap.set).toHaveBeenCalledWith(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
    expect(elements.current.animate).not.toHaveBeenCalled();
  });

  it('fades repeated lyric text when it belongs to a different indexed line', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'repeat',
        nextText: '',
        language: 'en',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    expect(elements.root.dataset.mangaSide).toBe('right');

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'repeat',
        nextText: '',
        language: 'en',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['exit']);
    expect(elements.root.dataset.mangaSide).toBe('right');

    timelines[0].additions[0]();

    expect(timelines[0].labels).toEqual(['exit', 'enter']);
    expect(elements.root.dataset.mangaSide).toBe('right');
  });

  it('queues same-line snapshots without replacing bubbles during sequential entrance', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 2,
        visible: true,
        currentText: '前句',
        nextText: '',
        language: 'ja',
        lineIndex: 0,
      },
      { gsap, templateId: 'manga-frame', reducedMotion: true },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: '新一 新二',
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );
    timelines[0].additions[0]();
    const enteringBubbles = [...elements.mangaBubbles.children];

    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: '新一 新二',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '新一 新二',
            state: 'active',
            progress: 0.5,
            remainingMs: 500,
          },
        ],
        nextText: '',
        language: 'ja',
        lineIndex: 1,
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.mangaBubbles.children).toEqual(enteringBubbles);
    expect(elements.root.dataset.revision).toBe('3');

    timelines[0].options.onComplete();

    expect(elements.root.dataset.revision).toBe('4');
    expect(elements.mangaBubbles.children).not.toEqual(enteringBubbles);
  });

  it('keeps the final Manga Frame utterance visible until its bubble fades out', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'final line';
    elements.current.dataset.currentText = 'final line';

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: false,
        currentText: '',
        nextText: '',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.root.hidden).toBe(false);
    expect(elements.current.textContent).toBe('final line');

    timelines[0].additions[0]();

    expect(elements.root.hidden).toBe(true);
    expect(elements.current.textContent).toBe('');
    expect(elements.next.textContent).toBe('');
    expect(elements.root.dataset.mangaSide).toBe('right');
  });

  it('kills an interrupted Manga Frame timeline and animation targets on cleanup', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'previous line';
    elements.current.dataset.currentText = 'previous line';

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'first pending line',
        nextText: '',
        language: 'ja',
      },
      { gsap, templateId: 'manga-frame' },
    );
    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: true,
        currentText: 'latest line',
        nextText: '',
        language: 'ja',
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(timelines[0].kill).toHaveBeenCalledOnce();
    destroyLyricsAnimations(elements, { gsap });
    expect(timelines[1].kill).toHaveBeenCalledOnce();
    expect(gsap.killTweensOf).toHaveBeenCalledWith(elements.root);
    expect(gsap.set).toHaveBeenCalledWith(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
  });

  it('clears text when no lyric line is active', () => {
    const elements = domElements();
    elements.current.textContent = 'stale';

    renderLyricsFrame(elements, {
      revision: 3,
      visible: false,
      currentText: '',
      nextText: '',
      language: '',
    });

    expect(elements.root.hidden).toBe(true);
    expect(elements.current.textContent).toBe('');
    expect(elements.next.textContent).toBe('');
  });

  it('renders timed segments as literal text nodes with bounded progress fill', () => {
    const elements = domElements();
    const malicious = '<img src=x onerror=alert(1)>';

    renderLyricsFrame(elements, {
      revision: 4,
      visible: true,
      currentText: `${malicious}安全`,
      nextText: '下一句',
      language: 'zh-Hant',
      currentSegments: [
        {
          segmentId: 'segment-1',
          text: malicious,
          state: 'past',
          progress: 1,
          remainingMs: null,
        },
        {
          segmentId: 'segment-2',
          text: '安全',
          state: 'active',
          progress: 0.25,
          remainingMs: 1500,
        },
      ],
    });

    expect(elements.current.children).toHaveLength(2);
    expect(elements.current.children[0].dataset.segmentState).toBe('past');
    expect(elements.current.children[0].dataset.text).toBe(malicious);
    expect(elements.current.children[0].textContent).toBe(malicious);
    const active = elements.current.children[1];
    expect(active.dataset.segmentState).toBe('active');
    expect(active.dataset.text).toBe('安全');
    expect(active.textContent).toBe('安全');
    expect(active.style.values['--ovl-segment-progress']).toBe('25%');
    expect(active.animate).toHaveBeenCalledWith(
      [
        { '--ovl-segment-progress': '25%' },
        { '--ovl-segment-progress': '100%' },
      ],
      expect.objectContaining({ duration: 1500, easing: 'linear' }),
    );
  });

  it('falls back from timed segments to an M0 text line without stale nodes', () => {
    const elements = domElements();
    renderLyricsFrame(
      elements,
      {
        revision: 4,
        visible: true,
        currentText: 'segmented line',
        nextText: 'next',
        language: 'en',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: 'segmented line',
            state: 'active',
            progress: 0.5,
            remainingMs: 500,
          },
        ],
      },
      { templateId: 'manga-frame' },
    );

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'plain M0 line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.current.children).toHaveLength(0);
    expect(elements.current.dataset).not.toHaveProperty('segmented');
    expect(elements.current.textContent).toBe('plain M0 line');
    expect(elements.next.textContent).toBe('');
  });

  it('maps Manga Frame T2 progress to a GSAP paint tween without changing text color', () => {
    const elements = domElements();
    const { gsap } = gsapHarness();

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: '縦書き',
        nextText: '',
        language: 'ja',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: '縦書き',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
      },
      { gsap, reducedMotion: true, templateId: 'manga-frame' },
    );

    const reducedMotionSegment =
      elements.mangaBubbles.children[0].children[1].children[0];
    expect(reducedMotionSegment.textContent).toBe('縦書き');
    expect(reducedMotionSegment.style.values['--ovl-segment-progress']).toBe(
      '40%',
    );
    expect(gsap.to).not.toHaveBeenCalled();

    renderLyricsFrame(
      elements,
      {
        revision: 6,
        visible: true,
        currentText: '縦書き',
        nextText: '',
        language: 'ja',
        currentSegments: [
          {
            segmentId: 'segment-2',
            text: '縦書き',
            state: 'active',
            progress: 0.4,
            remainingMs: 600,
          },
        ],
      },
      { gsap, templateId: 'manga-frame' },
    );

    const animatedSegment =
      elements.mangaBubbles.children[0].children[1].children[0];
    expect(gsap.to).toHaveBeenCalledWith(
      animatedSegment,
      expect.objectContaining({
        '--ovl-segment-progress': '100%',
        duration: 0.6,
        ease: 'none',
        overwrite: 'auto',
      }),
    );
  });

  it('keeps paused or reduced-motion segment progress static', () => {
    const elements = domElements();
    const activeFill = vi.fn();
    elements.current.ownerDocument.createElement.mockImplementation(() => {
      const node = element(elements.current.ownerDocument);
      node.animate = activeFill;
      return node;
    });

    renderLyricsFrame(
      elements,
      {
        revision: 5,
        visible: true,
        currentText: 'paused',
        nextText: '',
        language: 'en',
        currentSegments: [
          {
            segmentId: 'segment-1',
            text: 'paused',
            state: 'active',
            progress: 0.5,
            remainingMs: 1000,
          },
        ],
      },
      { reducedMotion: true },
    );

    expect(activeFill).not.toHaveBeenCalled();
    expect(
      elements.current.children[0].style.values['--ovl-segment-progress'],
    ).toBe('50%');
  });

  it('fully highlights an active segment when fractional progress is unavailable', () => {
    const elements = domElements();

    renderLyricsFrame(elements, {
      revision: 6,
      visible: true,
      currentText: 'open',
      nextText: '',
      language: 'en',
      currentSegments: [
        {
          segmentId: 'segment-open',
          text: 'open',
          state: 'active',
          progress: null,
          remainingMs: null,
        },
      ],
    });

    expect(
      elements.current.children[0].style.values['--ovl-segment-progress'],
    ).toBe('100%');
    expect(elements.current.children[0].animate).not.toHaveBeenCalled();
  });

  it('renders again at the next timed lyric boundary without a new snapshot', () => {
    let nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    const scheduled = [];
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => nowMs,
      onFrame: (frame) => frames.push(frame),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });
    const value = {
      version: 2,
      revision: 2,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'ja' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [
          { text: 'first', startMs: 0, endMs: 2000 },
          { text: 'second', startMs: 2000, endMs: 4000 },
        ],
      },
    };

    scheduler.update(value);
    expect(frames.at(-1).currentText).toBe('first');
    expect(scheduled.at(-1).delay).toBe(1000);

    nowMs += 1000;
    scheduled.at(-1).callback();
    expect(frames.at(-1).currentText).toBe('second');
    scheduler.stop();
  });

  it('renders again at the next segment boundary without a new snapshot', () => {
    let nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    const scheduled = [];
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => nowMs,
      onFrame: (frame) => frames.push(frame),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });
    const value = {
      version: 2,
      revision: 6,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [
          {
            text: 'first second',
            startMs: 0,
            endMs: 4000,
            segments: [
              {
                segmentId: 'segment-1',
                text: 'first ',
                startMs: 0,
                endMs: 2000,
              },
              {
                segmentId: 'segment-2',
                text: 'second',
                startMs: 2000,
                endMs: 4000,
              },
            ],
          },
        ],
      },
    };

    scheduler.update(value);
    expect(frames.at(-1).currentSegments[0].state).toBe('active');
    expect(scheduled.at(-1).delay).toBe(1000);

    nowMs += 1000;
    scheduled.at(-1).callback();
    expect(frames.at(-1).currentSegments[1].state).toBe('active');
    scheduler.stop();
  });

  it('applies confident music cues without flashing or moving the active lyric text', () => {
    const frame = {
      revision: 7,
      visible: true,
      currentText: 'chorus line',
      nextText: 'next line',
      language: 'en',
      musicStructure: {
        documentId: 'music-1',
        level: 'M2',
        activeSection: {
          sectionId: 'section-1',
          role: 'chorus',
          confidence: 0.8,
        },
        currentBeat: {
          beatIndex: 4,
          timeMs: 12000,
          elapsedMs: 0,
          positionInBar: 1,
          downbeat: true,
          confidence: 0.75,
        },
      },
    };

    const karaokeElements = domElements();
    renderLyricsFrame(karaokeElements, frame, {
      templateId: 'karaoke-stack',
    });

    expect(karaokeElements.root.dataset).toMatchObject({
      musicLevel: 'M2',
      musicSection: 'chorus',
      musicDownbeat: 'true',
    });
    expect(karaokeElements.current.animate).not.toHaveBeenCalled();

    const mangaElements = domElements();
    const { gsap, timelines } = gsapHarness();
    renderLyricsFrame(mangaElements, frame, {
      gsap,
      reducedMotion: true,
      templateId: 'manga-frame',
    });
    expect(mangaElements.root.dataset).toMatchObject({
      musicLevel: 'M2',
      musicSection: 'chorus',
      musicDownbeat: 'true',
    });
    expect(timelines).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();

    renderLyricsFrame(
      mangaElements,
      {
        ...frame,
        revision: 8,
        musicStructure: {
          ...frame.musicStructure,
          currentBeat: {
            ...frame.musicStructure.currentBeat,
            beatIndex: 8,
            timeMs: 13000,
          },
        },
      },
      { gsap, templateId: 'manga-frame' },
    );
    expect(timelines).toHaveLength(0);
    expect(gsap.to).not.toHaveBeenCalled();
  });

  it('keeps low-confidence, unknown, reduced-motion, and other templates static', () => {
    const frame = {
      revision: 8,
      visible: true,
      currentText: 'line',
      nextText: '',
      language: 'en',
      musicStructure: {
        documentId: 'music-1',
        level: 'M2',
        activeSection: {
          sectionId: 'section-unknown',
          role: 'unknown',
          confidence: 0.9,
        },
        currentBeat: {
          beatIndex: 0,
          timeMs: 1000,
          elapsedMs: 0,
          positionInBar: 1,
          downbeat: true,
          confidence: 0.49,
        },
      },
    };
    for (const options of [
      { templateId: 'manga-frame' },
      { templateId: 'karaoke-stack', reducedMotion: true },
      { templateId: 'manga-frame', reducedMotion: true },
      { templateId: 'focus-line' },
    ]) {
      const elements = domElements();
      renderLyricsFrame(elements, frame, options);
      expect(elements.root.dataset).not.toHaveProperty('musicSection');
      expect(elements.root.dataset).not.toHaveProperty('musicDownbeat');
      expect(elements.current.animate).not.toHaveBeenCalledWith(
        expect.arrayContaining([{ filter: 'brightness(1)' }]),
        expect.anything(),
      );
      expect(elements.root.animate).not.toHaveBeenCalledWith(
        expect.arrayContaining([{ filter: 'brightness(1)' }]),
        expect.anything(),
      );
    }
  });

  it('does not pulse a stale downbeat from an initial mid-beat snapshot', () => {
    const elements = domElements();
    renderLyricsFrame(
      elements,
      {
        revision: 10,
        visible: true,
        currentText: 'line',
        nextText: '',
        language: 'en',
        musicStructure: {
          documentId: 'music-1',
          level: 'M1',
          activeSection: null,
          currentBeat: {
            beatIndex: 0,
            timeMs: 1000,
            elapsedMs: 400,
            positionInBar: 1,
            downbeat: true,
            confidence: 0.9,
          },
        },
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.root.dataset.musicDownbeat).toBe('true');
    expect(elements.current.animate).not.toHaveBeenCalledWith(
      expect.arrayContaining([{ filter: 'brightness(1)' }]),
      expect.anything(),
    );
  });

  it('removes music attributes when presentation returns to M0', () => {
    const elements = domElements();
    elements.root.dataset.musicLevel = 'M2';
    elements.root.dataset.musicSection = 'chorus';
    elements.root.dataset.musicDownbeat = 'true';

    renderLyricsFrame(
      elements,
      {
        revision: 9,
        visible: true,
        currentText: 'unchanged line',
        nextText: '',
        language: 'en',
      },
      { templateId: 'manga-frame' },
    );

    expect(elements.root.dataset).not.toHaveProperty('musicLevel');
    expect(elements.root.dataset).not.toHaveProperty('musicSection');
    expect(elements.root.dataset).not.toHaveProperty('musicDownbeat');
    expect(elements.current.textContent).toBe('unchanged line');
  });

  it('cancels local boundary timers while the runtime is disconnected', () => {
    const scheduled = [];
    const cancelSchedule = vi.fn();
    const scheduler = createLyricsFrameScheduler({
      now: () => Date.parse('2026-08-22T00:00:00.000Z'),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule,
    });
    scheduler.update({
      version: 2,
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: 'first', startMs: 0, endMs: 2000 }],
      },
    });

    scheduler.suspend();
    expect(cancelSchedule).toHaveBeenCalledWith(1);
    scheduled[0].callback();
    expect(scheduled).toHaveLength(1);
  });

  it('can refresh the current frame after a template change', () => {
    const frames = [];
    const scheduler = createLyricsFrameScheduler({
      now: () => Date.parse('2026-08-22T00:00:00.000Z'),
      onFrame: (frame) => frames.push(frame),
      schedule: vi.fn(),
      cancelSchedule: vi.fn(),
    });
    scheduler.update({
      version: 2,
      revision: 1,
      generatedAt: '2026-08-22T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'paused',
        positionMs: 1000,
        durationMs: 10000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        trackId: 'track-1',
        source: { language: 'en' },
        synced: true,
        offsetMs: 0,
        activeLineIndex: 0,
        lines: [{ text: 'first', startMs: 0, endMs: 2000 }],
      },
    });

    scheduler.refresh();
    expect(frames).toHaveLength(2);
    scheduler.stop();
  });
});

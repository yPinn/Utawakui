import { describe, expect, it, vi } from 'vitest';
import {
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
  const value = {
    ownerDocument,
    children: [],
    hidden: false,
    dataset: {},
    attributes: {},
    animate: vi.fn(),
    style: {
      values: {},
      setProperty(name, nextValue) {
        this.values[name] = nextValue;
      },
    },
    append(...children) {
      this.children.push(...children);
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
      ownText = String(nextValue);
      this.children = [];
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
  };
  return {
    root: element(documentApi),
    current: element(documentApi),
    next: element(documentApi),
  };
}

describe('lyrics overlay renderer', () => {
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

  it('renders Manga Frame as one centered utterance and fades the whole bubble', () => {
    const elements = domElements();
    const { gsap, timelines } = gsapHarness();
    elements.current.textContent = 'previous line';
    elements.current.dataset.currentText = 'previous line';

    renderLyricsFrame(
      elements,
      {
        revision: 3,
        visible: true,
        currentText: 'current line',
        nextText: 'must not render',
        language: 'en',
      },
      { gsap, templateId: 'manga-frame' },
    );

    expect(elements.current.textContent).toBe('previous line');
    expect(elements.next.textContent).toBe('');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['exit', 'enter']);
    expect(timelines[0].tweens[0]).toMatchObject({
      target: elements.root,
      vars: {
        autoAlpha: 0,
        duration: 0.16,
        ease: 'power2.in',
        overwrite: 'auto',
      },
    });
    expect(elements.current.animate).not.toHaveBeenCalled();

    timelines[0].additions[0]();

    expect(elements.current.textContent).toBe('current line');
    expect(elements.next.textContent).toBe('');
    expect(gsap.set).toHaveBeenCalledWith(elements.root, { autoAlpha: 0 });
    expect(timelines[0].tweens[1]).toMatchObject({
      target: elements.root,
      vars: {
        autoAlpha: 1,
        duration: 0.18,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    });
    expect(elements.root.dataset).toMatchObject({
      mangaFrame: 'spoken',
      mangaLength: 'short',
    });
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
    expect(elements.current.children[0].textContent).toBe(malicious);
    const active = elements.current.children[1];
    expect(active.dataset.segmentState).toBe('active');
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

    expect(elements.current.children[0].textContent).toBe('縦書き');
    expect(
      elements.current.children[0].style.values['--ovl-segment-progress'],
    ).toBe('40%');
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

    expect(gsap.to).toHaveBeenCalledWith(
      elements.current.children[0],
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

  it('applies confident music cues to bounded segment-aware templates and pulses a new downbeat', () => {
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
    expect(karaokeElements.current.animate).toHaveBeenCalledWith(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.12)' },
        { filter: 'brightness(1)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );

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
    expect(timelines).toHaveLength(1);
    expect(timelines[0].labels).toEqual(['accent']);
    expect(timelines[0].tweens.map((entry) => entry.vars.scale)).toEqual([
      1.025, 1,
    ]);
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

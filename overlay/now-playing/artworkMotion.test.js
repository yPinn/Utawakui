import { describe, expect, it, vi } from 'vitest';
import { createArtworkMotionController } from './artworkMotion.mjs';

function gsapHarness() {
  const spinTween = {
    kill: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
  };
  const timelines = [];
  const gsap = {
    getProperty: vi.fn(() => 137),
    set: vi.fn(),
    to: vi.fn((target, options = {}) => {
      if (options.repeat === -1) return spinTween;
      const tween = {
        kill: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
      };
      return tween;
    }),
    timeline: vi.fn((options = {}) => {
      const timeline = {
        addLabel: vi.fn(function addLabel() {
          return this;
        }),
        call: vi.fn(function call(callback) {
          callback();
          return this;
        }),
        fromTo: vi.fn(function fromTo() {
          return this;
        }),
        kill: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        set: vi.fn(function set() {
          return this;
        }),
        to: vi.fn(function to() {
          return this;
        }),
        complete() {
          options.onComplete?.();
        },
      };
      timelines.push(timeline);
      return timeline;
    }),
  };
  return { gsap, spinTween, timelines };
}

function rect(left, top, width, height = width) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function scene() {
  const root = { dataset: {}, hidden: true };
  const stage = {
    clientWidth: 440,
    offsetWidth: 440,
    getBoundingClientRect: () => rect(0, 0, 440, 220),
  };
  const albumPanel = {
    offsetLeft: 0,
    offsetParent: stage,
    offsetWidth: 212,
    getBoundingClientRect: () => rect(0, 0, 212),
  };
  const turntable = {
    offsetLeft: 228,
    offsetParent: stage,
    offsetWidth: 212,
    getBoundingClientRect: () => rect(228, 0, 212),
  };
  return {
    root,
    stage,
    albumPanel,
    sleeve: {
      offsetWidth: 212,
      getBoundingClientRect: () => rect(0, 0, 212),
    },
    incomingSleeve: { hidden: true },
    turntable,
    bloom: {},
    record: {
      offsetHeight: 156,
      offsetWidth: 156,
      getBoundingClientRect: () => rect(246, 18, 156),
    },
    recordRotor: {},
    exchangeRecord: {},
    exchangeRecordRotor: {},
    tonearmAssembly: {},
  };
}

function frame(overrides = {}) {
  return {
    visible: true,
    trackId: 'track-1',
    title: 'Song one',
    artist: 'Singer',
    nextTitle: 'Song two',
    playbackStatus: 'playing',
    ...overrides,
  };
}

describe('Now Playing artwork motion', () => {
  it('keeps the live scene empty until a real track becomes visible', () => {
    const elements = scene();
    const commitFrame = vi.fn((value) => {
      elements.root.hidden = !value.visible;
    });
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({
      active: true,
      frame: frame({ visible: false, trackId: '', playbackStatus: 'idle' }),
    });

    expect(elements.root.hidden).toBe(true);
    expect(elements.root.dataset.motionState).toBe('hidden');
    expect(timelines).toHaveLength(0);

    motion.update({ active: true, frame: frame() });
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.dataset.motionState).toBe('entering');
  });

  it('opens from one centred sleeve into the equal sleeve and deck layout', () => {
    const elements = scene();
    const initialFrame = frame();
    const commitFrame = vi.fn((value) => {
      elements.root.hidden = !value.visible;
    });
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({ active: true, frame: initialFrame });

    expect(commitFrame).toHaveBeenCalledWith(initialFrame);
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.dataset.motionState).toBe('entering');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].addLabel).toHaveBeenCalledWith('split', 0.26);
    expect(timelines[0].fromTo).toHaveBeenCalledWith(
      elements.albumPanel,
      expect.objectContaining({ x: expect.any(Number) }),
      expect.objectContaining({ x: 0 }),
      'split',
    );
    expect(timelines[0].fromTo).toHaveBeenCalledWith(
      elements.turntable,
      expect.objectContaining({ autoAlpha: 0, x: expect.any(Number) }),
      expect.objectContaining({ autoAlpha: 1, x: 0 }),
      expect.stringContaining('split'),
    );
    expect(timelines[0].fromTo).toHaveBeenCalledWith(
      elements.bloom,
      { autoAlpha: 0 },
      {
        autoAlpha: 0.92,
        duration: 0.28,
        ease: 'power2.out',
      },
      'split+=0.2',
    );

    timelines[0].complete();
    expect(elements.root.dataset.motionState).toBe('presented');
  });

  it('keeps one vinyl tween and preserves its playhead through seeking', () => {
    const elements = scene();
    const { gsap, spinTween, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame: vi.fn(),
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'seeking' }),
    });
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'buffering' }),
    });
    motion.update({ active: true, frame: frame({ playbackStatus: 'paused' }) });
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'playing' }),
    });

    expect(gsap.to).toHaveBeenCalledWith(elements.recordRotor, {
      duration: 18,
      ease: 'none',
      paused: true,
      repeat: -1,
      rotation: '+=360',
    });
    expect(gsap.to).not.toHaveBeenCalledWith(
      elements.record,
      expect.objectContaining({ repeat: -1 }),
    );
    expect(gsap.to).toHaveBeenCalledWith(elements.bloom, {
      autoAlpha: 0.4,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    expect(gsap.to).toHaveBeenLastCalledWith(elements.bloom, {
      autoAlpha: 0.92,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    expect(spinTween.pause).toHaveBeenCalledOnce();
    expect(spinTween.play).toHaveBeenCalledTimes(2);
    expect(timelines).toHaveLength(1);
  });

  it('hands A to an incoming B sleeve before extracting the new disc', () => {
    const elements = scene();
    const commitFrame = vi.fn();
    const prepareFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
      prepareFrame,
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    const nextFrame = frame({ trackId: 'track-2', title: 'Song two' });
    motion.update({ active: true, frame: nextFrame });

    expect(elements.root.dataset.motionState).toBe('swapping');
    expect(prepareFrame).toHaveBeenCalledWith(nextFrame);
    expect(timelines).toHaveLength(2);
    expect(gsap.set).not.toHaveBeenCalledWith(elements.bloom, {
      autoAlpha: 0.92,
    });
    expect(timelines[1].addLabel).toHaveBeenCalledWith('arm-clear', 0);
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.tonearmAssembly,
      { duration: 0.16, ease: 'power2.out', rotation: -18 },
      'arm-clear',
    );
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.bloom,
      { autoAlpha: 0.18, duration: 0.14, ease: 'power2.out' },
      'arm-clear',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'record-in',
      'arm-clear+=0.16',
    );
    expect(timelines[1].call).toHaveBeenCalledWith(
      expect.any(Function),
      null,
      'record-in',
    );
    expect(timelines[1].set).toHaveBeenCalledWith(
      elements.exchangeRecord,
      expect.objectContaining({ autoAlpha: 1 }),
      'record-in',
    );
    expect(gsap.set).toHaveBeenCalledWith(elements.exchangeRecordRotor, {
      rotation: 137,
    });
    expect(gsap.set).toHaveBeenCalledWith(elements.recordRotor, {
      rotation: 274,
    });
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.exchangeRecord,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      'record-in',
    );
    expect(timelines[1].to).not.toHaveBeenCalledWith(
      elements.sleeve,
      expect.objectContaining({ autoAlpha: 0 }),
      expect.anything(),
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'record-sleeved',
      'record-in+=0.24',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'cover-handoff',
      'record-sleeved',
    );
    expect(timelines[1].set).toHaveBeenCalledWith(
      elements.incomingSleeve,
      { autoAlpha: 0, x: -17 },
      'cover-handoff',
    );
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.incomingSleeve,
      {
        autoAlpha: 1,
        duration: 0.06,
        ease: 'none',
      },
      'cover-handoff',
    );
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.incomingSleeve,
      {
        duration: 0.22,
        ease: 'power3.out',
        x: 0,
      },
      'cover-handoff',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'cover-takeover',
      'cover-handoff+=0.22',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'sleeve-out',
      'cover-takeover+=0.04',
    );
    expect(timelines[1].set).toHaveBeenCalledWith(
      elements.exchangeRecord,
      expect.objectContaining({ autoAlpha: 1 }),
      'sleeve-out',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'record-seated',
      'sleeve-out+=0.24',
    );
    expect(timelines[1].call).toHaveBeenCalledWith(
      expect.any(Function),
      null,
      'record-seated',
    );
    expect(timelines[1].set).toHaveBeenCalledWith(
      elements.record,
      { autoAlpha: 1 },
      'record-seated',
    );
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.tonearmAssembly,
      { duration: 0.18, ease: 'power2.out', rotation: 0 },
      'record-seated',
    );
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.bloom,
      { autoAlpha: 0.92, duration: 0.28, ease: 'power2.out' },
      'record-seated',
    );
    expect(commitFrame).toHaveBeenLastCalledWith(nextFrame);

    timelines[1].complete();
    expect(elements.root.dataset.motionState).toBe('presented');
    expect(elements.exchangeRecord.hidden).toBe(true);
    expect(elements.incomingSleeve.hidden).toBe(true);
    expect(gsap.set).toHaveBeenCalledWith(elements.exchangeRecord, {
      clearProps: 'height,opacity,transform,visibility,width',
    });
  });

  it('sizes the exchange disc from the untransformed record box while preserving its visual centre', () => {
    const elements = scene();
    elements.record.getBoundingClientRect = () => rect(214, -14, 220);
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame: vi.fn(),
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ trackId: 'track-2', title: 'Song two' }),
    });

    expect(timelines[1].set).toHaveBeenCalledWith(
      elements.exchangeRecord,
      expect.objectContaining({
        height: 156,
        width: 156,
        x: 246,
        y: 18,
      }),
      'record-in',
    );
  });

  it('interrupts an obsolete swap and commits only the latest requested track', () => {
    const elements = scene();
    const commitFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ trackId: 'track-2', title: 'Song two' }),
    });
    const latestFrame = frame({ trackId: 'track-3', title: 'Song three' });
    motion.update({ active: true, frame: latestFrame });

    expect(timelines[1].kill).toHaveBeenCalledOnce();
    expect(commitFrame).toHaveBeenLastCalledWith(latestFrame);
    expect(elements.root.dataset.motionState).toBe('swapping');
  });

  it('closes only for a terminal end and not while an automatic next track exists', () => {
    const elements = scene();
    const commitFrame = vi.fn((value) => {
      elements.root.hidden = !value.visible;
    });
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'ended', nextTitle: 'Song two' }),
    });
    expect(timelines).toHaveLength(1);

    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'ended', nextTitle: '' }),
    });
    expect(elements.root.dataset.motionState).toBe('exiting');
    expect(timelines).toHaveLength(2);
    expect(elements.root.hidden).toBe(false);
    expect(gsap.set).not.toHaveBeenCalledWith(elements.bloom, {
      autoAlpha: 0.4,
    });
    expect(timelines[1].to).toHaveBeenCalledWith(
      elements.bloom,
      { autoAlpha: 0, duration: 0.18, ease: 'power2.out' },
      'sleeve-in',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith(
      'sleeved',
      'sleeve-in+=0.26',
    );
    expect(timelines[1].call).toHaveBeenCalledWith(
      expect.any(Function),
      null,
      'sleeved',
    );
    expect(timelines[1].addLabel).toHaveBeenCalledWith('close', 'sleeved');

    timelines[1].complete();
    expect(elements.root.hidden).toBe(true);
    expect(elements.root.dataset.motionState).toBe('hidden');
    expect(gsap.set).toHaveBeenCalledWith(elements.exchangeRecord, {
      clearProps: 'height,opacity,transform,visibility,width',
    });
  });

  it('updates a closing request and reopens when a new track interrupts it', () => {
    const elements = scene();
    const commitFrame = vi.fn();
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'ended', nextTitle: '' }),
    });
    motion.update({
      active: true,
      frame: frame({ visible: false, trackId: '', playbackStatus: 'idle' }),
    });
    const reopeningFrame = frame({ trackId: 'track-2', title: 'Song two' });
    motion.update({ active: true, frame: reopeningFrame });

    expect(timelines[1].kill).toHaveBeenCalledOnce();
    expect(commitFrame).toHaveBeenLastCalledWith(reopeningFrame);
    expect(elements.root.dataset.motionState).toBe('entering');
    expect(gsap.set).toHaveBeenCalledWith(elements.exchangeRecord, {
      clearProps: 'height,opacity,transform,visibility,width',
    });
  });

  it('reopens after a completed terminal close when the same track plays again', () => {
    const elements = scene();
    const commitFrame = vi.fn((value) => {
      elements.root.hidden = !value.visible;
    });
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.update({ active: true, frame: frame() });
    timelines[0].complete();
    motion.update({
      active: true,
      frame: frame({ playbackStatus: 'ended', nextTitle: '' }),
    });
    timelines[1].complete();

    expect(elements.root.hidden).toBe(true);
    expect(elements.root.dataset.motionState).toBe('hidden');

    elements.albumPanel.getBoundingClientRect = () => rect(114, 0, 212);
    elements.turntable.getBoundingClientRect = () => rect(114, 0, 212);

    const replayFrame = frame({ nextTitle: '' });
    motion.update({ active: true, frame: replayFrame });

    expect(timelines).toHaveLength(3);
    expect(commitFrame).toHaveBeenLastCalledWith(replayFrame);
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.dataset.motionState).toBe('entering');
    expect(timelines[2].fromTo).toHaveBeenCalledWith(
      elements.albumPanel,
      expect.objectContaining({ x: 114 }),
      expect.objectContaining({ x: 0 }),
      'split',
    );
    expect(timelines[2].fromTo).toHaveBeenCalledWith(
      elements.turntable,
      expect.objectContaining({ x: -114 }),
      expect.objectContaining({ x: 0 }),
      'split+=0.04',
    );
  });

  it('clears owned scene transforms when the black-vinyl template deactivates', () => {
    const elements = scene();
    const { gsap, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame: vi.fn(),
    });

    motion.update({ active: true, frame: frame() });
    motion.update({ active: false, frame: frame() });

    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(elements.root.dataset.motionState).toBe('hidden');
    expect(gsap.set).toHaveBeenCalledWith(
      expect.arrayContaining([
        elements.root,
        elements.albumPanel,
        elements.turntable,
        elements.bloom,
        elements.exchangeRecord,
        elements.incomingSleeve,
      ]),
      { clearProps: 'all' },
    );
  });

  it('stays static for reduced motion and suspends inactive output work', () => {
    const elements = scene();
    const commitFrame = vi.fn();
    const { gsap, spinTween, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame,
    });

    motion.setReducedMotion(true);
    motion.update({ active: true, frame: frame() });
    expect(gsap.to).not.toHaveBeenCalled();
    expect(timelines).toHaveLength(0);
    expect(commitFrame).toHaveBeenCalledWith(frame());
    expect(elements.root.dataset.motionState).toBe('presented');
    expect(gsap.set).toHaveBeenCalledWith(elements.bloom, { autoAlpha: 0.92 });

    motion.setReducedMotion(false);
    expect(gsap.to).toHaveBeenCalledOnce();
    expect(spinTween.play).toHaveBeenCalledOnce();

    motion.suspend();
    expect(spinTween.pause).toHaveBeenCalledOnce();

    motion.update({ active: true, frame: frame() });
    expect(spinTween.play).toHaveBeenCalledTimes(2);
  });

  it('kills owned scene and spin motion on destroy', () => {
    const elements = scene();
    const { gsap, spinTween, timelines } = gsapHarness();
    const motion = createArtworkMotionController({
      gsap,
      ...elements,
      commitFrame: vi.fn(),
    });

    motion.update({ active: true, frame: frame() });
    motion.destroy();
    motion.update({ active: true, frame: frame({ trackId: 'track-2' }) });

    expect(spinTween.kill).toHaveBeenCalledOnce();
    expect(timelines[0].kill).toHaveBeenCalledOnce();
    expect(gsap.set).toHaveBeenCalledWith(
      expect.arrayContaining([
        elements.albumPanel,
        elements.turntable,
        elements.bloom,
        elements.record,
        elements.exchangeRecord,
        elements.incomingSleeve,
        elements.tonearmAssembly,
      ]),
      { clearProps: 'all' },
    );
    expect(spinTween.play).toHaveBeenCalledOnce();
  });

  it('degrades to a static record when GSAP is unavailable', () => {
    const elements = scene();
    const commitFrame = vi.fn();
    const motion = createArtworkMotionController({
      gsap: null,
      ...elements,
      commitFrame,
    });

    expect(() => {
      motion.update({ active: true, frame: frame() });
      motion.suspend();
      motion.destroy();
    }).not.toThrow();
    expect(commitFrame).toHaveBeenCalledWith(frame());
  });
});

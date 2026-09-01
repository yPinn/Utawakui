const VINYL_SPIN_DURATION_SECONDS = 18;
const TRANSIENT_PLAYBACK_STATUSES = new Set(['buffering', 'seeking']);
const EXCHANGE_RECORD_CLEAR_PROPS = 'height,opacity,transform,visibility,width';
const SLEEVE_HANDOFF_OFFSET_RATIO = 0.08;
const SLEEVE_HANDOFF_OFFSET_MIN_PX = 12;
const SLEEVE_HANDOFF_OFFSET_MAX_PX = 18;
const BLOOM_PLAYING_ALPHA = 0.92;
const BLOOM_PAUSED_ALPHA = 0.4;
const BLOOM_TRANSFER_ALPHA = 0.18;
const ROOT_PRESENTED_Y_PERCENT = -50;
const ROOT_SLIDE_OFFSET_PERCENT = -150;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function visibleTrack(frame) {
  return frame?.visible === true && Boolean(text(frame?.trackId));
}

function terminalFrame(frame) {
  return (
    !visibleTrack(frame) ||
    (frame?.playbackStatus === 'ended' && !text(frame?.nextTitle))
  );
}

function hiddenFrame(frame = {}) {
  return {
    ...frame,
    visible: false,
    trackId: '',
    title: '',
    artist: '',
    nextTitle: '',
  };
}

function transformedCentreOffset(containerRect, itemRect) {
  return (
    containerRect.left +
    containerRect.width / 2 -
    (itemRect.left + itemRect.width / 2)
  );
}

function layoutCentreOffset(container, item) {
  const containerWidth = Number(
    container?.clientWidth || container?.offsetWidth,
  );
  const itemWidth = Number(item?.offsetWidth);
  let itemLeft = 0;
  let current = item;
  let depth = 0;

  while (current && current !== container && depth < 20) {
    if (!Number.isFinite(Number(current.offsetLeft))) break;
    itemLeft += Number(current.offsetLeft);
    current = current.offsetParent;
    depth += 1;
  }

  if (
    current === container &&
    Number.isFinite(containerWidth) &&
    containerWidth > 0 &&
    Number.isFinite(itemWidth) &&
    itemWidth > 0
  ) {
    return containerWidth / 2 - (itemLeft + itemWidth / 2);
  }

  return transformedCentreOffset(
    container.getBoundingClientRect(),
    item.getBoundingClientRect(),
  );
}

function exchangeGeometry(stage, sleeve, record) {
  const stageRect = stage.getBoundingClientRect();
  const sleeveRect = sleeve.getBoundingClientRect();
  const recordRect = record.getBoundingClientRect();
  const width =
    Number.isFinite(record.offsetWidth) && record.offsetWidth > 0
      ? record.offsetWidth
      : recordRect.width;
  const height =
    Number.isFinite(record.offsetHeight) && record.offsetHeight > 0
      ? record.offsetHeight
      : recordRect.height;
  const recordCentreX = recordRect.left + recordRect.width / 2 - stageRect.left;
  const recordCentreY = recordRect.top + recordRect.height / 2 - stageRect.top;
  return {
    from: {
      height,
      width,
      x: recordCentreX - width / 2,
      y: recordCentreY - height / 2,
    },
    sleeved: {
      x: sleeveRect.left - stageRect.left + (sleeveRect.width - width) / 2,
      y: sleeveRect.top - stageRect.top + (sleeveRect.height - height) / 2,
    },
  };
}

function incomingSleeveOffset(sleeve) {
  const layoutWidth = Number(sleeve?.offsetWidth);
  const visualWidth = Number(sleeve?.getBoundingClientRect?.().width);
  const width = layoutWidth > 0 ? layoutWidth : visualWidth;
  const magnitude = Math.round(
    Math.min(
      SLEEVE_HANDOFF_OFFSET_MAX_PX,
      Math.max(
        SLEEVE_HANDOFF_OFFSET_MIN_PX,
        (Number.isFinite(width) ? width : 200) * SLEEVE_HANDOFF_OFFSET_RATIO,
      ),
    ),
  );
  return -magnitude;
}

export function createArtworkMotionController({
  gsap,
  root,
  stage,
  albumPanel,
  sleeve,
  turntable,
  bloom,
  record,
  recordRotor,
  exchangeRecord,
  exchangeRecordRotor,
  incomingSleeve,
  tonearmAssembly,
  commitFrame = () => undefined,
  prepareFrame = () => undefined,
  clearPreparedFrame = () => undefined,
} = {}) {
  let active = false;
  let bloomTarget = null;
  let bloomTween = null;
  let currentFrame = null;
  let currentTrackId = '';
  let destroyed = false;
  let lastStablePlaybackStatus = 'paused';
  let motionState = 'hidden';
  let pendingFrame = null;
  let presented = false;
  let reducedMotion = false;
  let running = false;
  let sceneTimeline = null;
  let spinTween = null;
  let suspended = false;
  let swapCommitted = false;

  const sceneElements = [
    root,
    albumPanel,
    sleeve,
    turntable,
    bloom,
    record,
    recordRotor,
    exchangeRecord,
    exchangeRecordRotor,
    incomingSleeve,
    tonearmAssembly,
  ].filter(Boolean);

  function setMotionState(value) {
    motionState = value;
    if (root?.dataset) root.dataset.motionState = value;
  }

  function canAnimate() {
    return (
      !reducedMotion &&
      typeof gsap?.set === 'function' &&
      typeof gsap?.timeline === 'function' &&
      root &&
      stage &&
      albumPanel &&
      sleeve &&
      turntable &&
      bloom &&
      record &&
      recordRotor &&
      exchangeRecord &&
      exchangeRecordRotor &&
      incomingSleeve &&
      tonearmAssembly
    );
  }

  function ensureSpinTween() {
    if (
      spinTween ||
      destroyed ||
      !recordRotor ||
      typeof gsap?.to !== 'function'
    ) {
      return spinTween;
    }

    spinTween = gsap.to(recordRotor, {
      duration: VINYL_SPIN_DURATION_SECONDS,
      ease: 'none',
      paused: true,
      repeat: -1,
      rotation: '+=360',
    });
    return spinTween;
  }

  function syncSpin() {
    const shouldRun =
      !destroyed &&
      !reducedMotion &&
      !suspended &&
      active &&
      presented &&
      lastStablePlaybackStatus === 'playing';

    if (shouldRun) {
      const tween = ensureSpinTween();
      if (!tween || running) return;
      tween.play?.();
      running = true;
      return;
    }

    if (!spinTween || !running) return;
    spinTween.pause?.();
    running = false;
  }

  function observePlaybackStatus(status) {
    if (TRANSIENT_PLAYBACK_STATUSES.has(status)) return;
    lastStablePlaybackStatus = status === 'playing' ? 'playing' : 'paused';
  }

  function stableBloomAlpha() {
    return lastStablePlaybackStatus === 'playing'
      ? BLOOM_PLAYING_ALPHA
      : BLOOM_PAUSED_ALPHA;
  }

  function killBloomTween() {
    bloomTween?.kill?.();
    bloomTween = null;
  }

  function setBloomStatic(alpha) {
    killBloomTween();
    bloomTarget = alpha;
    gsap?.set?.(bloom, { autoAlpha: alpha });
  }

  function syncBloom() {
    if (
      destroyed ||
      suspended ||
      !active ||
      !presented ||
      motionState !== 'presented' ||
      !bloom
    )
      return;

    const alpha = stableBloomAlpha();
    if (bloomTarget === alpha) return;
    killBloomTween();
    bloomTarget = alpha;

    if (reducedMotion || typeof gsap?.to !== 'function') {
      gsap?.set?.(bloom, { autoAlpha: alpha });
      return;
    }

    bloomTween = gsap.to(bloom, {
      autoAlpha: alpha,
      duration: 0.18,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  function killSceneTimeline() {
    sceneTimeline?.kill?.();
    sceneTimeline = null;
    killBloomTween();
  }

  function resetExchangeRecord() {
    if (!exchangeRecord) return;
    exchangeRecord.hidden = true;
    gsap?.set?.(exchangeRecord, {
      clearProps: EXCHANGE_RECORD_CLEAR_PROPS,
    });
    gsap?.set?.(exchangeRecordRotor, { clearProps: 'transform' });
  }

  function rotationOf(element) {
    const rotation = Number(gsap?.getProperty?.(element, 'rotation'));
    return Number.isFinite(rotation) ? rotation : 0;
  }

  function syncExchangeRotor() {
    if (!recordRotor || !exchangeRecordRotor) return;
    gsap?.set?.(exchangeRecordRotor, { rotation: rotationOf(recordRotor) });
  }

  function showExchangeRecord() {
    if (!exchangeRecord) return;
    syncExchangeRotor();
    exchangeRecord.hidden = false;
  }

  function seatExchangeRecord() {
    const seatedRotation =
      rotationOf(exchangeRecordRotor) + rotationOf(exchangeRecord);
    spinTween?.kill?.();
    spinTween = null;
    running = false;
    gsap?.set?.(recordRotor, { rotation: seatedRotation });
    resetExchangeRecord();
    syncSpin();
  }

  function resetIncomingSleeve() {
    if (!incomingSleeve) return;
    incomingSleeve.hidden = true;
    gsap?.set?.(incomingSleeve, {
      clearProps: 'opacity,transform,visibility',
    });
    clearPreparedFrame();
  }

  function showIncomingSleeve() {
    if (incomingSleeve) incomingSleeve.hidden = false;
  }

  function settlePresentedVisuals({ preserveBloom = false } = {}) {
    if (typeof gsap?.set !== 'function') return;
    resetExchangeRecord();
    resetIncomingSleeve();
    gsap.set(root, {
      autoAlpha: 1,
      yPercent: ROOT_PRESENTED_Y_PERCENT,
    });
    gsap.set([albumPanel, sleeve, turntable], {
      autoAlpha: 1,
      scale: 1,
      x: 0,
      y: 0,
    });
    gsap.set(record, { autoAlpha: 1 });
    if (preserveBloom) killBloomTween();
    else setBloomStatic(stableBloomAlpha());
    gsap.set(tonearmAssembly, { rotation: 0 });
  }

  function settleStatic(frame) {
    killSceneTimeline();
    pendingFrame = frame;
    currentFrame = frame;
    currentTrackId = visibleTrack(frame) ? text(frame.trackId) : '';
    swapCommitted = false;

    if (!active || terminalFrame(frame)) {
      commitFrame(hiddenFrame(frame));
      presented = false;
      setMotionState('hidden');
      resetExchangeRecord();
      resetIncomingSleeve();
      setBloomStatic(0);
      syncSpin();
      return;
    }

    commitFrame(frame);
    presented = true;
    setMotionState('presented');
    settlePresentedVisuals();
    syncSpin();
  }

  function startIntro(frame) {
    killSceneTimeline();
    pendingFrame = frame;
    currentFrame = frame;
    currentTrackId = text(frame.trackId);
    commitFrame(frame);
    presented = true;
    swapCommitted = false;
    setMotionState('entering');
    resetExchangeRecord();
    resetIncomingSleeve();
    gsap.set([sleeve, record], { autoAlpha: 1, x: 0, y: 0 });

    const albumOffset = layoutCentreOffset(stage, albumPanel);
    const turntableOffset = layoutCentreOffset(stage, turntable);

    sceneTimeline = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        sceneTimeline = null;
        setMotionState('presented');
        syncBloom();
      },
    });
    const bloomAlpha = stableBloomAlpha();
    bloomTarget = bloomAlpha;
    sceneTimeline
      .set(tonearmAssembly, { rotation: 0 })
      .addLabel('cover', 0)
      .set(root, { autoAlpha: 1, yPercent: ROOT_SLIDE_OFFSET_PERCENT }, 'cover')
      .to(
        root,
        {
          duration: 0.42,
          ease: 'power3.out',
          yPercent: ROOT_PRESENTED_Y_PERCENT,
        },
        'cover',
      )
      .addLabel('split', 0.26)
      .fromTo(
        albumPanel,
        { scale: 0.985, x: albumOffset },
        { duration: 0.48, ease: 'power3.inOut', scale: 1, x: 0 },
        'split',
      )
      .fromTo(
        turntable,
        { autoAlpha: 0, x: turntableOffset },
        { autoAlpha: 1, duration: 0.44, x: 0 },
        'split+=0.04',
      )
      .fromTo(
        bloom,
        { autoAlpha: 0 },
        {
          autoAlpha: bloomAlpha,
          duration: 0.28,
          ease: 'power2.out',
        },
        'split+=0.2',
      );
    syncSpin();
  }

  function startSwap(frame) {
    killSceneTimeline();
    settlePresentedVisuals({ preserveBloom: true });
    prepareFrame(frame);
    pendingFrame = frame;
    currentFrame = frame;
    currentTrackId = text(frame.trackId);
    swapCommitted = false;
    setMotionState('swapping');

    const geometry = exchangeGeometry(stage, sleeve, record);
    const handoffOffset = incomingSleeveOffset(sleeve);
    sceneTimeline = gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      onComplete: () => {
        sceneTimeline = null;
        resetExchangeRecord();
        resetIncomingSleeve();
        gsap.set(record, { autoAlpha: 1 });
        gsap.set(tonearmAssembly, { rotation: 0 });
        setMotionState('presented');
        syncBloom();
      },
    });
    bloomTarget = stableBloomAlpha();
    sceneTimeline
      .addLabel('arm-clear', 0)
      .to(
        tonearmAssembly,
        { duration: 0.16, ease: 'power2.out', rotation: -18 },
        'arm-clear',
      )
      .to(
        bloom,
        {
          autoAlpha: BLOOM_TRANSFER_ALPHA,
          duration: 0.14,
          ease: 'power2.out',
        },
        'arm-clear',
      )
      .addLabel('record-in', 'arm-clear+=0.16')
      .call(showExchangeRecord, null, 'record-in')
      .set(
        exchangeRecord,
        {
          autoAlpha: 1,
          height: geometry.from.height,
          rotation: 0,
          width: geometry.from.width,
          x: geometry.from.x,
          y: geometry.from.y,
        },
        'record-in',
      )
      .set(record, { autoAlpha: 0 }, 'record-in')
      .to(
        exchangeRecord,
        {
          duration: 0.24,
          rotation: '+=28',
          x: geometry.sleeved.x,
          y: geometry.sleeved.y,
        },
        'record-in',
      )
      .addLabel('record-sleeved', 'record-in+=0.24')
      .call(resetExchangeRecord, null, 'record-sleeved')
      .addLabel('cover-handoff', 'record-sleeved')
      .call(showIncomingSleeve, null, 'cover-handoff')
      .set(incomingSleeve, { autoAlpha: 0, x: handoffOffset }, 'cover-handoff')
      .to(
        incomingSleeve,
        {
          autoAlpha: 1,
          duration: 0.06,
          ease: 'none',
        },
        'cover-handoff',
      )
      .to(
        incomingSleeve,
        {
          duration: 0.22,
          ease: 'power3.out',
          x: 0,
        },
        'cover-handoff',
      )
      .addLabel('cover-takeover', 'cover-handoff+=0.22')
      .call(
        () => {
          swapCommitted = true;
          commitFrame(pendingFrame);
        },
        null,
        'cover-takeover',
      )
      .addLabel('sleeve-out', 'cover-takeover+=0.04')
      .call(resetIncomingSleeve, null, 'sleeve-out')
      .call(showExchangeRecord, null, 'sleeve-out')
      .set(
        exchangeRecord,
        {
          autoAlpha: 1,
          height: geometry.from.height,
          rotation: 28,
          width: geometry.from.width,
          x: geometry.sleeved.x,
          y: geometry.sleeved.y,
        },
        'sleeve-out',
      )
      .to(
        exchangeRecord,
        {
          duration: 0.24,
          rotation: '+=28',
          x: geometry.from.x,
          y: geometry.from.y,
        },
        'sleeve-out',
      )
      .addLabel('record-seated', 'sleeve-out+=0.24')
      .call(seatExchangeRecord, null, 'record-seated')
      .set(record, { autoAlpha: 1 }, 'record-seated')
      .to(
        tonearmAssembly,
        { duration: 0.18, ease: 'power2.out', rotation: 0 },
        'record-seated',
      )
      .to(
        bloom,
        {
          autoAlpha: bloomTarget,
          duration: 0.28,
          ease: 'power2.out',
        },
        'record-seated',
      );
    syncSpin();
  }

  function startExit(frame) {
    killSceneTimeline();
    settlePresentedVisuals({ preserveBloom: true });
    pendingFrame = frame;
    currentFrame = frame;
    if (visibleTrack(frame)) commitFrame(frame);
    setMotionState('exiting');

    const albumOffset = layoutCentreOffset(stage, albumPanel);
    const turntableOffset = layoutCentreOffset(stage, turntable);
    const geometry = exchangeGeometry(stage, sleeve, record);
    showExchangeRecord();
    bloomTarget = 0;

    sceneTimeline = gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      onComplete: () => {
        sceneTimeline = null;
        resetExchangeRecord();
        resetIncomingSleeve();
        presented = false;
        currentTrackId = '';
        commitFrame(hiddenFrame(pendingFrame));
        setMotionState('hidden');
      },
    });
    sceneTimeline
      .set(exchangeRecord, {
        autoAlpha: 1,
        height: geometry.from.height,
        rotation: 0,
        width: geometry.from.width,
        x: geometry.from.x,
        y: geometry.from.y,
      })
      .set(record, { autoAlpha: 0 })
      .addLabel('sleeve-in', 0)
      .to(
        tonearmAssembly,
        { duration: 0.24, ease: 'power2.out', rotation: -22 },
        'sleeve-in',
      )
      .to(
        bloom,
        { autoAlpha: 0, duration: 0.18, ease: 'power2.out' },
        'sleeve-in',
      )
      .to(
        exchangeRecord,
        {
          duration: 0.26,
          rotation: '+=24',
          x: geometry.sleeved.x,
          y: geometry.sleeved.y,
        },
        'sleeve-in',
      )
      .addLabel('sleeved', 'sleeve-in+=0.26')
      .call(resetExchangeRecord, null, 'sleeved')
      .addLabel('close', 'sleeved')
      .to(
        albumPanel,
        { duration: 0.38, ease: 'power3.inOut', x: albumOffset },
        'close',
      )
      .to(
        turntable,
        {
          autoAlpha: 0,
          duration: 0.34,
          ease: 'power3.inOut',
          x: turntableOffset,
        },
        'close',
      )
      .to(
        root,
        {
          duration: 0.38,
          ease: 'power3.in',
          yPercent: ROOT_SLIDE_OFFSET_PERCENT,
        },
        'close+=0.3',
      );
    syncSpin();
  }

  function update({ active: nextActive, frame } = {}) {
    if (destroyed || !frame) return;
    active = nextActive === true;
    const wasSuspended = suspended;
    suspended = false;
    observePlaybackStatus(frame.playbackStatus);

    if (!active) {
      killSceneTimeline();
      currentFrame = frame;
      currentTrackId = '';
      pendingFrame = frame;
      presented = false;
      resetExchangeRecord();
      resetIncomingSleeve();
      gsap?.set?.(
        [
          root,
          albumPanel,
          sleeve,
          turntable,
          bloom,
          exchangeRecord,
          incomingSleeve,
          tonearmAssembly,
        ],
        { clearProps: 'all' },
      );
      setMotionState('hidden');
      bloomTarget = 0;
      syncSpin();
      return;
    }

    if (!canAnimate()) {
      settleStatic(frame);
      return;
    }

    if (wasSuspended) sceneTimeline?.play?.();
    if (wasSuspended) bloomTween?.play?.();

    if (terminalFrame(frame)) {
      if (!presented) {
        settleStatic(frame);
      } else if (motionState !== 'exiting') {
        startExit(frame);
      } else {
        pendingFrame = frame;
      }
      syncSpin();
      return;
    }

    if (motionState === 'exiting') {
      presented = false;
      startIntro(frame);
      return;
    }

    if (!presented) {
      startIntro(frame);
      return;
    }

    if (text(frame.trackId) !== currentTrackId) {
      startSwap(frame);
      return;
    }

    currentFrame = frame;
    pendingFrame = frame;
    if (motionState !== 'swapping' || swapCommitted) commitFrame(frame);
    syncSpin();
    syncBloom();
  }

  function setReducedMotion(value) {
    if (destroyed) return;
    reducedMotion = value === true;
    if (reducedMotion && currentFrame) settleStatic(currentFrame);
    else {
      syncSpin();
      syncBloom();
    }
  }

  function suspend() {
    if (destroyed) return;
    suspended = true;
    sceneTimeline?.pause?.();
    bloomTween?.pause?.();
    syncSpin();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    running = false;
    killSceneTimeline();
    spinTween?.kill?.();
    spinTween = null;
    resetExchangeRecord();
    resetIncomingSleeve();
    if (sceneElements.length > 0)
      gsap?.set?.(sceneElements, { clearProps: 'all' });
  }

  return { destroy, setReducedMotion, suspend, update };
}

export function createFisheyeEffects({ canvas, lens, gsap }) {
  const ctx = canvas?.getContext('2d');
  if (!ctx || typeof gsap?.timeline !== 'function')
    return { play() {}, stop() {} };

  const { width, height } = canvas;
  let timeline;
  let noiseFrames;

  function stop() {
    timeline?.kill();
    timeline = undefined;
    canvas.hidden = true;
    ctx.clearRect(0, 0, width, height);
    lens.style.removeProperty('scale');
  }

  function band(x, y, w, h, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function paintGlitch(progress, strength) {
    const phase = Math.floor(progress * 9);
    for (let i = 0; i < 8; i++) {
      const y = (i * 137 + phase * 43) % height;
      const h = 2 + ((i * 17 + phase * 5) % 26);
      const shift = (((i * 71 + phase * 13) % 67) - 34) * strength;
      band(0, y, width, h, i % 2 ? '#fa449a' : '#49f2ef', 0.2 * strength);
      band(0, y + h, width, 1, '#d2f7ff', 0.55 * strength);
      if (!lens.hidden) {
        const ratio = lens.height / height;
        const slice = Math.min(h, height - y);
        ctx.globalAlpha = 0.73 * strength;
        ctx.drawImage(
          lens,
          0,
          y * ratio,
          lens.width,
          slice * ratio,
          shift,
          y,
          width,
          slice,
        );
      }
    }
  }

  function makeNoiseFrames() {
    let seed = 6187;
    return Array.from({ length: 5 }, () => {
      const frame = canvas.ownerDocument.createElement('canvas');
      frame.width = 240;
      frame.height = 135;
      const layer = frame.getContext('2d');
      const pixels = layer.createImageData(frame.width, frame.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const shade = seed >>> 24 > 120 ? 240 : 18;
        pixels.data[i] = shade;
        pixels.data[i + 1] = shade > 18 ? 249 : 25;
        pixels.data[i + 2] = 35 + ((seed >>> 16) & 180);
        pixels.data[i + 3] = 25 + ((seed >>> 8) & 135);
      }
      layer.putImageData(pixels, 0, 0);
      return frame;
    });
  }

  function paintGrain(progress, strength) {
    noiseFrames ??= makeNoiseFrames();
    ctx.globalAlpha = 0.43 * strength;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      noiseFrames[Math.floor(progress * 16) % noiseFrames.length],
      0,
      0,
      width,
      height,
    );
    for (let y = 0; y < height; y += 5)
      band(0, y, width, 1, '#101427', 0.18 * strength);
  }

  function paintZoom(strength) {
    lens.style.scale = String(1 + 0.16 * strength);
    const edge = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.22,
      width / 2,
      height / 2,
      width * 0.58,
    );
    edge.addColorStop(0, '#66dcff00');
    edge.addColorStop(0.67, '#57a5e21a');
    edge.addColorStop(1, '#2d1438b0');
    band(0, 0, width, height, edge, strength);
  }

  function play({ effect, durationMs, startedAt }) {
    stop();
    const elapsed = Math.max(0, Date.now() - startedAt);
    if (elapsed >= durationMs) return;
    const pose = { progress: 0, strength: 0 };
    const duration = durationMs / 1000;
    canvas.hidden = false;
    timeline = gsap.timeline({
      paused: true,
      onComplete: stop,
      onUpdate() {
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        if (effect === 'glitch') paintGlitch(pose.progress, pose.strength);
        else if (effect === 'grain') paintGrain(pose.progress, pose.strength);
        else paintZoom(pose.strength);
      },
    });
    timeline.to(pose, { progress: 1, duration, ease: 'none' }, 0);
    timeline.to(
      pose,
      { strength: 1, duration: duration * 0.3, ease: 'power2.out' },
      0,
    );
    timeline.to(
      pose,
      { strength: 0, duration: duration * 0.7, ease: 'sine.inOut' },
      duration * 0.3,
    );
    timeline.play(elapsed / 1000);
  }

  return { play, stop };
}

// Lock-screen controls: iOS shows them only while the page plays audio.

// 1s silent WAV.
export function createSilentWavUrl(seconds = 1, sampleRate = 8000) {
  const samples = seconds * sampleRate;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset, value) =>
    [...value].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'];

// Lock-screen art is always this square size; no art beats non-square art.
const ARTWORK_EDGE = 160;

// Square crop, matching the in-app cover fit.
export async function createSquareArtwork(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const crop = Math.min(width, height);
  if (!crop) return null;
  const canvas = document.createElement('canvas');
  canvas.width = ARTWORK_EDGE;
  canvas.height = ARTWORK_EDGE;
  canvas
    .getContext('2d')
    .drawImage(
      image,
      (width - crop) / 2,
      (height - crop) / 2,
      crop,
      crop,
      0,
      0,
      ARTWORK_EDGE,
      ARTWORK_EDGE,
    );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  return blob ? { url: URL.createObjectURL(blob), edge: ARTWORK_EDGE } : null;
}

export function createNowPlaying({
  mediaSession = globalThis.navigator?.mediaSession,
  MediaMetadataImpl = globalThis.MediaMetadata,
  createAudio = () => new Audio(),
  createUrl = createSilentWavUrl,
  createArtwork = createSquareArtwork,
  revokeUrl = (url) => URL.revokeObjectURL(url),
  onCommand,
}) {
  const supported = Boolean(mediaSession && MediaMetadataImpl);
  let audio = null;
  let url = null;
  let playing = false;
  let metadataKey = '';
  let artwork = null;

  function releaseArtwork() {
    if (artwork) revokeUrl(artwork.url);
    artwork = null;
  }

  function setMetadata(title, artist) {
    mediaSession.metadata = new MediaMetadataImpl({
      title,
      artist,
      artwork: artwork
        ? [
            {
              src: artwork.url,
              sizes: `${artwork.edge}x${artwork.edge}`,
              type: 'image/jpeg',
            },
          ]
        : [],
    });
  }

  async function applyMetadata(key, title, artist, artworkUrl) {
    let next = null;
    if (artworkUrl) {
      try {
        next = await createArtwork(artworkUrl);
      } catch {
        next = null;
      }
    }
    // A newer track or turning off wins over this crop.
    if (key !== metadataKey || !audio) {
      if (next) revokeUrl(next.url);
      return;
    }
    releaseArtwork();
    artwork = next;
    setMetadata(title, artist);
  }

  function setHandlers(enabled) {
    const handlers = {
      play: () => !playing && onCommand('player.play-pause'),
      pause: () => playing && onCommand('player.play-pause'),
      previoustrack: () => onCommand('player.previous'),
      nexttrack: () => onCommand('player.next'),
      seekto: ({ seekTime }) =>
        Number.isFinite(seekTime) &&
        onCommand('player.seek', { positionMs: Math.round(seekTime * 1000) }),
    };
    for (const action of ACTIONS) {
      try {
        mediaSession.setActionHandler(
          action,
          enabled ? handlers[action] : null,
        );
      } catch {
        // Unsupported action on this browser.
      }
    }
  }

  // Must run inside the tap: play() is called before any await.
  async function enable() {
    if (!supported || audio) return Boolean(audio);
    audio = createAudio();
    url = createUrl();
    audio.loop = true;
    audio.setAttribute?.('playsinline', '');
    audio.src = url;
    const current = audio;
    try {
      await current.play();
    } catch {
      if (audio === current) disable();
      return false;
    }
    // Turned off while play() was pending.
    if (audio !== current) return false;
    setHandlers(true);
    return true;
  }

  function disable() {
    if (!audio) return;
    setHandlers(false);
    audio.pause();
    audio.removeAttribute?.('src');
    audio = null;
    if (url) revokeUrl(url);
    url = null;
    metadataKey = '';
    releaseArtwork();
    mediaSession.metadata = null;
    mediaSession.playbackState = 'none';
  }

  function update({
    title = '',
    artist = '',
    artworkUrl = '',
    playing: nextPlaying = false,
    durationSec = 0,
    positionSec = 0,
  } = {}) {
    if (!audio) return;
    playing = nextPlaying;
    const key = `${title}\n${artist}\n${artworkUrl}`;
    if (key !== metadataKey) {
      metadataKey = key;
      void applyMetadata(key, title, artist, artworkUrl);
    }
    mediaSession.playbackState = playing ? 'playing' : 'paused';
    // iOS draws the play/pause button from the element itself.
    if (playing && audio.paused) audio.play().catch(() => {});
    else if (!playing && !audio.paused) audio.pause();
    if (durationSec > 0 && positionSec >= 0 && positionSec <= durationSec) {
      try {
        mediaSession.setPositionState?.({
          duration: durationSec,
          position: positionSec,
          playbackRate: 1,
        });
      } catch {
        // Older Safari rejects position state.
      }
    }
  }

  return {
    supported,
    enable,
    disable,
    update,
    get enabled() {
      return Boolean(audio);
    },
  };
}

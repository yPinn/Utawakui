function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function revision(snapshot) {
  return Number.isSafeInteger(snapshot?.revision) ? snapshot.revision : 0;
}

function hiddenLyricsFrame(snapshot) {
  return {
    revision: revision(snapshot),
    visible: false,
    currentText: '',
    nextText: '',
    language: '',
  };
}

export function selectLyricsFrame(snapshot) {
  const trackId = snapshot?.playback?.track?.id;
  const lyrics = snapshot?.lyrics;
  const lines = Array.isArray(lyrics?.lines) ? lyrics.lines : [];
  const activeIndex = lyrics?.activeLineIndex;
  if (
    !trackId ||
    lyrics?.trackId !== trackId ||
    !Number.isSafeInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= lines.length
  ) {
    return hiddenLyricsFrame(snapshot);
  }

  const currentText = text(lines[activeIndex]?.text);
  let nextText = '';
  for (let index = activeIndex + 1; index < lines.length; index += 1) {
    nextText = text(lines[index]?.text);
    if (nextText) break;
  }

  return {
    revision: revision(snapshot),
    visible: Boolean(currentText || nextText),
    currentText,
    nextText,
    language: text(lyrics?.source?.language),
  };
}

export function selectNowPlayingFrame(snapshot) {
  const track = snapshot?.playback?.track;
  const nextItem = (
    Array.isArray(snapshot?.queue?.items) ? snapshot.queue.items : []
  ).find((item) => item?.state === 'queued');
  const title = text(track?.title);
  return {
    revision: revision(snapshot),
    visible: Boolean(track && title),
    title,
    artist: text(track?.artist),
    nextTitle: text(nextItem?.track?.title),
  };
}

export function selectSetlistFrame(snapshot) {
  const items = Array.isArray(snapshot?.queue?.items)
    ? snapshot.queue.items
    : [];
  const currentIndex = items.findIndex((item) => item?.state === 'current');
  const start = Math.max(0, currentIndex > 1 ? currentIndex - 1 : 0);
  const rows = items.slice(start, start + 8).flatMap((item) => {
    const title = text(item?.track?.title);
    if (!title || !['played', 'current', 'queued'].includes(item?.state)) {
      return [];
    }
    return [
      {
        state: item.state,
        title,
        artist: text(item?.track?.artist),
      },
    ];
  });

  return {
    revision: revision(snapshot),
    visible: rows.length > 0,
    sourceName: text(snapshot?.queue?.sourceName),
    rows,
  };
}

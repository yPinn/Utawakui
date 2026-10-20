import {
  parsePerformerLyricsOffsetIntent,
  parsePerformerControlIntent,
} from '../../shared/performerViewContract.mjs';

function contextsMatch(intent, published, current) {
  return Boolean(
    published &&
    current &&
    intent.trackId === published.playerTrackId &&
    published.playerTrackId === published.lyricsTrackId &&
    published.playerTrackId === current.playerTrackId &&
    published.lyricsTrackId === current.lyricsTrackId &&
    published.sourceFilename &&
    published.sourceFilename === current.sourceFilename,
  );
}

export function applyPerformerLyricsOffsetIntent(value, dependencies) {
  let intent;
  try {
    intent = parsePerformerLyricsOffsetIntent(value);
  } catch {
    return false;
  }

  const published = dependencies.getPublishedContext(intent.revision);
  const current = dependencies.getCurrentContext();
  if (!contextsMatch(intent, published, current)) return false;

  if (intent.action === 'delay') dependencies.adjustOffset(-0.1);
  else if (intent.action === 'advance') dependencies.adjustOffset(0.1);
  else if (intent.action === 'reset') dependencies.resetOffset();
  else dependencies.retryOffsetSave();
  return true;
}

export async function applyPerformerControlIntent(value, dependencies) {
  let intent;
  try {
    intent = parsePerformerControlIntent(value);
  } catch {
    return false;
  }
  const published = dependencies.getPublishedContext(intent.revision);
  const current = dependencies.getCurrentContext();
  if (
    !published ||
    !current ||
    intent.trackId !== published.playerTrackId ||
    intent.trackId !== current.playerTrackId
  )
    return false;
  if (intent.action === 'play' || intent.action === 'pause') {
    await dependencies[intent.action]();
    return true;
  }
  const variant = intent.action.slice('reading-'.length);
  if (
    !contextsMatch(intent, published, current) ||
    !dependencies.canSelectReadingVariant(variant)
  )
    return false;
  await dependencies.selectReadingVariant(variant);
  return true;
}

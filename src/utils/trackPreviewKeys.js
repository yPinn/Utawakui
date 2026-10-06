// Maps a keydown inside the track preview to an intent. `isolate` keeps the
// event from reaching global shortcuts that drive the performance player;
// Escape, Tab and F-keys pass on to the dialog and view switching.
export function resolvePreviewKeyIntent(event) {
  if (/^(?:F\d+|Escape|Tab)$/u.test(event.key)) {
    return { intent: null, isolate: false };
  }
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return { intent: null, isolate: true };
  }

  // A preview has no play／pause: Space only stays away from the
  // performance player's global shortcut.
  const intents = {
    ArrowDown: 'next',
    ArrowUp: 'previous',
    m: 'mute',
    M: 'mute',
  };
  return { intent: intents[event.key] ?? null, isolate: true };
}

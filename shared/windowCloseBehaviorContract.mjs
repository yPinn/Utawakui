export const WINDOW_CLOSE_BEHAVIORS = Object.freeze(['ask', 'tray', 'quit']);

export function isWindowCloseBehavior(value) {
  return WINDOW_CLOSE_BEHAVIORS.includes(value);
}

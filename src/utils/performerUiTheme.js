function isUiTheme(value) {
  return value === 'light' || value === 'dark';
}

export function installPerformerUiTheme({ bridge, root }) {
  root.dataset.uiTheme = isUiTheme(bridge?.initialUiTheme)
    ? bridge.initialUiTheme
    : 'light';

  if (typeof bridge?.onUiTheme !== 'function') return undefined;
  return bridge.onUiTheme((theme) => {
    if (isUiTheme(theme)) root.dataset.uiTheme = theme;
  });
}

import { createApp } from 'vue';
import PerformerApp from '../../performer/PerformerApp.vue';
import { installRendererDiagnostics } from '../../utils/rendererDiagnostics.js';
import { registerRendererSurfaceRoot } from '../../utils/rendererSurfaceRegistry.js';
import { installPerformerUiTheme } from '../../utils/performerUiTheme.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import '../../styles/tokens.css';
import '../../styles/base.css';

installPerformerUiTheme({
  bridge: window.UtawakuiPerformer,
  root: document.documentElement,
});

document.documentElement.lang = UI_LOCALE;
const surfaceRoot = registerRendererSurfaceRoot('performer');
const app = createApp(PerformerApp);
installRendererDiagnostics({
  app,
  recordDiagnostic: window.UtawakuiPerformer?.recordDiagnostic,
});
app.mount(surfaceRoot);

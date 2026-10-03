import { createApp } from 'vue';
import PerformerApp from './performer/PerformerApp.vue';
import { installRendererDiagnostics } from './utils/rendererDiagnostics.js';
import { registerRendererSurfaceRoot } from './utils/rendererSurfaceRegistry.js';
import './styles/tokens.css';
import './styles/base.css';

document.documentElement.dataset.uiTheme =
  window.UtawakuiPerformer?.initialUiTheme === 'light' ? 'light' : 'dark';

const surfaceRoot = registerRendererSurfaceRoot('performer');
const app = createApp(PerformerApp);
installRendererDiagnostics({
  app,
  recordDiagnostic: window.UtawakuiPerformer?.recordDiagnostic,
});
app.mount(surfaceRoot);

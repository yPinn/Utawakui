import { createApp } from 'vue';
import App from './App.vue';
import { installRendererDiagnostics } from './utils/rendererDiagnostics.js';
import { registerRendererSurfaceRoot } from './utils/rendererSurfaceRegistry.js';
import { scheduleFirstPaintMilestone } from './utils/startupTrace.js';
import { UI_LOCALE } from './utils/uiLocale.js';
import './styles/tokens.css';
import './styles/base.css';

document.documentElement.lang = UI_LOCALE;
const surfaceRoot = registerRendererSurfaceRoot('main');
const app = createApp(App);
installRendererDiagnostics({
  app,
  recordDiagnostic: window.Utawakui?.recordDiagnostic,
});
app.mount(surfaceRoot);
scheduleFirstPaintMilestone();

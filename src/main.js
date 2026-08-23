import { createApp } from 'vue';
import App from './App.vue';
import { installRendererDiagnostics } from './utils/rendererDiagnostics.js';
import { scheduleFirstPaintMilestone } from './utils/startupTrace.js';
import './styles/tokens.css';
import './styles/base.css';

const app = createApp(App);
installRendererDiagnostics({
  app,
  recordDiagnostic: window.Utawakui?.recordDiagnostic,
});
app.mount('#app');
scheduleFirstPaintMilestone();

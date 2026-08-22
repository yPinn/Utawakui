import { createApp } from 'vue';
import PerformerApp from './performer/PerformerApp.vue';
import { installRendererDiagnostics } from './utils/rendererDiagnostics.js';
import './styles/tokens.css';
import './styles/base.css';

document.documentElement.dataset.uiTheme =
  window.UtawakuiPerformer?.initialUiTheme === 'light' ? 'light' : 'dark';

const app = createApp(PerformerApp);
installRendererDiagnostics({
  app,
  recordDiagnostic: window.UtawakuiPerformer?.recordDiagnostic,
});
app.mount('#app');

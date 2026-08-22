import { createApp } from 'vue';
import PerformerApp from './performer/PerformerApp.vue';
import './styles/tokens.css';
import './styles/base.css';

document.documentElement.dataset.uiTheme =
  window.UtawakuiPerformer?.initialUiTheme === 'light' ? 'light' : 'dark';

createApp(PerformerApp).mount('#app');

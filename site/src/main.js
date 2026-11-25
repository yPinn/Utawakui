import { createApp } from 'vue';

// Display face follows the overlay's CJK stack (GenWanMin2 TW, then Noto Serif TC); body text
// uses the app's system font role, so no sans web font is loaded.
// Only the display weight the site uses (--site-weight-display: 900).
import '@fontsource/noto-serif-tc/900.css';
import '@app-tokens';

import App from './App.vue';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('app');
createApp(App, { privacy: root.hasAttribute('data-privacy') }).mount(root);

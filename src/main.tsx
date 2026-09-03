import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { registerServiceWorker } from './pwa';

import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './components/components.css';
import './styles/print.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    {/* BASE_URL is "/" normally and "/<repo>/" on a GitHub Pages project
        site, so every route is relative to wherever the app is served. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();

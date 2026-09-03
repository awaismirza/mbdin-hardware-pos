import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { registerServiceWorker } from './pwa';

// app.css is the single style entry: it pulls in Tailwind and, into a cascade
// layer below `utilities`, the legacy stylesheets still used by unmigrated
// screens. print.css stays separate — its @media print rules use !important
// and want no layering.
import './styles/app.css';
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

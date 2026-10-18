// Entry point: picks the journey (?journey=drill by default) and starts the engine.

import { App } from './engine/app.js';

const params = new URLSearchParams(location.search);
const id = (params.get('journey') || 'drill').replace(/[^a-z0-9-]/gi, '') || 'drill';
const journeyUrl = new URL(`../journeys/${id}.js`, import.meta.url).href;
const root = document.getElementById('app');

try {
  const journey = (await import(journeyUrl)).default;
  const app = new App({ journey, journeyUrl, params, root });
  window.__intoTheEdge = app;
  await app.start();
} catch (err) {
  console.error(err);
  root.classList.remove('is-loading');
  if (!root.querySelector('.fatal')) {
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = 'Into the Edge could not start in this browser. It needs WebGL 2 and JavaScript modules.';
    root.appendChild(p);
  }
}

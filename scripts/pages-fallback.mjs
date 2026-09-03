/**
 * Post-build step for GitHub Pages. Run after `vite build`.
 *
 * Pages is a plain static file server with no rewrite rules, so a deep link
 * like /<repo>/sell — which is what the manifest's start_url points at, and
 * what the shopkeeper's home-screen icon opens — has no file behind it and
 * would 404 on the very first launch, before the service worker exists to
 * answer navigations from its precache.
 *
 * Pages does serve 404.html for any path it cannot find, so an identical copy
 * of index.html under that name boots the app; React Router then reads the
 * path it was actually asked for and shows the right screen. The response
 * carries a 404 status, which no one sees and nothing in the app depends on.
 *
 * .nojekyll stops Pages running the output through Jekyll, which silently
 * drops files and directories whose names begin with an underscore.
 */

import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('pages-fallback: dist/index.html is missing — run the build first.');
  process.exit(1);
}

copyFileSync(index, join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');

console.log('pages-fallback: wrote dist/404.html and dist/.nojekyll');

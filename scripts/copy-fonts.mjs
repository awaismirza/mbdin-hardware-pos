/**
 * Copies the two font families into public/fonts so the app self-hosts them.
 *
 * The app must never touch a font CDN: it is expected to cold-launch from a
 * home screen in aeroplane mode. Fontsource is a devDependency purely as a
 * delivery mechanism for the woff2 files; nothing imports it at runtime.
 *
 * Latin subset for IBM Plex Sans (English text and every numeral), Arabic
 * subset for IBM Plex Sans Arabic (Urdu). Together about 100 KB.
 *
 * Run with `node scripts/copy-fonts.mjs` — wired into `npm run fonts` and the
 * prebuild step.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'fonts');
const modules = join(root, 'node_modules', '@fontsource');

const files = [
  ['ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 'ibm-plex-sans-400.woff2'],
  ['ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 'ibm-plex-sans-500.woff2'],
  ['ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', 'ibm-plex-sans-600.woff2'],
  [
    'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
    'ibm-plex-sans-arabic-400.woff2',
  ],
  [
    'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
    'ibm-plex-sans-arabic-500.woff2',
  ],
  [
    'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
    'ibm-plex-sans-arabic-600.woff2',
  ],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(modules, from), join(out, to));
  console.log(`fonts: ${to}`);
}

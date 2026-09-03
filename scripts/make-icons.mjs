/**
 * Generates the PWA icons from the design tokens, so the mark and the app can
 * never drift apart. Run with `node scripts/make-icons.mjs`.
 *
 * The mark is the bahi khata itself: a ledger page in --paper, ruled in
 * --paper-rule, bound at the spine in --seal. No text — a glyph at 48px on a
 * launcher is mud, and a wordmark would need a font rasteriser in the build.
 *
 * Writes PNGs with nothing but node:zlib, because adding an image toolchain to
 * a project whose whole point is a small offline bundle would be silly.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const PAPER = [0xed, 0xef, 0xe8];
const RULE = [0xd3, 0xd8, 0xcb];
const SEAL = [0xa3, 0x2c, 0x24];
const INK = [0x17, 0x21, 0x1c];

/** @param {number} size @param {number} inset fraction kept clear at the edges */
function drawLedger(size, inset) {
  const pixels = new Uint8Array(size * size * 3);
  const pad = Math.round(size * inset);
  const inner = size - pad * 2;

  const put = (x, y, [r, g, b]) => {
    const offset = (y * size + x) * 3;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  };

  // Ground: seal red, so a maskable crop never exposes bare canvas.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) put(x, y, SEAL);
  }

  // The page.
  for (let y = pad; y < pad + inner; y += 1) {
    for (let x = pad; x < pad + inner; x += 1) put(x, y, PAPER);
  }

  // The spine: a red band down the binding edge, plus a hairline of ink.
  const spine = Math.max(2, Math.round(inner * 0.2));
  for (let y = pad; y < pad + inner; y += 1) {
    for (let x = pad; x < pad + spine; x += 1) put(x, y, SEAL);
    for (let x = pad + spine; x < pad + spine + Math.max(1, Math.round(size * 0.008)); x += 1) {
      put(x, y, INK);
    }
  }

  // Ruled lines across the page.
  const lines = 5;
  const thickness = Math.max(1, Math.round(size * 0.016));
  const top = pad + Math.round(inner * 0.22);
  const gap = Math.round((inner * 0.58) / (lines - 1));
  const from = pad + spine + Math.round(inner * 0.12);
  const to = pad + inner - Math.round(inner * 0.12);

  for (let line = 0; line < lines; line += 1) {
    const y0 = top + line * gap;
    // The top rule is ink: the column heading of a ledger page.
    const colour = line === 0 ? INK : RULE;
    const width = line === 0 ? thickness : Math.max(1, Math.round(thickness * 0.7));
    for (let y = y0; y < y0 + width && y < pad + inner; y += 1) {
      for (let x = from; x < to; x += 1) put(x, y, colour);
    }
  }

  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });

const targets = [
  // [filename, size, edge inset]
  ['icon-192.png', 192, 0.035],
  ['icon-512.png', 512, 0.035],
  ['apple-touch-icon.png', 180, 0.0],
  // Maskable: content stays inside the 80% safe zone, so a circular or
  // squircle crop still shows a whole page.
  ['maskable-512.png', 512, 0.14],
];

for (const [name, size, inset] of targets) {
  writeFileSync(join(OUT, name), encodePng(size, drawLedger(size, inset)));
  console.log(`wrote ${name} (${size}×${size})`);
}

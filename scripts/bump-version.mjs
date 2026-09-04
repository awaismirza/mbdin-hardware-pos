#!/usr/bin/env node
/**
 * Bumps the version everywhere it needs to move, and nowhere else.
 *
 *   npm run release -- 1.1.0
 *
 * Does: package.json version · CHANGELOG.md section rotation + link refs ·
 * docs/product-spec.md snapshot + header. Does NOT commit, tag, or push —
 * see docs/RELEASING.md for the surrounding steps.
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'awaismirza/mbdin-hardware-pos';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release -- <major.minor.patch>   e.g. 1.1.0');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);

// ---- package.json --------------------------------------------------------
const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
const previous = pkg.version;
if (previous === version) {
  console.error(`package.json is already ${version}.`);
  process.exit(1);
}
pkg.version = version;
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ---- CHANGELOG.md ------------------------------------------------------
let changelog = read('CHANGELOG.md');
if (!changelog.includes('## [Unreleased]')) {
  console.error('CHANGELOG.md has no "## [Unreleased]" section — fix that first.');
  process.exit(1);
}

// Split out the Unreleased body (everything between its heading and the next "## ").
const unreleasedRe = /## \[Unreleased\]\n([\s\S]*?)(?=\n## |\n\[Unreleased\]: )/;
const match = changelog.match(unreleasedRe);
const unreleasedBody = (match ? match[1] : '\n_Nothing yet._\n').trim();
const carried = unreleasedBody && unreleasedBody !== '_Nothing yet._' ? unreleasedBody : '_No user-facing changes._';

changelog = changelog.replace(
  unreleasedRe,
  `## [Unreleased]\n\n_Nothing yet._\n\n## [${version}] — ${today}\n\n${carried}\n`,
);

// Link references at the bottom.
changelog = changelog
  .replace(
    /\[Unreleased\]: .*/,
    `[Unreleased]: https://github.com/${REPO}/compare/v${version}...HEAD`,
  )
  .replace(
    new RegExp(`\\[${previous.replace(/\./g, '\\.')}\\]: .*`),
    (line) => `[${version}]: https://github.com/${REPO}/releases/tag/v${version}\n${line}`,
  );
write('CHANGELOG.md', changelog);

// ---- product spec ------------------------------------------------------
const specPath = 'docs/product-spec.md';
const snapshotPath = `docs/specs/product-spec-v${version}.md`;
copyFileSync(join(root, specPath), join(root, snapshotPath));

let snapshot = read(snapshotPath).replace(
  /^\*\*Version:\*\* .*$/m,
  `**Version:** ${version}`,
).replace(
  /^\*\*Status:\*\* current$/m,
  '**Status:** snapshot — immutable. The current spec is `docs/product-spec.md`.',
);
write(snapshotPath, snapshot);

let spec = read(specPath).replace(/^\*\*Version:\*\* .*$/m, `**Version:** ${version}`);
write(specPath, spec);

// ---- done ------------------------------------------------------------
console.log(`Bumped ${previous} → ${version}.`);
console.log('');
console.log('Files changed:');
console.log('  package.json');
console.log('  CHANGELOG.md            (review the new section — fill in real changes)');
console.log(`  ${specPath}`);
console.log(`  ${snapshotPath}          (new snapshot)`);
console.log('');
console.log('Now, per docs/RELEASING.md:');
console.log('  3. flesh out the CHANGELOG.md section from git log');
console.log('  4. update STATUS.md, docs/roadmap.md, docs/spec-changelog.md if the spec moved');
console.log('  5. npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e');
console.log(`  6. git commit -m "Release ${version}" && git tag -a v${version} -m "Dukaan POS ${version}" && git push origin main --follow-tags`);
console.log(`  7. gh release create v${version} --title "Dukaan POS ${version}" --notes-from-tag`);

#!/usr/bin/env node
// Guards docs/index.html against drift.
//   - Benchmark + caveman-compress numbers must match README.md exactly
//     (CLAUDE.md: numbers are real, never invented or rounded).
//   - Agent list must match the PROVIDERS array in bin/install.js, so the
//     site's command builder never offers an --only id the installer rejects.
//   - Playground caveman answers must appear verbatim in skills/caveman/SKILL.md.
//
// Run: node tests/test_docs_site.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const installer = fs.readFileSync(path.join(ROOT, 'bin', 'install.js'), 'utf8');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'caveman', 'SKILL.md'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const m = html.match(/<script type="application\/json" id="site-data">([\s\S]*?)<\/script>/);
assert.ok(m, 'site-data JSON block missing from docs/index.html');
const data = JSON.parse(m[1]);

const num = s => Number(s.replace(/[*,%]/g, '').trim());
const cells = line => line.split('|').slice(1, -1).map(c => c.trim());

check('benchmark rows match README table', () => {
  const block = readme.split('<!-- BENCHMARK-TABLE-START -->')[1].split('<!-- BENCHMARK-TABLE-END -->')[0];
  const rows = block.trim().split('\n').slice(2).map(cells);
  const avg = rows.pop();
  assert.deepStrictEqual(
    data.benchmarks,
    rows.map(([task, n, c, s]) => ({ task, normal: num(n), caveman: num(c), saved: num(s) })),
  );
  assert.deepStrictEqual(data.benchmarkAverage, { normal: num(avg[1]), caveman: num(avg[2]), saved: num(avg[3]) });
});

check('compress rows match README receipts table', () => {
  const block = readme.split('caveman-compress receipts')[1].split('</details>')[0];
  const rows = block.split('\n').filter(l => /^\| `?\**[\w-]+/.test(l) && !/^\| File/.test(l)).map(cells);
  const avg = rows.find(r => /Average/.test(r[0]));
  const body = rows.filter(r => r !== avg);
  assert.deepStrictEqual(
    data.compress,
    body.map(([f, o, c, s]) => ({ file: f.replace(/`/g, ''), original: num(o), compressed: num(c), saved: s.replace(/\*/g, '') })),
  );
  assert.deepStrictEqual(data.compressAverage, {
    original: num(avg[1]), compressed: num(avg[2]), saved: avg[3].replace(/\*/g, ''),
  });
});

check('agent list matches bin/install.js PROVIDERS', () => {
  const src = installer.split('const PROVIDERS = [')[1].split('\n];')[0];
  const providers = [...src.matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*mech:\s*'([^']+)'/g)]
    .map(([, id, label, mech]) => ({ id, label, mech }));
  assert.ok(providers.length > 10, 'could not parse PROVIDERS');
  assert.deepStrictEqual(data.agents, providers);
});

check('playground caveman answers come from SKILL.md', () => {
  const block = html.split('var QUESTIONS = {')[1].split('var LEVELS')[0];
  const levels = [...block.matchAll(/'(lite|full|ultra|wenyan-[a-z]+)':\s*'([^']+)'/g)];
  assert.ok(levels.length >= 10, 'could not parse playground levels');
  for (const [, lvl, text] of levels) {
    assert.ok(skill.includes(`- ${lvl}: "${text}"`), `${lvl} example not found in SKILL.md: ${text}`);
  }
});

check('no external scripts besides the pinned color engine', () => {
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x => x[1]);
  assert.deepStrictEqual(srcs, []);
  const imports = [...html.matchAll(/import\('([^']+)'\)/g)].map(x => x[1]);
  assert.deepStrictEqual(imports, ['https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.4.0/+esm']);
});

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall docs site checks passed');

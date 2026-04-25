// One-shot summarizer for entity-filter-baseline.json.
// Run: node docs/week1-baselines/summarize.cjs
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'entity-filter-baseline.json'), 'utf8'));
const sep = path.sep;
const root = path.resolve(__dirname, '..', '..');

const norm = (p) => p.replace(root + sep, '').split(sep).join('/');

const byFile = data
  .map((d) => ({ file: norm(d.filePath), count: d.warningCount + d.errorCount }))
  .filter((d) => d.count > 0)
  .sort((a, b) => b.count - a.count);

const byDir = {};
for (const f of byFile) {
  const dir = f.file.split('/').slice(0, 2).join('/');
  byDir[dir] = (byDir[dir] || 0) + f.count;
}

const byModelMethod = {};
for (const d of data) {
  for (const m of d.messages || []) {
    const match = m.message.match(/^(\w+)\.(\w+)\(\)/);
    if (!match) continue;
    const key = `${match[1]}.${match[2]}`;
    byModelMethod[key] = (byModelMethod[key] || 0) + 1;
  }
}

const total = byFile.reduce((s, x) => s + x.count, 0);
console.log(`Total: ${total} warnings across ${byFile.length} files\n`);

console.log('Top directories:');
for (const [dir, n] of Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}  ${dir}`);
}

console.log('\nTop files:');
for (const f of byFile.slice(0, 25)) {
  console.log(`  ${String(f.count).padStart(4)}  ${f.file}`);
}

console.log('\nTop model.method patterns:');
const sorted = Object.entries(byModelMethod).sort((a, b) => b[1] - a[1]);
for (const [k, n] of sorted.slice(0, 20)) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

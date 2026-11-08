// Fails if a translation key exists in one language and not in the other, or if a static
// key used in apps/web/src (t('ns:key')) is missing from the locale files. (SPEC §9-bis)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../..');
const localesDir = join(root, 'apps/web/src/locales');
const srcDir = join(root, 'apps/web/src');
const langs = readdirSync(localesDir).filter((d) => statSync(join(localesDir, d)).isDirectory());

function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') out.push(...flatten(v, key));
    else out.push(key);
  }
  return out;
}

const keys = {};
for (const lang of langs) {
  keys[lang] = new Set();
  for (const f of readdirSync(join(localesDir, lang)).filter((f) => f.endsWith('.json'))) {
    const ns = f.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(join(localesDir, lang, f), 'utf8'));
    for (const k of flatten(data)) keys[lang].add(`${ns}:${k.replace(/_(one|other|zero|few|many)$/, '')}`);
  }
}

let errors = 0;
for (const a of langs) {
  for (const b of langs) {
    if (a === b) continue;
    for (const k of keys[a]) {
      if (!keys[b].has(k)) {
        console.error(`✗ key "${k}" exists in ${a} but is missing in ${b}`);
        errors++;
      }
    }
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'locales' ? [] : walk(p);
    return /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
  });
}
const re = /\bt\(\s*['"`]([a-z]+:[\w.]+)['"`]/g;
for (const file of walk(srcDir)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(re)) {
    for (const lang of langs) {
      if (!keys[lang].has(m[1])) {
        console.error(`✗ ${relative(root, file)} uses "${m[1]}" missing in ${lang}`);
        errors++;
      }
    }
  }
}

if (errors) {
  console.error(`\n${errors} i18n problem(s).`);
  process.exit(1);
}
console.log(`✓ i18n OK: ${langs.join(', ')} — ${keys[langs[0]].size} keys each`);

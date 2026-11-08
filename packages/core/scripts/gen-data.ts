// Writes data/formations/*.json and data/routines/*.json from the TS sources (single source of truth).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATIONS, ROUTINES } from '../src';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../data');
mkdirSync(join(root, 'formations'), { recursive: true });
mkdirSync(join(root, 'routines'), { recursive: true });
for (const f of FORMATIONS) writeFileSync(join(root, 'formations', `${f.id}.json`), JSON.stringify(f, null, 2) + '\n');
for (const r of ROUTINES) writeFileSync(join(root, 'routines', `${r.id}.json`), JSON.stringify(r, null, 2) + '\n');
console.log(`Wrote ${FORMATIONS.length} formations and ${ROUTINES.length} routines to ${root}`);

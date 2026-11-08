// Assembles the GitHub Pages output: landing site at / and the web app at /app/.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../..');
const out = join(root, 'dist-site');
const app = join(root, 'apps/web/dist');
if (!existsSync(app)) throw new Error('Build the web app first (BASE_PATH=/<repo>/app/)');
rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'apps/site'), out, { recursive: true, filter: (p) => !p.endsWith('package.json') });
cpSync(app, join(out, 'app'), { recursive: true });
console.log(`Site assembled in ${out}`);

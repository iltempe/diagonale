// Assembles the GitHub Pages output: landing site at / and the web app at /app/.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../..');
const out = join(root, 'dist-site');
const app = join(root, 'apps/web/dist');
if (!existsSync(app)) throw new Error('Build the web app first (BASE_PATH=/<repo>/app/)');
rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'apps/site'), out, { recursive: true, filter: (p) => !p.endsWith('package.json') });
cpSync(app, join(out, 'app'), { recursive: true });

// Absolute URLs (Open Graph) follow the deploy target; CNAME pins the custom domain when configured.
const siteUrl = process.env.SITE_URL || 'https://iltempe.github.io/diagonale/';
for (const f of ['index.html', 'main.js']) {
  const file = join(out, f);
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('https://iltempe.github.io/diagonale/', siteUrl));
}
if (process.env.PAGES_DOMAIN) writeFileSync(join(out, 'CNAME'), `${process.env.PAGES_DOMAIN}\n`);
console.log(`Site assembled in ${out}`);

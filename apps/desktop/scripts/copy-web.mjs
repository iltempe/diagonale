// Copies the desktop build of the web app (apps/web/dist-desktop) into apps/desktop/web.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../web/dist-desktop');
const dst = join(here, '../web');
if (!existsSync(src)) throw new Error(`Missing ${src}: run pnpm --filter @diagonale/web build:desktop`);
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log(`Copied web build to ${dst}`);

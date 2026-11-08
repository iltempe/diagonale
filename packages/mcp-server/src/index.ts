import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileBackend, type Backend } from './backend';
import { LiveBackend } from './live';
import { createServer } from './server';

const HELP = `diagonale-mcp — MCP server for Diagonale

Usage:
  diagonale-mcp [--dir <folder>]            file mode (default): .diagonale.json files in <folder> (default ./boards)
  diagonale-mcp --live [--port 7457]        live mode: bridge to the open web app over ws://localhost:<port>
Options:
  --http <port>     serve MCP over Streamable HTTP on 127.0.0.1:<port>/mcp instead of stdio
  --app-url <url>   web app URL used by open_in_browser (default https://diagonalecalcio.it/)
`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const log = (m: string) => process.stderr.write(`[diagonale-mcp] ${m}\n`);
  const backend: Backend = process.argv.includes('--live')
    ? new LiveBackend(Number(arg('--port') ?? 7457), log)
    : new FileBackend(resolve(arg('--dir') ?? 'boards'));
  const opts = { appUrl: arg('--app-url') };
  log(backend.mode === 'live' ? `live mode on ws://127.0.0.1:${arg('--port') ?? 7457}` : `file mode in ${(backend as FileBackend).dir}`);

  const httpPort = arg('--http');
  if (httpPort) {
    const http = createHttpServer(async (req, res) => {
      if (!req.url?.startsWith('/mcp')) {
        res.writeHead(404).end();
        return;
      }
      const server = createServer(backend, opts);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    });
    http.listen(Number(httpPort), '127.0.0.1', () => log(`Streamable HTTP on http://127.0.0.1:${httpPort}/mcp`));
    return;
  }
  const server = createServer(backend, opts);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n');
  process.exit(1);
});

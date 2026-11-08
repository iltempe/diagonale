import { spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { describeBoard, FORMATIONS, getFormation, shareUrl, toolDefinitions, DEFAULT_APP_URL } from '@diagonale/core';
import type { Backend } from './backend';

export type ServerOptions = { appUrl?: string; openBrowser?: (url: string) => void };

type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };

const boardIdProp = { boardId: { type: 'string', description: 'Board id (file mode). Defaults to the active board.' } };

export function listTools(backend: Backend): ToolSpec[] {
  const base = toolDefinitions().map((t) => {
    if (backend.mode !== 'file' || t.name === 'createBoard' || t.name.startsWith('list')) return t;
    const props = (t.inputSchema.properties as Record<string, unknown>) ?? {};
    return { ...t, inputSchema: { ...t.inputSchema, properties: { ...props, ...boardIdProp } } };
  });
  const extra: ToolSpec[] = [
    {
      name: 'listBoards',
      description: 'List available boards (file mode: .diagonale.json files in the folder; live mode: the board open in the app).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'export_png',
      description: 'Render a phase of the board as PNG (live mode, rendered by the web app).',
      inputSchema: { type: 'object', properties: { phase: { type: 'integer', minimum: 0 } } },
    },
    {
      name: 'export_mp4',
      description: 'Export the animation as a video file downloaded by the web app (live mode).',
      inputSchema: {
        type: 'object',
        properties: {
          resolution: { type: 'string', enum: ['720p', '1080p'] },
          aspect: { type: 'string', enum: ['16:9', '9:16'] },
        },
      },
    },
    {
      name: 'open_in_browser',
      description: 'Open the board in the Diagonale web app (shareable read-only link with the full animation). Returns the URL.',
      inputSchema: { type: 'object', properties: { ...boardIdProp } },
    },
  ];
  if (backend.mode === 'file') {
    extra.unshift({
      name: 'openBoard',
      description: 'Select the active board by id for the following calls.',
      inputSchema: { type: 'object', properties: { boardId: { type: 'string' } }, required: ['boardId'] },
    });
  }
  return [...base, ...extra];
}

type ToolResult = { content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[]; isError?: boolean };

const text = (v: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export function defaultOpen(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

export async function callTool(backend: Backend, name: string, rawArgs: unknown, opts: ServerOptions = {}): Promise<ToolResult> {
  const { boardId, ...args } = (rawArgs ?? {}) as Record<string, unknown> & { boardId?: string };
  try {
    switch (name) {
      case 'listBoards':
        return text(await backend.listBoards());
      case 'openBoard':
        if (!backend.open) return text('openBoard is only available in file mode', true);
        await backend.open(String(boardId ?? args.boardId));
        return text(`Active board: ${boardId}`);
      case 'export_png': {
        if (!backend.exportPng) return text('export_png requires live mode (--live) with the web app open. Use open_in_browser to view the board.', true);
        const data = await backend.exportPng(args.phase as number | undefined);
        return { content: [{ type: 'image', data: data.replace(/^data:image\/png;base64,/, ''), mimeType: 'image/png' }] };
      }
      case 'export_mp4': {
        if (!backend.exportMp4) return text('export_mp4 requires live mode (--live) with the web app open.', true);
        const r = await backend.exportMp4(args);
        return r.ok ? text(r.result ?? 'Video exported by the web app') : text(r.error, true);
      }
      case 'open_in_browser': {
        const board = await backend.getBoard(boardId);
        const url = shareUrl(board, opts.appUrl ?? DEFAULT_APP_URL);
        (opts.openBrowser ?? defaultOpen)(url);
        return text({ url });
      }
      default: {
        const r = await backend.run(name, args, boardId);
        return r.ok ? text(r.result ?? 'ok') : text(r.error ?? 'error', true);
      }
    }
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), true);
  }
}

export function createServer(backend: Backend, opts: ServerOptions = {}): Server {
  const server = new Server(
    { name: 'diagonale', version: '0.1.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        'Diagonale animated tactics board. Coordinates are meters: x along the length (home attacks +x), y along the width. Call describeBoard first, use applyFormation for full teams, addPhase + moveEntities to build the animation.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(backend) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(backend, req.params.name, req.params.arguments, opts));
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const boards = await backend.listBoards().catch(() => []);
    return {
      resources: [
        ...boards.map((b) => ({ uri: `board://${b.id}`, name: b.title || b.id, mimeType: 'application/json' })),
        ...FORMATIONS.map((f) => ({ uri: `formation://${f.id}`, name: `Formation ${f.label.en}`, mimeType: 'application/json' })),
      ],
    };
  });
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { uriTemplate: 'board://{id}', name: 'Board', mimeType: 'application/json' },
      { uriTemplate: 'formation://{id}', name: 'Formation', mimeType: 'application/json' },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const [scheme, id] = uri.split('://');
    if (scheme === 'formation') {
      const f = getFormation(id ?? '');
      if (!f) throw new Error(`Unknown formation ${id}`);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(f, null, 2) }] };
    }
    if (scheme === 'board') {
      const b = await backend.getBoard(backend.mode === 'file' ? id : undefined);
      return {
        contents: [
          { uri, mimeType: 'application/json', text: JSON.stringify(b, null, 2) },
          { uri: `${uri}#summary`, mimeType: 'text/plain', text: describeBoard(b).text },
        ],
      };
    }
    throw new Error(`Unsupported resource ${uri}`);
  });
  return server;
}

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createEmptyBoard, decodeShare, Dispatcher, isQuery, runQuery } from '@diagonale/core';
import { FileBackend } from '../src/backend';
import { LiveBackend } from '../src/live';
import { callTool, listTools } from '../src/server';

const json = (r: Awaited<ReturnType<typeof callTool>>) => {
  const c = r.content[0]!;
  return c.type === 'text' ? JSON.parse(c.text) : c;
};

describe('file mode', () => {
  it('creates and edits boards stored as .diagonale.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'diag-'));
    const b = new FileBackend(dir);
    const tools = listTools(b).map((t) => t.name);
    expect(tools).toContain('applyFormation');
    expect(tools).toContain('open_in_browser');
    const created = json(await callTool(b, 'createBoard', { title: 'Build-up' }));
    expect(created.boardId).toBeTruthy();
    expect((await callTool(b, 'applyFormation', { team: 'home', formationId: '4-3-3' })).isError).toBeUndefined();
    await callTool(b, 'addPhase', {});
    const board = await b.getBoard();
    expect(board.teams[0]!.players).toHaveLength(11);
    expect(board.phases).toHaveLength(2);
    expect(json(await callTool(b, 'listBoards', {}))).toHaveLength(1);
    const err = await callTool(b, 'moveEntity', { phase: 7, entityId: 'ball', x: 1, y: 1 });
    expect(err.isError).toBe(true);
    let opened = '';
    const r = json(await callTool(b, 'open_in_browser', {}, { appUrl: 'https://x.test/', openBrowser: (u) => (opened = u) }));
    expect(r.url).toBe(opened);
    expect(decodeShare(opened.split('#/d/')[1]!).phases).toHaveLength(2);
    expect((await callTool(b, 'export_png', {})).isError).toBe(true);
  });
});

describe('live mode', () => {
  it('forwards tool calls to the connected web app', async () => {
    const port = 17457 + Math.floor(Math.random() * 1000);
    const live = new LiveBackend(port);
    const d = new Dispatcher(createEmptyBoard());
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((r) => ws.on('open', r));
    ws.on('message', (raw) => {
      const { id, method, params } = JSON.parse(String(raw));
      let result: unknown;
      if (method === 'run') {
        result = isQuery(params.name) ? runQuery(d.board, params.name, params.args) : d.dispatch(params.name, params.args);
      } else if (method === 'getBoard') result = d.board;
      ws.send(JSON.stringify({ id, result }));
    });
    await new Promise((r) => setTimeout(r, 50));
    const res = await callTool(live, 'applyFormation', { team: 'away', formationId: '4-4-2' });
    expect(res.isError).toBeUndefined();
    expect(d.board.teams[1]!.players).toHaveLength(11);
    expect(json(await callTool(live, 'listBoards', {}))[0].id).toBe(d.board.id);
    ws.close();
    live.close();
  });
});

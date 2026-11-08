import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createEmptyBoard,
  Dispatcher,
  isQuery,
  parseBoard,
  runQuery,
  serializeBoard,
  type Board,
} from '@diagonale/core';

export type OpResult = { ok: boolean; result?: unknown; error?: string };

export interface Backend {
  readonly mode: 'file' | 'live';
  run(name: string, args: Record<string, unknown>, boardId?: string): Promise<OpResult>;
  getBoard(boardId?: string): Promise<Board>;
  listBoards(): Promise<{ id: string; title: string; file?: string }[]>;
  open?(boardId: string): Promise<void>;
  exportPng?(phase?: number): Promise<string>;
  exportMp4?(opts: Record<string, unknown>): Promise<OpResult>;
}

const EXT = '.diagonale.json';

/** File mode: boards are .diagonale.json files in a folder. */
export class FileBackend implements Backend {
  readonly mode = 'file' as const;
  private active: string | undefined;

  constructor(readonly dir: string) {}

  private path(id: string) {
    if (!/^[\w.-]+$/.test(id)) throw new Error(`Invalid board id: ${id}`);
    return join(this.dir, `${id}${EXT}`);
  }

  async listBoards() {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(EXT));
    const out: { id: string; title: string; file: string }[] = [];
    for (const f of files) {
      try {
        const b = parseBoard(JSON.parse(await readFile(join(this.dir, f), 'utf8')));
        out.push({ id: f.slice(0, -EXT.length), title: b.title, file: join(this.dir, f) });
      } catch {
        /* skip invalid files */
      }
    }
    return out;
  }

  async open(id: string) {
    await readFile(this.path(id), 'utf8');
    this.active = id;
  }

  private async resolveId(boardId?: string): Promise<string> {
    const id = boardId ?? this.active;
    if (id) return id;
    const list = await this.listBoards();
    if (list.length === 1) return (this.active = list[0]!.id);
    throw new Error(
      list.length ? `Several boards available, pass boardId or call openBoard: ${list.map((b) => b.id).join(', ')}` : 'No board yet: call createBoard first',
    );
  }

  async getBoard(boardId?: string): Promise<Board> {
    const id = await this.resolveId(boardId);
    return parseBoard(JSON.parse(await readFile(this.path(id), 'utf8')));
  }

  private async save(b: Board, id: string) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(id), serializeBoard(b) + '\n');
  }

  async run(name: string, args: Record<string, unknown>, boardId?: string): Promise<OpResult> {
    try {
      if (name === 'createBoard') {
        const d = new Dispatcher(createEmptyBoard());
        const r = d.dispatch('createBoard', args);
        if (!r.ok) return r;
        await this.save(d.board, d.board.id);
        this.active = d.board.id;
        return { ok: true, result: { boardId: d.board.id, file: this.path(d.board.id) } };
      }
      const id = await this.resolveId(boardId);
      const board = await this.getBoard(id);
      if (isQuery(name)) return runQuery(board, name, args);
      const d = new Dispatcher(board);
      const r = d.dispatch(name, args);
      if (!r.ok) return r;
      await this.save(d.board, id);
      return { ok: true, result: r.result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { normalizeBoard } from './board';
import { COMMANDS } from './commands/commands';
import { CommandError, type CommandDef } from './commands/types';
import { BoardSchema, type Board } from './schema';

enablePatches();

export type HistoryEntry = { label: string; patches: Patch[]; inverse: Patch[] };

export type DispatchResult = { ok: true; result: unknown; args: unknown } | { ok: false; error: string };

export type DispatchEvent = {
  board: Board;
  command?: { name: string; args: unknown };
  kind: 'dispatch' | 'undo' | 'redo' | 'load' | 'rollback';
};

type Listener = (e: DispatchEvent) => void;

export type DispatcherOptions = {
  commands?: readonly CommandDef[];
  maxHistory?: number;
  /** Validate the full board with Zod after every command (default true). */
  validate?: boolean;
};

export class Dispatcher {
  private _board: Board;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private registry = new Map<string, CommandDef>();
  private tx: { label: string; patches: Patch[]; inverse: Patch[]; depth: number } | null = null;
  private maxHistory: number;
  private validate: boolean;
  readonly log: { name: string; args: unknown; at: number }[] = [];

  constructor(board: Board, opts: DispatcherOptions = {}) {
    this._board = board;
    for (const c of opts.commands ?? COMMANDS) this.registry.set(c.name, c as CommandDef);
    this.maxHistory = opts.maxHistory ?? 300;
    this.validate = opts.validate ?? true;
  }

  get board(): Board {
    return this._board;
  }

  get canUndo(): boolean {
    return this.past.length > 0 && !this.tx;
  }

  get canRedo(): boolean {
    return this.future.length > 0 && !this.tx;
  }

  get inTransaction(): boolean {
    return !!this.tx;
  }

  commandNames(): string[] {
    return [...this.registry.keys()];
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: DispatchEvent) {
    for (const l of this.listeners) l(e);
  }

  /** Validate + apply a command by name. Never throws. */
  dispatch(name: string, rawArgs: unknown = {}, opts: { label?: string } = {}): DispatchResult {
    const cmd = this.registry.get(name);
    if (!cmd) return { ok: false, error: `Unknown command: ${name}` };
    const parsed = cmd.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `Invalid arguments for ${name}: ${issue?.path.join('.') || '(root)'} ${issue?.message}` };
    }
    let args = parsed.data;
    try {
      if (cmd.prepare) args = cmd.prepare(args, this._board);
      const [next, patches, inverse] = produceWithPatches(this._board, (draft) => {
        const replaced = cmd.recipe(draft as Board, args);
        if (replaced) return normalizeBoard(JSON.parse(JSON.stringify(replaced)) as Board);
        normalizeBoard(draft as Board);
        return undefined;
      });
      if (this.validate) {
        const v = BoardSchema.safeParse(next);
        if (!v.success) {
          const issue = v.error.issues[0];
          return { ok: false, error: `${name} produced an invalid board: ${issue?.path.join('.')} ${issue?.message}` };
        }
      }
      if (patches.length === 0) return { ok: true, result: cmd.result?.(next as Board, args) ?? null, args };
      this._board = next as Board;
      this.record({ label: opts.label ?? name, patches, inverse });
      this.log.push({ name, args, at: Date.now() });
      this.emit({ board: this._board, command: { name, args }, kind: 'dispatch' });
      return { ok: true, result: cmd.result?.(this._board, args) ?? null, args };
    } catch (e) {
      const msg = e instanceof CommandError ? e.message : e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  private record(entry: HistoryEntry) {
    if (this.tx) {
      this.tx.patches.push(...entry.patches);
      this.tx.inverse = [...entry.inverse, ...this.tx.inverse];
      return;
    }
    this.past.push(entry);
    if (this.past.length > this.maxHistory) this.past.shift();
    this.future = [];
  }

  begin(label: string): void {
    if (this.tx) {
      this.tx.depth++;
      return;
    }
    this.tx = { label, patches: [], inverse: [], depth: 1 };
  }

  commit(): void {
    if (!this.tx) return;
    if (--this.tx.depth > 0) return;
    const { label, patches, inverse } = this.tx;
    this.tx = null;
    if (patches.length) {
      this.past.push({ label, patches, inverse });
      if (this.past.length > this.maxHistory) this.past.shift();
      this.future = [];
    }
  }

  rollback(): void {
    if (!this.tx) return;
    const { inverse } = this.tx;
    this.tx = null;
    if (inverse.length) {
      this._board = applyPatches(this._board, inverse);
      this.emit({ board: this._board, kind: 'rollback' });
    }
  }

  /** Run fn inside a transaction: all its commands become a single undo step. */
  transaction<T>(label: string, fn: () => T): T {
    this.begin(label);
    try {
      const r = fn();
      this.commit();
      return r;
    } catch (e) {
      this.rollback();
      throw e;
    }
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const e = this.past.pop()!;
    this._board = applyPatches(this._board, e.inverse);
    this.future.push(e);
    this.emit({ board: this._board, kind: 'undo' });
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const e = this.future.pop()!;
    this._board = applyPatches(this._board, e.patches);
    this.past.push(e);
    this.emit({ board: this._board, kind: 'redo' });
    return true;
  }

  /** Load a different board (clears history). */
  load(board: Board): void {
    this._board = board;
    this.past = [];
    this.future = [];
    this.tx = null;
    this.emit({ board, kind: 'load' });
  }

  historyLabels(): { past: string[]; future: string[] } {
    return { past: this.past.map((e) => e.label), future: this.future.map((e) => e.label) };
  }
}

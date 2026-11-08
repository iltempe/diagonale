import { produce } from 'immer';
import type { z } from 'zod';
import type { Board } from '../schema';

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export type CommandDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  /** English description, also used as the AI tool description. */
  description: string;
  schema: S;
  /** Fill generated values (ids) so that `recipe` is deterministic and the args can be replayed. */
  prepare?: (args: z.output<S>, board: Board) => z.output<S>;
  /** Mutates an Immer draft (or returns a replacement board). Must be pure given args. */
  recipe: (draft: Board, args: z.output<S>) => void | Board;
  /** Value returned to the caller (UI/AI/MCP) after applying. */
  result?: (board: Board, args: z.output<S>) => unknown;
};

export function defineCommand<S extends z.ZodTypeAny>(def: CommandDef<S>): CommandDef<S> {
  return def;
}

/** Pure functional form of a command: (board, args) => board. */
export function applyCommand<S extends z.ZodTypeAny>(cmd: CommandDef<S>, board: Board, rawArgs: unknown): Board {
  let args = cmd.schema.parse(rawArgs) as z.output<S>;
  if (cmd.prepare) args = cmd.prepare(args, board);
  return produce(board, (d) => cmd.recipe(d as Board, args)) as Board;
}

export type QueryContext = {
  sequences?: { id: string; name: string; description?: string }[];
};

export type QueryDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  run: (board: Board, args: z.output<S>, ctx: QueryContext) => unknown;
};

export function defineQuery<S extends z.ZodTypeAny>(def: QueryDef<S>): QueryDef<S> {
  return def;
}

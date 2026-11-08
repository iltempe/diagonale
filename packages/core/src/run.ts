import { QUERIES } from './commands/queries';
import type { QueryContext } from './commands/types';
import type { Board } from './schema';

export type QueryResult = { ok: true; result: unknown } | { ok: false; error: string };

/** Run a read-only query by name. Never throws. */
export function runQuery(board: Board, name: string, rawArgs: unknown = {}, ctx: QueryContext = {}): QueryResult {
  const q = QUERIES.find((x) => x.name === name);
  if (!q) return { ok: false, error: `Unknown query: ${name}` };
  const parsed = q.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: `Invalid arguments for ${name}: ${parsed.error.issues[0]?.message}` };
  try {
    return { ok: true, result: (q.run as (b: Board, a: unknown, c: QueryContext) => unknown)(board, parsed.data, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function isQuery(name: string): boolean {
  return QUERIES.some((q) => q.name === name);
}

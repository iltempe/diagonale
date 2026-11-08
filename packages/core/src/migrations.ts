import { normalizeBoard } from './board';
import { BoardSchema, SCHEMA_VERSION, type Board } from './schema';

/**
 * Board migrations. Each entry upgrades from version `from` to `from + 1`.
 * Add a new entry (and a test) whenever SCHEMA_VERSION is bumped.
 */
export const MIGRATIONS: { from: number; migrate: (b: Record<string, unknown>) => Record<string, unknown> }[] = [
  // Version 0 = pre-release drafts without schemaVersion / ball entity.
  {
    from: 0,
    migrate: (b) => ({
      ...b,
      schemaVersion: 1,
      ball: { id: 'ball' },
      phases: ((b.phases as Record<string, unknown>[] | undefined) ?? []).map((p) => ({
        annotations: [],
        easing: 'easeInOut',
        holdMs: 800,
        durationMs: 1500,
        ...p,
      })),
    }),
  },
];

export class BoardParseError extends Error {}

/** Parse unknown JSON (e.g. a .diagonale.json file) into a valid current-version Board. */
export function parseBoard(input: unknown): Board {
  if (!input || typeof input !== 'object') throw new BoardParseError('Not a board object');
  let b = input as Record<string, unknown>;
  let v = typeof b.schemaVersion === 'number' ? b.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new BoardParseError(`Board schemaVersion ${v} is newer than supported ${SCHEMA_VERSION}`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS.find((x) => x.from === v);
    if (!m) throw new BoardParseError(`No migration from version ${v}`);
    b = m.migrate(b);
    v++;
  }
  const res = BoardSchema.safeParse(b);
  if (!res.success) {
    const i = res.error.issues[0];
    throw new BoardParseError(`Invalid board: ${i?.path.join('.')} ${i?.message}`);
  }
  return normalizeBoard(res.data);
}

export function serializeBoard(board: Board): string {
  return JSON.stringify(board, null, 2);
}

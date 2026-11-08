import Dexie, { type Table } from 'dexie';
import type { Board, MatchPlan, Sequence, Session, TeamCentre } from '@diagonale/core';

export type BoardRow = { id: string; title: string; kind: string; updatedAt: string; data: Board };
export type SequenceRow = { id: string; name: string; createdAt: string; data: Sequence };
export type SessionRow = { id: string; date: string; updatedAt: string; data: Session };
export type MatchPlanRow = { id: string; date: string; updatedAt: string; data: MatchPlan };
export type TeamCentreRow = { id: string; updatedAt: string; data: TeamCentre };
export type TalkRow = { boardId: string; blob: Blob; mime: string; durationMs: number; createdAt: string };
export type KV = { key: string; value: unknown };

/** Local-first storage (IndexedDB). API keys live in `secrets` and are never synced. */
class DiagonaleDB extends Dexie {
  boards!: Table<BoardRow, string>;
  sequences!: Table<SequenceRow, string>;
  settings!: Table<KV, string>;
  secrets!: Table<KV, string>;
  sessions!: Table<SessionRow, string>;
  matchPlans!: Table<MatchPlanRow, string>;
  teamCentres!: Table<TeamCentreRow, string>;
  talks!: Table<TalkRow, string>;

  constructor() {
    super('diagonale');
    this.version(1).stores({
      boards: 'id, updatedAt, title',
      sequences: 'id, name, createdAt',
      settings: 'key',
      secrets: 'key',
    });
    this.version(2).stores({
      sessions: 'id, date, updatedAt',
      matchPlans: 'id, date, updatedAt',
      teamCentres: 'id, updatedAt',
      talks: 'boardId',
    });
  }
}

export const db = new DiagonaleDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.get(key);
    return (row?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch {
    /* storage unavailable */
  }
}

export async function getSecret(key: string): Promise<string | undefined> {
  return (await db.secrets.get(key))?.value as string | undefined;
}

export async function setSecret(key: string, value: string): Promise<void> {
  await db.secrets.put({ key, value });
}

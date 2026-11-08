import { newId } from './ids';
import { DEFAULT_PITCH } from './pitch';
import {
  BALL_ID,
  SCHEMA_VERSION,
  type Anchor,
  type Board,
  type BoardKind,
  type Kit,
  type Phase,
  type PitchConfig,
  type Player,
  type Position,
  type Team,
} from './schema';

export const DEFAULT_KITS: { home: Kit; away: Kit } = {
  home: { primary: '#D7263D', secondary: '#FFFFFF', number: '#FFFFFF', gkPrimary: '#2BB673' },
  away: { primary: '#1F5FAD', secondary: '#FFFFFF', number: '#FFFFFF', gkPrimary: '#F28C28' },
};

export type TeamRef = 'home' | 'away' | string;

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeTeam(side: 'home' | 'away', name?: string, id?: string): Team {
  return {
    id: id ?? side,
    name: name ?? (side === 'home' ? 'Home' : 'Away'),
    kit: { ...DEFAULT_KITS[side] },
    players: [],
  };
}

export function makePhase(positions: Record<string, Position> = {}, partial: Partial<Phase> = {}): Phase {
  return {
    id: partial.id ?? newId('ph_'),
    durationMs: 1500,
    holdMs: 800,
    easing: 'easeInOut',
    positions,
    annotations: [],
    ...partial,
  };
}

export type CreateBoardOptions = {
  id?: string;
  title?: string;
  kind?: BoardKind;
  pitch?: Partial<PitchConfig>;
  homeName?: string;
  awayName?: string;
  withAway?: boolean;
};

export function createEmptyBoard(opts: CreateBoardOptions = {}): Board {
  const pitch: PitchConfig = { ...DEFAULT_PITCH, ...opts.pitch };
  if (opts.kind === 'training' && !opts.pitch?.markings) pitch.markings = 'outline';
  const teams: Team[] = [makeTeam('home', opts.homeName)];
  if (opts.withAway !== false) teams.push(makeTeam('away', opts.awayName));
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? newId('b_'),
    title: opts.title ?? '',
    kind: opts.kind ?? 'tactic',
    pitch,
    teams,
    ball: { id: BALL_ID },
    phases: [makePhase({ [BALL_ID]: { x: pitch.length / 2, y: pitch.width / 2 } }, { holdMs: 1000 })],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Resolve 'home' | 'away' | team id to the team (or undefined). */
export function findTeam(board: Board, ref: TeamRef): Team | undefined {
  if (ref === 'home') return board.teams[0];
  if (ref === 'away') return board.teams[1];
  return board.teams.find((t) => t.id === ref);
}

export function teamSide(board: Board, teamId: string): 'home' | 'away' {
  return board.teams[0]?.id === teamId ? 'home' : 'away';
}

export function allPlayers(board: Board): Player[] {
  return board.teams.flatMap((t) => t.players);
}

export function findPlayer(board: Board, playerId: string): Player | undefined {
  for (const t of board.teams) {
    const p = t.players.find((pl) => pl.id === playerId);
    if (p) return p;
  }
  return undefined;
}

export function entityIds(board: Board): string[] {
  return [...allPlayers(board).map((p) => p.id), BALL_ID];
}

export function entityExists(board: Board, id: string): boolean {
  return id === BALL_ID || !!findPlayer(board, id);
}

export function anchorIsEntity(a: Anchor): a is { entityId: string } {
  return 'entityId' in a;
}

/**
 * Restore board invariants in place (works on Immer drafts):
 * - every entity has a position in every phase (carried over from the previous phase);
 * - positions/paths of deleted entities are dropped;
 * - arrows anchored to deleted entities are dropped;
 * - invalid ball carriers are cleared.
 */
export function normalizeBoard(board: Board): Board {
  const ids = entityIds(board);
  const idSet = new Set(ids);
  const centre: Position = { x: board.pitch.length / 2, y: board.pitch.width / 2 };
  let prev: Record<string, Position> | undefined;
  for (const phase of board.phases) {
    for (const key of Object.keys(phase.positions)) {
      if (!idSet.has(key)) delete phase.positions[key];
    }
    if (phase.paths) {
      for (const key of Object.keys(phase.paths)) {
        if (!idSet.has(key)) delete phase.paths[key];
      }
    }
    for (const id of ids) {
      if (!phase.positions[id]) {
        const from = prev?.[id] ?? centre;
        phase.positions[id] = { ...from };
      }
    }
    phase.annotations = phase.annotations.filter((a) => {
      if (a.type !== 'arrow') return true;
      return (
        (!anchorIsEntity(a.from) || idSet.has(a.from.entityId)) &&
        (!anchorIsEntity(a.to) || idSet.has(a.to.entityId))
      );
    });
    if (phase.ballCarrierId && !idSet.has(phase.ballCarrierId)) delete phase.ballCarrierId;
    prev = phase.positions;
  }
  return board;
}

export function playerLabel(p: Player): string {
  return p.shortName ?? p.name ?? (p.number != null ? `#${p.number}` : p.id);
}

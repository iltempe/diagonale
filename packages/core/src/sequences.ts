import { allPlayers, entityIds, findPlayer, makePhase, makeTeam, normalizeBoard } from './board';
import {
  BALL_ID,
  SequenceSchema,
  type Anchor,
  type Annotation,
  type Board,
  type PathHint,
  type Phase,
  type Player,
  type Position,
  type Sequence,
  type Vec2,
} from './schema';

type ApplyOpts = {
  mode: 'append' | 'replace';
  binding?: Record<string, string>;
  createMissing?: boolean;
  seed: string;
};

/** Bind sequence slots to board players: explicit binding, then same role, then any outfield player. */
export function bindSlots(
  board: Board,
  seq: Sequence,
  binding: Record<string, string> = {},
): Record<string, string | undefined> {
  const used = new Set<string>();
  const out: Record<string, string | undefined> = {};
  for (const slot of seq.slots) {
    const explicit = binding[slot.slotId];
    if (explicit && findPlayer(board, explicit)) {
      out[slot.slotId] = explicit;
      used.add(explicit);
    }
  }
  const teamFor = (side: 'home' | 'away') => (side === 'home' ? board.teams[0] : board.teams[1]);
  // pass 1: role match
  for (const slot of seq.slots) {
    if (out[slot.slotId]) continue;
    const team = teamFor(slot.team);
    const p = team?.players.find((pl) => !used.has(pl.id) && slot.role && pl.role === slot.role);
    if (p) {
      out[slot.slotId] = p.id;
      used.add(p.id);
    }
  }
  // pass 2: any compatible player
  for (const slot of seq.slots) {
    if (out[slot.slotId]) continue;
    const team = teamFor(slot.team);
    const wantGk = slot.role === 'GK';
    const p = team?.players.find((pl) => !used.has(pl.id) && (pl.role === 'GK') === wantGk);
    if (p) {
      out[slot.slotId] = p.id;
      used.add(p.id);
    }
  }
  return out;
}

export function applySequenceToDraft(d: Board, rawSeq: Sequence, opts: ApplyOpts): void {
  const seq = SequenceSchema.parse(rawSeq);
  const bound = bindSlots(d, seq, opts.binding);
  const sx = seq.pitch ? d.pitch.length / seq.pitch.length : 1;
  const sy = seq.pitch ? d.pitch.width / seq.pitch.width : 1;

  // create missing players
  for (const slot of seq.slots) {
    if (bound[slot.slotId] || opts.createMissing === false) continue;
    if (slot.team === 'away' && !d.teams[1]) d.teams.push(makeTeam('away'));
    const team = slot.team === 'home' ? d.teams[0]! : d.teams[1]!;
    const id = `p_${opts.seed}_${slot.slotId}`.slice(0, 40);
    const p: Player = { id, teamId: team.id, ...(slot.role ? { role: slot.role } : {}) };
    team.players.push(p);
    bound[slot.slotId] = id;
  }

  const base: Phase = opts.mode === 'append' ? d.phases[d.phases.length - 1]! : d.phases[0]!;
  const ballOrigin: Vec2 = base.positions[BALL_ID] ?? { x: d.pitch.length / 2, y: d.pitch.width / 2 };
  const tx = (p: Vec2): Vec2 =>
    seq.coordinateFrame === 'relative_to_ball'
      ? { x: round(ballOrigin.x + p.x), y: round(ballOrigin.y + p.y) }
      : { x: round(p.x * sx), y: round(p.y * sy) };
  const mapId = (id: string): string | undefined => (id === BALL_ID ? BALL_ID : bound[id]);
  const mapAnchor = (a: Anchor): Anchor | undefined => {
    if ('entityId' in a) {
      const m = mapId(a.entityId);
      return m ? { entityId: m } : undefined;
    }
    return tx(a);
  };

  const newPhases: Phase[] = [];
  let prev = base.positions;
  seq.phases.forEach((sp, k) => {
    const positions: Record<string, Position> = JSON.parse(JSON.stringify(prev));
    for (const [slotId, pos] of Object.entries(sp.positions)) {
      const id = mapId(slotId);
      if (!id) continue;
      positions[id] = { ...tx(pos), ...(pos.facing !== undefined ? { facing: pos.facing } : {}) };
    }
    const paths: Record<string, PathHint> = {};
    for (const [slotId, path] of Object.entries(sp.paths ?? {})) {
      const id = mapId(slotId);
      if (!id) continue;
      paths[id] = path.type === 'curve' ? { type: 'curve', control: tx(path.control) } : path;
    }
    const annotations: Annotation[] = [];
    sp.annotations.forEach((a, i) => {
      const id = `a_${opts.seed}_${k}_${i}`;
      const mapped = mapAnnotation(a, id, tx, mapAnchor);
      if (mapped) annotations.push(mapped);
    });
    const carrier = sp.ballCarrier ? mapId(sp.ballCarrier) : undefined;
    const ph = makePhase(positions, {
      id: `ph_${opts.seed}_${k}`,
      durationMs: opts.mode === 'replace' && k === 0 ? 0 : sp.durationMs,
      holdMs: sp.holdMs ?? 800,
      ...(sp.label ? { label: sp.label } : {}),
      ...(Object.keys(paths).length ? { paths } : {}),
      annotations,
      ...(carrier ? { ballCarrierId: carrier } : {}),
    });
    newPhases.push(ph);
    prev = positions;
  });

  if (opts.mode === 'replace') d.phases = newPhases;
  else d.phases.push(...newPhases);
  d.sequencesUsed = [...new Set([...(d.sequencesUsed ?? []), seq.id])];
  normalizeBoard(d);
}

function mapAnnotation(
  a: Annotation,
  id: string,
  tx: (p: Vec2) => Vec2,
  mapAnchor: (a: Anchor) => Anchor | undefined,
): Annotation | undefined {
  switch (a.type) {
    case 'arrow': {
      const from = mapAnchor(a.from);
      const to = mapAnchor(a.to);
      if (!from || !to) return undefined;
      return { ...a, id, from, to, ...(a.control ? { control: tx(a.control) } : {}) };
    }
    case 'zone':
    case 'line':
      return { ...a, id, points: a.points.map(tx) };
    case 'text':
    case 'equipment':
      return { ...a, id, at: tx(a.at) };
  }
}

/**
 * Build a reusable Sequence from a range of board phases (players become role slots).
 * This is the `saveSequence` operation: it does not mutate the board.
 */
export function extractSequence(
  board: Board,
  opts: { id: string; name: string; description?: string; fromPhase?: number; toPhase?: number },
): Sequence {
  const from = opts.fromPhase ?? 0;
  const to = opts.toPhase ?? board.phases.length - 1;
  const players = allPlayers(board);
  const slotOf = new Map<string, string>();
  const slots: Sequence['slots'] = players.map((p, i) => {
    const slotId = `s${i + 1}`;
    slotOf.set(p.id, slotId);
    return {
      slotId,
      team: board.teams[0]?.id === p.teamId ? ('home' as const) : ('away' as const),
      ...(p.role ? { role: p.role } : {}),
    };
  });
  const mapId = (id: string) => (id === BALL_ID ? BALL_ID : slotOf.get(id));
  const ids = entityIds(board);
  const phases = board.phases.slice(from, to + 1).map((ph) => {
    const positions: Record<string, Position> = {};
    for (const id of ids) {
      const s = mapId(id);
      if (s && ph.positions[id]) positions[s] = ph.positions[id]!;
    }
    const paths: Record<string, PathHint> = {};
    for (const [id, p] of Object.entries(ph.paths ?? {})) {
      const s = mapId(id);
      if (s) paths[s] = p;
    }
    const annotations = ph.annotations
      .map((a) => {
        if (a.type !== 'arrow') return a;
        const m = (an: Anchor): Anchor | undefined =>
          'entityId' in an ? (mapId(an.entityId) ? { entityId: mapId(an.entityId)! } : undefined) : an;
        const f = m(a.from);
        const t = m(a.to);
        return f && t ? { ...a, from: f, to: t } : undefined;
      })
      .filter((a): a is Annotation => !!a);
    return {
      durationMs: ph.durationMs,
      holdMs: ph.holdMs,
      ...(ph.label ? { label: ph.label } : {}),
      positions,
      ...(Object.keys(paths).length ? { paths } : {}),
      annotations,
      ...(ph.ballCarrierId && mapId(ph.ballCarrierId) ? { ballCarrier: mapId(ph.ballCarrierId) } : {}),
    };
  });
  return {
    id: opts.id,
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    slots,
    phases,
    coordinateFrame: 'absolute',
    pitch: { length: board.pitch.length, width: board.pitch.width },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

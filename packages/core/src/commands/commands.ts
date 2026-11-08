import { z } from 'zod';
import {
  createEmptyBoard,
  entityExists,
  findPlayer,
  findTeam,
  makePhase,
  makeTeam,
  teamSide,
  type TeamRef,
} from '../board';
import { formationPosition, getFormation } from '../formations';
import { newId } from '../ids';
import { applySequenceToDraft } from '../sequences';
import { getRoutine } from '../routines';
import {
  AnnotationSchema,
  ArrowAnnotationSchema,
  BALL_ID,
  BoardKindSchema,
  CameraSpecSchema,
  EasingSchema,
  EquipmentAnnotationSchema,
  KitSchema,
  LineAnnotationSchema,
  PathHintSchema,
  PitchConfigSchema,
  PositionSchema,
  RoleSchema,
  SequenceSchema,
  TextAnnotationSchema,
  ZoneAnnotationSchema,
  type Annotation,
  type Board,
  type Phase,
  type Player,
  type Team,
} from '../schema';
import { CommandError, defineCommand } from './types';

// ---------- shared arg schemas ----------

const teamRef = z
  .string()
  .min(1)
  .describe("Team reference: 'home', 'away' or a team id");
const phaseIndex = z.number().int().min(0).describe('0-based phase index');
const entityId = z.string().min(1).describe("Player id or 'ball'");

const optionalId = { id: z.string().min(1).optional().describe('Optional explicit id (generated if omitted)') };

export const AnnotationInputSchema = z.discriminatedUnion('type', [
  ArrowAnnotationSchema.extend(optionalId),
  ZoneAnnotationSchema.extend(optionalId),
  LineAnnotationSchema.extend(optionalId),
  TextAnnotationSchema.extend(optionalId),
  EquipmentAnnotationSchema.extend(optionalId),
]);

// ---------- helpers ----------

function requireTeam(board: Board, ref: TeamRef): Team {
  const t = findTeam(board, ref);
  if (!t) throw new CommandError(`Team not found: ${ref}`);
  return t;
}

function requirePhase(board: Board, i: number): Phase {
  const p = board.phases[i];
  if (!p) throw new CommandError(`Phase ${i} does not exist (board has ${board.phases.length} phases)`);
  return p;
}

function requireEntity(board: Board, id: string): void {
  if (!entityExists(board, id)) throw new CommandError(`Entity not found: ${id}`);
}

function ensureAway(board: Board): Team {
  if (!board.teams[1]) board.teams.push(makeTeam('away'));
  return board.teams[1]!;
}

function resolveOrCreateTeam(board: Board, ref: TeamRef): Team {
  if (ref === 'away') return ensureAway(board);
  return requireTeam(board, ref);
}

function touch(board: Board): void {
  board.updatedAt = new Date().toISOString();
}

const SAME = 0.01;

// ---------- commands ----------

export const createBoard = defineCommand({
  name: 'createBoard',
  description:
    'Create a new empty board, replacing the current one. Pitch defaults to 105x68 m full view. The board starts with one phase and the ball on the centre spot.',
  schema: z.object({
    id: z.string().optional(),
    title: z.string().max(200).optional(),
    kind: BoardKindSchema.optional(),
    pitch: PitchConfigSchema.partial().optional(),
    homeName: z.string().optional(),
    awayName: z.string().optional(),
    withAway: z.boolean().optional().describe('Create the opponent team (default true)'),
  }),
  prepare: (a) => ({ ...a, id: a.id ?? newId('b_') }),
  recipe: (_d, a) => createEmptyBoard(a),
  result: (b) => ({ boardId: b.id }),
});

export const setBoardMeta = defineCommand({
  name: 'setBoardMeta',
  description: 'Set the board title and/or kind.',
  schema: z.object({ title: z.string().max(200).optional(), kind: BoardKindSchema.optional() }),
  recipe: (d, a) => {
    if (a.title !== undefined) d.title = a.title;
    if (a.kind !== undefined) d.kind = a.kind;
    touch(d);
  },
});

export const setPitch = defineCommand({
  name: 'setPitch',
  description:
    'Change pitch settings: dimensions in meters, visible view (full, half_attack, half_defence, thirds, box, wide_left, wide_right or custom rect), surface, orientation, perspective, training grid (null removes it), markings.',
  schema: PitchConfigSchema.extend({
    grid: z.object({ cellMeters: z.number().positive(), visible: z.boolean() }).nullable().optional(),
  }).partial(),
  recipe: (d, a) => {
    const { grid, ...rest } = a;
    Object.assign(d.pitch, rest);
    if (grid === null) delete d.pitch.grid;
    else if (grid) d.pitch.grid = grid;
    touch(d);
  },
});

export const setTeam = defineCommand({
  name: 'setTeam',
  description:
    "Rename a team. Using team 'away' creates the opponent team if missing. remove=true deletes the away team and its players.",
  schema: z.object({ team: teamRef, name: z.string().max(80).optional(), remove: z.boolean().optional() }),
  recipe: (d, a) => {
    if (a.remove) {
      const t = requireTeam(d, a.team);
      if (t === d.teams[0]) throw new CommandError('The home team cannot be removed');
      d.teams.splice(1, 1);
    } else {
      const t = resolveOrCreateTeam(d, a.team);
      if (a.name !== undefined) t.name = a.name;
    }
    touch(d);
  },
});

export const setKit = defineCommand({
  name: 'setKit',
  description: 'Set kit colors (#RRGGBB) of a team: primary, secondary, number, gkPrimary (goalkeeper shirt).',
  schema: KitSchema.partial().extend({ team: teamRef }),
  recipe: (d, { team, ...kit }) => {
    const t = resolveOrCreateTeam(d, team);
    Object.assign(t.kit, kit);
    touch(d);
  },
});

const playerFields = {
  number: z.number().int().min(0).max(999).optional(),
  name: z.string().max(80).optional(),
  shortName: z.string().max(24).optional(),
  role: RoleSchema.optional(),
  photoUrl: z.string().optional(),
  flag: z.string().length(2).optional(),
};

export const addPlayer = defineCommand({
  name: 'addPlayer',
  description:
    'Add a player to a team. If x/y (meters) are given the player is placed there in every phase; otherwise near the centre of the own half.',
  schema: z.object({
    team: teamRef,
    ...optionalId,
    ...playerFields,
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  prepare: (a) => ({ ...a, id: a.id ?? newId('p_') }),
  recipe: (d, a) => {
    const t = resolveOrCreateTeam(d, a.team);
    if (findPlayer(d, a.id!)) throw new CommandError(`Player id already exists: ${a.id}`);
    const { team: _t, x, y, id, ...fields } = a;
    const player: Player = { id: id!, teamId: t.id, ...fields };
    t.players.push(player);
    const side = teamSide(d, t.id);
    const pos =
      x !== undefined && y !== undefined
        ? { x, y }
        : { x: side === 'home' ? d.pitch.length * 0.3 : d.pitch.length * 0.7, y: d.pitch.width / 2 };
    for (const ph of d.phases) ph.positions[player.id] = { ...pos };
    touch(d);
  },
  result: (_b, a) => ({ playerId: a.id }),
});

export const updatePlayer = defineCommand({
  name: 'updatePlayer',
  description: 'Update player data (number, name, shortName, role, photoUrl, flag). Use null to clear a field.',
  schema: z.object({
    playerId: z.string().min(1),
    number: z.number().int().min(0).max(999).nullable().optional(),
    name: z.string().max(80).nullable().optional(),
    shortName: z.string().max(24).nullable().optional(),
    role: RoleSchema.nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    flag: z.string().length(2).nullable().optional(),
  }),
  recipe: (d, { playerId, ...fields }) => {
    const p = findPlayer(d, playerId);
    if (!p) throw new CommandError(`Player not found: ${playerId}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete (p as Record<string, unknown>)[k];
      else (p as Record<string, unknown>)[k] = v;
    }
    touch(d);
  },
});

export const removePlayer = defineCommand({
  name: 'removePlayer',
  description: 'Remove a player from the roster and from every phase (arrows anchored to it are removed).',
  schema: z.object({ playerId: z.string().min(1) }),
  recipe: (d, a) => {
    let found = false;
    for (const t of d.teams) {
      const i = t.players.findIndex((p) => p.id === a.playerId);
      if (i >= 0) {
        t.players.splice(i, 1);
        found = true;
      }
    }
    if (!found) throw new CommandError(`Player not found: ${a.playerId}`);
    touch(d);
  },
});

export const applyFormation = defineCommand({
  name: 'applyFormation',
  description:
    "Place a team in a formation (e.g. '4-3-3', '4-4-2', '3-5-2'; see listFormations) in a phase. Missing players are created with role and shirt number. Home attacks towards +x (left to right), away is mirrored. allPhases=true applies the positions to every phase.",
  schema: z.object({
    team: teamRef,
    formationId: z.string().min(1),
    phase: phaseIndex.optional().describe('Target phase (default 0)'),
    allPhases: z.boolean().optional(),
    createMissing: z.boolean().optional().describe('Create missing players (default true)'),
    playerIds: z.array(z.string()).optional().describe('Ids to use for created players (generated if omitted)'),
  }),
  prepare: (a, board) => {
    const f = getFormation(a.formationId);
    if (!f) throw new CommandError(`Unknown formation: ${a.formationId}`);
    const team = findTeam(board, a.team);
    const existing = team?.players.length ?? 0;
    const missing = Math.max(0, f.slots.length - existing);
    const ids = [...(a.playerIds ?? [])];
    while (ids.length < missing) ids.push(newId('p_'));
    return { ...a, playerIds: ids };
  },
  recipe: (d, a) => {
    const f = getFormation(a.formationId);
    if (!f) throw new CommandError(`Unknown formation: ${a.formationId}`);
    const t = resolveOrCreateTeam(d, a.team);
    const side = teamSide(d, t.id);
    const target = a.phase ?? 0;
    requirePhase(d, target);
    // Match existing players to slots: same role first, then in roster order.
    const free = [...t.players];
    const assignment: (Player | undefined)[] = f.slots.map((slot) => {
      const i = free.findIndex((p) => p.role === slot.role);
      return i >= 0 ? free.splice(i, 1)[0] : undefined;
    });
    const ids = [...(a.playerIds ?? [])];
    f.slots.forEach((slot, i) => {
      if (assignment[i]) return;
      const next = free.shift();
      if (next) {
        assignment[i] = next;
        return;
      }
      if (a.createMissing === false) return;
      const usedNumbers = new Set(t.players.map((p) => p.number));
      const number = usedNumbers.has(slot.number) ? undefined : slot.number;
      const id = ids.shift() ?? newId('p_');
      const p: Player = { id, teamId: t.id, role: slot.role, ...(number != null ? { number } : {}) };
      t.players.push(p);
      assignment[i] = p;
      const pos = formationPosition(slot, side, d.pitch);
      for (const ph of d.phases) ph.positions[id] = { ...pos };
    });
    f.slots.forEach((slot, i) => {
      const p = assignment[i];
      if (!p) return;
      const pos = formationPosition(slot, side, d.pitch);
      const phases = a.allPhases ? d.phases : [d.phases[target]!];
      for (const ph of phases) ph.positions[p.id] = { ...pos };
    });
    touch(d);
  },
  result: (b, a) => {
    const t = findTeam(b, a.team);
    return {
      team: t?.id,
      players: t?.players.map((p) => ({ id: p.id, role: p.role, number: p.number })),
    };
  },
});

export const addPhase = defineCommand({
  name: 'addPhase',
  description:
    'Insert a new phase after the given index (default: after the last one), duplicating that phase positions. Returns the new phase index.',
  schema: z.object({
    ...optionalId,
    after: phaseIndex.optional(),
    label: z.string().max(120).optional(),
    durationMs: z.number().int().min(0).max(60000).optional(),
    holdMs: z.number().int().min(0).max(60000).optional(),
    easing: EasingSchema.optional(),
    copyAnnotations: z.boolean().optional().describe('Also copy annotations (default false)'),
  }),
  prepare: (a) => ({ ...a, id: a.id ?? newId('ph_') }),
  recipe: (d, a) => {
    const after = a.after ?? d.phases.length - 1;
    const src = requirePhase(d, after);
    const ph = makePhase(structuredCloneSafe(src.positions), {
      id: a.id!,
      durationMs: a.durationMs ?? 1500,
      holdMs: a.holdMs ?? 800,
      easing: a.easing ?? src.easing,
      ...(a.label ? { label: a.label } : {}),
      ...(src.ballCarrierId ? { ballCarrierId: src.ballCarrierId } : {}),
      ...(src.camera ? { camera: { ...src.camera } } : {}),
    });
    if (a.copyAnnotations) {
      ph.annotations = src.annotations.map((x) => ({ ...structuredCloneSafe(x), id: newIdFrom(a.id!, x.id) }));
    }
    d.phases.splice(after + 1, 0, ph);
    touch(d);
  },
  result: (b, a) => ({ phase: b.phases.findIndex((p) => p.id === a.id), phaseId: a.id }),
});

export const removePhase = defineCommand({
  name: 'removePhase',
  description: 'Remove a phase. A board always keeps at least one phase.',
  schema: z.object({ phase: phaseIndex }),
  recipe: (d, a) => {
    requirePhase(d, a.phase);
    if (d.phases.length <= 1) throw new CommandError('Cannot remove the only phase');
    d.phases.splice(a.phase, 1);
    touch(d);
  },
});

export const reorderPhase = defineCommand({
  name: 'reorderPhase',
  description: 'Move a phase from one index to another.',
  schema: z.object({ from: phaseIndex, to: phaseIndex }),
  recipe: (d, a) => {
    requirePhase(d, a.from);
    requirePhase(d, a.to);
    const [ph] = d.phases.splice(a.from, 1);
    d.phases.splice(a.to, 0, ph!);
    touch(d);
  },
});

export const updatePhase = defineCommand({
  name: 'updatePhase',
  description:
    'Update phase settings: label, notes, durationMs (transition towards this phase), holdMs (pause at the end), easing, camera (null = fixed), ballCarrierId (null clears).',
  schema: z.object({
    phase: phaseIndex,
    label: z.string().max(120).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    durationMs: z.number().int().min(0).max(60000).optional(),
    holdMs: z.number().int().min(0).max(60000).optional(),
    easing: EasingSchema.optional(),
    camera: CameraSpecSchema.nullable().optional(),
    ballCarrierId: z.string().nullable().optional(),
  }),
  recipe: (d, { phase, ...f }) => {
    const ph = requirePhase(d, phase);
    if (f.ballCarrierId) requireEntity(d, f.ballCarrierId);
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined) continue;
      if (v === null) delete (ph as Record<string, unknown>)[k];
      else (ph as Record<string, unknown>)[k] = v;
    }
    touch(d);
  },
});

const moveSchema = z.object({
  entityId,
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.number().finite().optional(),
});

function moveInPhase(d: Board, phase: number, m: z.infer<typeof moveSchema>, propagate: boolean) {
  requireEntity(d, m.entityId);
  const ph = requirePhase(d, phase);
  const old = ph.positions[m.entityId];
  const next = { x: m.x, y: m.y, ...(m.facing !== undefined ? { facing: m.facing } : old?.facing !== undefined ? { facing: old.facing } : {}) };
  ph.positions[m.entityId] = next;
  if (propagate && old) {
    for (let j = phase + 1; j < d.phases.length; j++) {
      const pj = d.phases[j]!.positions[m.entityId];
      if (!pj || Math.abs(pj.x - old.x) > SAME || Math.abs(pj.y - old.y) > SAME) break;
      d.phases[j]!.positions[m.entityId] = { ...next };
    }
  }
}

export const moveEntity = defineCommand({
  name: 'moveEntity',
  description:
    "Set the position (meters) of a player or the ball ('ball') in a phase. propagate=true also moves it in following phases where it had the same old position.",
  schema: moveSchema.extend({ phase: phaseIndex, propagate: z.boolean().optional() }),
  recipe: (d, { phase, propagate, ...m }) => {
    moveInPhase(d, phase, m, !!propagate);
    touch(d);
  },
});

export const moveEntities = defineCommand({
  name: 'moveEntities',
  description: 'Batch move several entities (players and/or ball) in one phase. Prefer this over many moveEntity calls.',
  schema: z.object({ phase: phaseIndex, moves: z.array(moveSchema).min(1), propagate: z.boolean().optional() }),
  recipe: (d, a) => {
    for (const m of a.moves) moveInPhase(d, a.phase, m, !!a.propagate);
    touch(d);
  },
});

export const setPath = defineCommand({
  name: 'setPath',
  description:
    "Set how an entity travels from the previous phase into this phase: straight, curve (quadratic bezier control point in meters) or lofted (ball only, peak height in meters). null resets to straight.",
  schema: z.object({ phase: phaseIndex, entityId, path: PathHintSchema.nullable() }),
  recipe: (d, a) => {
    requireEntity(d, a.entityId);
    const ph = requirePhase(d, a.phase);
    if (a.path === null) {
      if (ph.paths) delete ph.paths[a.entityId];
    } else {
      if (a.path.type === 'lofted' && a.entityId !== BALL_ID) throw new CommandError('lofted path is for the ball only');
      ph.paths = ph.paths ?? {};
      ph.paths[a.entityId] = a.path;
    }
    touch(d);
  },
});

export const addAnnotation = defineCommand({
  name: 'addAnnotation',
  description:
    "Add an annotation to a phase. Types: arrow (style pass|run|carry|press|lofted|block|shot, from/to anchors: {entityId} follows a player or {x,y} in meters), zone (rect: 2 corner points; ellipse: 2 bounding points; polygon: 3+ points), line, text (size in meters), equipment (cone, pole, mini_goal…).",
  schema: z.object({ phase: phaseIndex, annotation: AnnotationInputSchema }),
  prepare: (a) => ({ ...a, annotation: { ...a.annotation, id: a.annotation.id ?? newId('a_') } }),
  recipe: (d, a) => {
    const ph = requirePhase(d, a.phase);
    const ann = AnnotationSchema.parse(a.annotation);
    if (ann.type === 'arrow') {
      if ('entityId' in ann.from) requireEntity(d, ann.from.entityId);
      if ('entityId' in ann.to) requireEntity(d, ann.to.entityId);
    }
    ph.annotations.push(ann);
    touch(d);
  },
  result: (_b, a) => ({ annotationId: a.annotation.id }),
});

export const updateAnnotation = defineCommand({
  name: 'updateAnnotation',
  description: 'Patch fields of an existing annotation (its type cannot change).',
  schema: z.object({
    phase: phaseIndex,
    annotationId: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  recipe: (d, a) => {
    const ph = requirePhase(d, a.phase);
    const i = ph.annotations.findIndex((x) => x.id === a.annotationId);
    if (i < 0) throw new CommandError(`Annotation not found: ${a.annotationId}`);
    const cur = ph.annotations[i]!;
    const merged = { ...structuredCloneSafe(cur), ...a.patch, id: cur.id, type: cur.type };
    for (const [k, v] of Object.entries(merged)) if (v === null) delete (merged as Record<string, unknown>)[k];
    const parsed = AnnotationSchema.safeParse(merged);
    if (!parsed.success) throw new CommandError(`Invalid annotation patch: ${parsed.error.issues[0]?.message}`);
    ph.annotations[i] = parsed.data;
    touch(d);
  },
});

export const removeAnnotation = defineCommand({
  name: 'removeAnnotation',
  description: 'Remove an annotation from a phase.',
  schema: z.object({ phase: phaseIndex, annotationId: z.string().min(1) }),
  recipe: (d, a) => {
    const ph = requirePhase(d, a.phase);
    const i = ph.annotations.findIndex((x) => x.id === a.annotationId);
    if (i < 0) throw new CommandError(`Annotation not found: ${a.annotationId}`);
    ph.annotations.splice(i, 1);
    touch(d);
  },
});

export const PhaseContentSchema = z.object({
  positions: z.record(z.string(), PositionSchema).optional(),
  annotations: z.array(AnnotationSchema).optional(),
});
export type PhaseContent = z.infer<typeof PhaseContentSchema>;

export const pastePhaseContent = defineCommand({
  name: 'pastePhaseContent',
  description:
    'Paste content previously obtained with copyPhaseContent into a phase. Positions of unknown entities are ignored; pasted annotations get new ids and are appended.',
  schema: z.object({ phase: phaseIndex, content: PhaseContentSchema }),
  prepare: (a) => ({
    ...a,
    content: {
      ...a.content,
      annotations: a.content.annotations?.map((x) => ({ ...x, id: newId('a_') })),
    },
  }),
  recipe: (d, a) => {
    const ph = requirePhase(d, a.phase);
    for (const [id, pos] of Object.entries(a.content.positions ?? {})) {
      if (entityExists(d, id)) ph.positions[id] = { ...pos };
    }
    for (const ann of a.content.annotations ?? []) ph.annotations.push(ann as Annotation);
    touch(d);
  },
});

export const applySequence = defineCommand({
  name: 'applySequence',
  description:
    "Apply a reusable Sequence (abstract movement with role slots). Slots are bound to players by role automatically (override with binding {slotId: playerId}); missing players are created. mode 'append' adds phases at the end, 'replace' replaces all phases.",
  schema: z.object({
    sequence: SequenceSchema,
    mode: z.enum(['append', 'replace']).default('append'),
    binding: z.record(z.string(), z.string()).optional(),
    createMissing: z.boolean().optional(),
    seed: z.string().optional().describe('Id seed (internal, generated)'),
  }),
  prepare: (a) => ({ ...a, seed: a.seed ?? newId() }),
  recipe: (d, a) => {
    applySequenceToDraft(d, a.sequence, {
      mode: a.mode,
      binding: a.binding,
      createMissing: a.createMissing,
      seed: a.seed!,
    });
    touch(d);
  },
});

export const applySetPieceRoutine = defineCommand({
  name: 'applySetPieceRoutine',
  description:
    "Load a predefined set-piece routine (see listRoutines: corner_near_post, corner_far_post, corner_short, free_kick_wide_outswing, free_kick_central_block). Home attacks the right goal. Default mode 'replace'.",
  schema: z.object({
    routineId: z.string().min(1),
    mode: z.enum(['append', 'replace']).default('replace'),
    binding: z.record(z.string(), z.string()).optional(),
    seed: z.string().optional(),
  }),
  prepare: (a) => ({ ...a, seed: a.seed ?? newId() }),
  recipe: (d, a) => {
    const r = getRoutine(a.routineId);
    if (!r) throw new CommandError(`Unknown routine: ${a.routineId}`);
    applySequenceToDraft(d, r, { mode: a.mode, binding: a.binding, seed: a.seed! });
    if (a.mode === 'replace') d.kind = 'set_piece';
    d.sequencesUsed = [...new Set([...(d.sequencesUsed ?? []), r.id])];
    touch(d);
  },
});

/** Internal: replace the whole board (used to commit an AI preview as a single undoable step). */
export const replaceBoard = defineCommand({
  name: 'replaceBoard',
  description: 'Replace the whole board with the given one (internal).',
  schema: z.object({ board: z.unknown() }),
  recipe: (_d, a) => a.board as Board,
});

// ---------- utils ----------

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function newIdFrom(seed: string, id: string): string {
  return `${id}_${seed.slice(-4)}`;
}

export const COMMANDS = [
  createBoard,
  setBoardMeta,
  setPitch,
  setTeam,
  setKit,
  addPlayer,
  updatePlayer,
  removePlayer,
  applyFormation,
  addPhase,
  removePhase,
  reorderPhase,
  updatePhase,
  moveEntity,
  moveEntities,
  setPath,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  pastePhaseContent,
  applySequence,
  applySetPieceRoutine,
  replaceBoard,
] as const;

/** Commands exposed to AI / MCP (internal ones excluded). */
export const PUBLIC_COMMANDS = COMMANDS.filter((c) => c.name !== 'replaceBoard');

export type CommandName = (typeof COMMANDS)[number]['name'];

import { entityIds } from './board';
import { viewRect } from './pitch';
import {
  BALL_ID,
  type Anchor,
  type Annotation,
  type Board,
  type CameraSpec,
  type Easing,
  type PathHint,
  type Phase,
  type Position,
  type Rect,
  type Vec2,
} from './schema';

export type TimelineSegment = {
  phaseIndex: number;
  /** start of the transition into this phase (== holdStart for phase 0) */
  start: number;
  /** time at which the phase positions are reached */
  holdStart: number;
  end: number;
};

export type Timeline = { segments: TimelineSegment[]; totalMs: number };

export function timeline(board: Board): Timeline {
  const segments: TimelineSegment[] = [];
  let t = 0;
  board.phases.forEach((ph, i) => {
    const start = t;
    const holdStart = i === 0 ? t : t + ph.durationMs;
    const end = holdStart + ph.holdMs;
    segments.push({ phaseIndex: i, start, holdStart, end });
    t = end;
  });
  return { segments, totalMs: t };
}

/** Time at which phase i is fully reached (start of its hold). */
export function phaseTime(board: Board, i: number): number {
  const tl = timeline(board);
  return tl.segments[Math.max(0, Math.min(i, tl.segments.length - 1))]!.holdStart;
}

export type EntityFrame = Position & { height?: number };

export type AnnotationFrame = {
  annotation: Annotation;
  phaseIndex: number;
  opacity: number;
};

export type FrameState = {
  t: number;
  /** phase being shown or transitioned into */
  phaseIndex: number;
  /** 0..1 raw transition progress (1 while holding) */
  progress: number;
  inTransition: boolean;
  entities: Record<string, EntityFrame>;
  annotations: AnnotationFrame[];
  /** Visible rectangle in meters. */
  camera: Rect;
  ballCarrierId?: string;
};

export type EvaluateOptions = {
  annotationTransition?: 'fade' | 'cut';
};

export function ease(e: Easing, p: number): number {
  const x = Math.min(1, Math.max(0, p));
  switch (e) {
    case 'linear':
      return x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

export function quadBezier(a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function interpolate(from: Position, to: Position, path: PathHint | undefined, p: number): EntityFrame {
  let xy: Vec2;
  let height: number | undefined;
  if (path?.type === 'curve') xy = quadBezier(from, path.control, to, p);
  else xy = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
  if (path?.type === 'lofted') height = 4 * path.peakHeight * p * (1 - p);
  const out: EntityFrame = { x: xy.x, y: xy.y };
  if (from.facing !== undefined || to.facing !== undefined) {
    out.facing = lerpAngle(from.facing ?? to.facing ?? 0, to.facing ?? from.facing ?? 0, p);
  }
  if (height !== undefined) out.height = height;
  return out;
}

/**
 * Default ball path (spec §7): if the arrival phase (or, failing that, the departure phase)
 * holds a pass/lofted/shot arrow starting from the ball carrier, the ball follows that arrow's
 * shape (curve control / loft) between its two phase positions. Explicit paths.ball wins.
 */
export function ballPathFor(board: Board, phaseIndex: number): PathHint | undefined {
  const to = board.phases[phaseIndex];
  const from = board.phases[phaseIndex - 1];
  if (!to) return undefined;
  if (to.paths?.[BALL_ID]) return to.paths[BALL_ID];
  const carrier = from?.ballCarrierId;
  const candidates = [...to.annotations, ...(from?.annotations ?? [])];
  for (const a of candidates) {
    if (a.type !== 'arrow') continue;
    if (!['pass', 'lofted', 'shot'].includes(a.style)) continue;
    if (!('entityId' in a.from)) continue;
    if (carrier && a.from.entityId !== carrier) continue;
    if (!carrier && a.from.entityId === BALL_ID) continue;
    if (a.style === 'lofted') return { type: 'lofted', peakHeight: 6 };
    if (a.control) return { type: 'curve', control: a.control };
    return { type: 'straight' };
  }
  return undefined;
}

function entitiesAt(board: Board, segIndex: number, p: number, inTransition: boolean): Record<string, EntityFrame> {
  const to = board.phases[segIndex]!;
  const out: Record<string, EntityFrame> = {};
  const ids = entityIds(board);
  if (!inTransition || segIndex === 0) {
    for (const id of ids) {
      const pos = to.positions[id];
      if (pos) out[id] = { ...pos };
    }
    return out;
  }
  const from = board.phases[segIndex - 1]!;
  const eased = ease(to.easing, p);
  for (const id of ids) {
    const a = from.positions[id];
    const b = to.positions[id];
    if (!a || !b) {
      if (b ?? a) out[id] = { ...(b ?? a)! };
      continue;
    }
    const path = id === BALL_ID ? ballPathFor(board, segIndex) : to.paths?.[id];
    out[id] = interpolate(a, b, path, eased);
  }
  return out;
}

function locate(board: Board, t: number): { seg: TimelineSegment; p: number; inTransition: boolean } {
  const tl = timeline(board);
  const tt = Math.max(0, Math.min(t, tl.totalMs));
  let seg = tl.segments[tl.segments.length - 1]!;
  for (const s of tl.segments) {
    if (tt <= s.end) {
      seg = s;
      break;
    }
  }
  const dur = seg.holdStart - seg.start;
  const inTransition = dur > 0 && tt < seg.holdStart;
  const p = inTransition ? (tt - seg.start) / dur : 1;
  return { seg, p, inTransition };
}

/** Ball position only (used by the follow-ball camera). */
function ballAt(board: Board, t: number): Vec2 {
  const { seg, p, inTransition } = locate(board, t);
  const e = entitiesAt(board, seg.phaseIndex, p, inTransition)[BALL_ID];
  return e ? { x: e.x, y: e.y } : { x: board.pitch.length / 2, y: board.pitch.width / 2 };
}

const CAMERA_STEP = 1000 / 60;
const CAMERA_OMEGA = 4; // rad/s, critically damped spring stiffness

/** Critically damped follow of the ball, simulated deterministically from t = 0. */
export function smoothedBall(board: Board, t: number): Vec2 {
  let pos = ballAt(board, 0);
  let vel = { x: 0, y: 0 };
  const dt = CAMERA_STEP / 1000;
  for (let time = CAMERA_STEP; time <= t; time += CAMERA_STEP) {
    const target = ballAt(board, time);
    const ax = -2 * CAMERA_OMEGA * vel.x - CAMERA_OMEGA * CAMERA_OMEGA * (pos.x - target.x);
    const ay = -2 * CAMERA_OMEGA * vel.y - CAMERA_OMEGA * CAMERA_OMEGA * (pos.y - target.y);
    vel = { x: vel.x + ax * dt, y: vel.y + ay * dt };
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
  }
  return pos;
}

function cameraRect(board: Board, spec: CameraSpec | undefined, t: number): Rect {
  const base = viewRect(board.pitch, board.pitch.view);
  if (!spec || spec.mode === 'fixed') return base;
  if (spec.mode === 'rect') return { x: spec.x, y: spec.y, w: spec.w, h: spec.h };
  const w = base.w / spec.zoom;
  const h = base.h / spec.zoom;
  const c = smoothedBall(board, t);
  const margin = 3;
  const minX = -margin;
  const maxX = board.pitch.length + margin - w;
  const minY = -margin;
  const maxY = board.pitch.width + margin - h;
  return {
    x: clamp(c.x - w / 2, minX, Math.max(minX, maxX)),
    y: clamp(c.y - h / 2, minY, Math.max(minY, maxY)),
    w,
    h,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

/** Pure: global time (ms) → full frame state. */
export function evaluate(board: Board, tMs: number, opts: EvaluateOptions = {}): FrameState {
  const { seg, p, inTransition } = locate(board, tMs);
  const i = seg.phaseIndex;
  const phase = board.phases[i]!;
  const entities = entitiesAt(board, i, p, inTransition);

  const annotations: AnnotationFrame[] = [];
  const mode = opts.annotationTransition ?? 'fade';
  if (inTransition) {
    const prev = board.phases[i - 1]!;
    const outOp = mode === 'fade' ? Math.max(0, 1 - 2 * p) : 0;
    const inOp = mode === 'fade' ? Math.max(0, 2 * p - 1) : p >= 1 ? 1 : 0;
    if (outOp > 0) for (const a of prev.annotations) annotations.push({ annotation: a, phaseIndex: i - 1, opacity: outOp });
    if (inOp > 0) for (const a of phase.annotations) annotations.push({ annotation: a, phaseIndex: i, opacity: inOp });
  } else {
    for (const a of phase.annotations) annotations.push({ annotation: a, phaseIndex: i, opacity: 1 });
  }

  let camera: Rect;
  if (inTransition) {
    const prev = board.phases[i - 1]!;
    const eased = ease(phase.easing, p);
    const a = cameraRect(board, prev.camera, tMs);
    const b = cameraRect(board, phase.camera, tMs);
    camera = prev.camera?.mode === 'follow_ball' && phase.camera?.mode === 'follow_ball' ? b : lerpRect(a, b, eased);
  } else {
    camera = cameraRect(board, phase.camera, tMs);
  }

  const carrier = inTransition ? (p < 0.5 ? board.phases[i - 1]?.ballCarrierId : phase.ballCarrierId) : phase.ballCarrierId;
  return {
    t: tMs,
    phaseIndex: i,
    progress: p,
    inTransition,
    entities,
    annotations,
    camera,
    ...(carrier ? { ballCarrierId: carrier } : {}),
  };
}

/** Static frame of a phase (editing view). */
export function phaseFrame(board: Board, i: number): FrameState {
  return evaluate(board, phaseTime(board, i));
}

/** Resolve an anchor to coordinates using the current frame. */
export function resolveAnchor(a: Anchor, entities: Record<string, Vec2>): Vec2 {
  if ('entityId' in a) {
    const e = entities[a.entityId];
    return e ? { x: e.x, y: e.y } : { x: 0, y: 0 };
  }
  return { x: a.x, y: a.y };
}

export function phaseOf(board: Board, i: number): Phase | undefined {
  return board.phases[i];
}

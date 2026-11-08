import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyCommand,
  BALL_ID,
  createEmptyBoard,
  Dispatcher,
  FORMATIONS,
  moveEntity,
  sequentialIds,
  setIdGenerator,
  runQuery,
  ROUTINES,
} from '../src';

beforeEach(() => setIdGenerator(sequentialIds()));

const setup = () => {
  const d = new Dispatcher(createEmptyBoard({ id: 'b' }));
  d.dispatch('applyFormation', { team: 'home', formationId: '4-3-3' });
  d.dispatch('addPhase', {});
  d.dispatch('addPhase', {});
  return d;
};

describe('commands', () => {
  it('has ~25 formations with consistent player counts', () => {
    expect(FORMATIONS.length).toBeGreaterThanOrEqual(25);
    for (const f of FORMATIONS) {
      expect(f.slots).toHaveLength(f.players);
      expect(f.slots.filter((s) => s.role === 'GK')).toHaveLength(1);
      for (const s of f.slots) {
        expect(s.depth).toBeGreaterThanOrEqual(0);
        expect(s.depth).toBeLessThanOrEqual(1);
      }
    }
    expect(new Set(FORMATIONS.map((f) => f.id)).size).toBe(FORMATIONS.length);
  });

  it('applyCommand is pure', () => {
    const b = createEmptyBoard({ id: 'b' });
    const next = applyCommand(moveEntity, b, { phase: 0, entityId: BALL_ID, x: 1, y: 2 });
    expect(b.phases[0]!.positions[BALL_ID]).toEqual({ x: 52.5, y: 34 });
    expect(next.phases[0]!.positions[BALL_ID]).toEqual({ x: 1, y: 2 });
  });

  it('moveEntity with propagate moves later unchanged phases', () => {
    const d = setup();
    d.dispatch('moveEntity', { phase: 0, entityId: BALL_ID, x: 10, y: 10, propagate: true });
    expect(d.board.phases.map((p) => p.positions[BALL_ID]!.x)).toEqual([10, 10, 10]);
    d.dispatch('moveEntity', { phase: 2, entityId: BALL_ID, x: 50, y: 10 });
    d.dispatch('moveEntity', { phase: 0, entityId: BALL_ID, x: 20, y: 10, propagate: true });
    expect(d.board.phases.map((p) => p.positions[BALL_ID]!.x)).toEqual([20, 20, 50]);
  });

  it('removePlayer removes positions and anchored arrows', () => {
    const d = setup();
    const p = d.board.teams[0]!.players[3]!;
    d.dispatch('addAnnotation', {
      phase: 1,
      annotation: { type: 'arrow', style: 'run', from: { entityId: p.id }, to: { x: 30, y: 30 } },
    });
    expect(d.board.phases[1]!.annotations).toHaveLength(1);
    d.dispatch('removePlayer', { playerId: p.id });
    expect(d.board.phases[1]!.annotations).toHaveLength(0);
    expect(d.board.phases[0]!.positions[p.id]).toBeUndefined();
  });

  it('addAnnotation returns the id and updateAnnotation validates', () => {
    const d = setup();
    const r = d.dispatch('addAnnotation', {
      phase: 0,
      annotation: { type: 'zone', shape: 'rect', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#ff0000', opacity: 0.3 },
    });
    expect(r.ok).toBe(true);
    const id = (r as { result: { annotationId: string } }).result.annotationId;
    expect(d.dispatch('updateAnnotation', { phase: 0, annotationId: id, patch: { opacity: 0.5 } }).ok).toBe(true);
    expect(d.dispatch('updateAnnotation', { phase: 0, annotationId: id, patch: { opacity: 5 } }).ok).toBe(false);
  });

  it('copy/paste phase content', () => {
    const d = setup();
    d.dispatch('moveEntity', { phase: 0, entityId: BALL_ID, x: 5, y: 5 });
    d.dispatch('addAnnotation', { phase: 0, annotation: { type: 'text', at: { x: 1, y: 1 }, text: 'Hi', size: 2 } });
    const c = runQuery(d.board, 'copyPhaseContent', { phase: 0 });
    expect(c.ok).toBe(true);
    d.dispatch('pastePhaseContent', { phase: 2, content: (c as { result: unknown }).result });
    expect(d.board.phases[2]!.positions[BALL_ID]).toEqual({ x: 5, y: 5 });
    expect(d.board.phases[2]!.annotations[0]!.id).not.toBe(d.board.phases[0]!.annotations[0]!.id);
  });

  it('applies every set-piece routine to a fresh board', () => {
    for (const r of ROUTINES) {
      const d = new Dispatcher(createEmptyBoard());
      const res = d.dispatch('applySetPieceRoutine', { routineId: r.id });
      expect(res.ok, r.id + ' ' + (!res.ok ? res.error : '')).toBe(true);
      expect(d.board.phases).toHaveLength(r.phases.length);
      expect(d.board.kind).toBe('set_piece');
      expect(d.board.teams[0]!.players.length).toBeGreaterThan(0);
    }
  });

  it('saveSequence + applySequence round-trips positions on another board', () => {
    const d = setup();
    const gk = d.board.teams[0]!.players.find((p) => p.role === 'GK')!;
    d.dispatch('moveEntity', { phase: 1, entityId: gk.id, x: 12, y: 30 });
    const seq = runQuery(d.board, 'saveSequence', { id: 'seq1', name: 'Build-up' });
    expect(seq.ok).toBe(true);
    const d2 = new Dispatcher(createEmptyBoard());
    const r = d2.dispatch('applySequence', { sequence: (seq as { result: unknown }).result, mode: 'replace' });
    expect(r.ok).toBe(true);
    const gk2 = d2.board.teams[0]!.players.find((p) => p.role === 'GK')!;
    expect(d2.board.phases[1]!.positions[gk2.id]).toMatchObject({ x: 12, y: 30 });
  });

  it('describeBoard mentions players and phases', () => {
    const d = setup();
    const r = runQuery(d.board, 'describeBoard');
    expect(r.ok && String(r.result)).toContain('3 phases');
  });
});

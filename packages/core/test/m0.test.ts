import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyBoard, Dispatcher, sequentialIds, setIdGenerator, BALL_ID, BoardSchema } from '../src';

describe('M0 acceptance', () => {
  beforeEach(() => setIdGenerator(sequentialIds()));

  it('creates a board, 22 players via applyFormation, 3 phases, full undo/redo', () => {
    const d = new Dispatcher(createEmptyBoard({ id: 'b1', title: 'Test' }));
    const initial = d.board;

    expect(d.dispatch('applyFormation', { team: 'home', formationId: '4-3-3' }).ok).toBe(true);
    expect(d.dispatch('applyFormation', { team: 'away', formationId: '4-4-2' }).ok).toBe(true);
    expect(d.board.teams[0]!.players).toHaveLength(11);
    expect(d.board.teams[1]!.players).toHaveLength(11);

    expect(d.dispatch('addPhase', {}).ok).toBe(true);
    expect(d.dispatch('addPhase', {}).ok).toBe(true);
    expect(d.board.phases).toHaveLength(3);

    const gk = d.board.teams[0]!.players.find((p) => p.role === 'GK')!;
    expect(d.dispatch('moveEntity', { phase: 1, entityId: gk.id, x: 10, y: 30 }).ok).toBe(true);
    expect(d.dispatch('moveEntity', { phase: 2, entityId: BALL_ID, x: 40, y: 20 }).ok).toBe(true);

    for (const ph of d.board.phases) expect(Object.keys(ph.positions)).toHaveLength(23);
    expect(BoardSchema.safeParse(d.board).success).toBe(true);

    const final = d.board;
    let steps = 0;
    while (d.undo()) steps++;
    expect(steps).toBe(6);
    expect(d.board).toEqual(initial);
    while (d.redo()) steps--;
    expect(steps).toBe(0);
    expect(d.board).toEqual(final);
  });

  it('groups a transaction into a single undo step and supports rollback', () => {
    const d = new Dispatcher(createEmptyBoard({ id: 'b1' }));
    const before = d.board;
    d.transaction('ai turn', () => {
      d.dispatch('applyFormation', { team: 'home', formationId: '4-4-2' });
      d.dispatch('addPhase', {});
      d.dispatch('addPhase', {});
    });
    expect(d.board.phases).toHaveLength(3);
    expect(d.historyLabels().past).toEqual(['ai turn']);
    d.undo();
    expect(d.board).toEqual(before);

    d.begin('x');
    d.dispatch('addPhase', {});
    d.rollback();
    expect(d.board).toEqual(before);
  });

  it('rejects invalid arguments and unknown entities without changing the board', () => {
    const d = new Dispatcher(createEmptyBoard());
    const b = d.board;
    expect(d.dispatch('moveEntity', { phase: 0, entityId: 'nope', x: 1, y: 1 }).ok).toBe(false);
    expect(d.dispatch('moveEntity', { phase: 5, entityId: BALL_ID, x: 1, y: 1 }).ok).toBe(false);
    expect(d.dispatch('addPhase', { after: 'x' }).ok).toBe(false);
    expect(d.dispatch('removePhase', { phase: 0 }).ok).toBe(false);
    expect(d.dispatch('nope', {}).ok).toBe(false);
    expect(d.board).toBe(b);
  });
});

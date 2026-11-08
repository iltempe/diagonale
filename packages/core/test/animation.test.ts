import { describe, expect, it } from 'vitest';
import { BALL_ID, createEmptyBoard, Dispatcher, evaluate, phaseTime, timeline } from '../src';

function board() {
  const d = new Dispatcher(createEmptyBoard({ id: 'b' }));
  d.dispatch('applyFormation', { team: 'home', formationId: '4-4-2' });
  d.dispatch('addPhase', { durationMs: 1000, holdMs: 500 });
  d.dispatch('addPhase', { durationMs: 2000, holdMs: 0, easing: 'linear' });
  d.dispatch('moveEntity', { phase: 1, entityId: BALL_ID, x: 70, y: 20 });
  d.dispatch('moveEntity', { phase: 2, entityId: BALL_ID, x: 90, y: 30 });
  d.dispatch('setPath', { phase: 2, entityId: BALL_ID, path: { type: 'lofted', peakHeight: 8 } });
  d.dispatch('updatePhase', { phase: 0, holdMs: 1000 });
  return d.board;
}

describe('animation', () => {
  it('builds the timeline', () => {
    const b = board();
    const tl = timeline(b);
    expect(tl.segments.map((s) => [s.start, s.holdStart, s.end])).toEqual([
      [0, 0, 1000],
      [1000, 2000, 2500],
      [2500, 4500, 4500],
    ]);
    expect(tl.totalMs).toBe(4500);
  });

  it('is deterministic', () => {
    const b = board();
    for (const t of [0, 500, 1234, 2600, 4400]) expect(evaluate(b, t)).toEqual(evaluate(b, t));
  });

  it('matches phase positions at the extremes of transitions', () => {
    const b = board();
    b.phases.forEach((ph, i) => {
      const f = evaluate(b, phaseTime(b, i));
      for (const [id, pos] of Object.entries(ph.positions)) {
        expect(f.entities[id]!.x).toBeCloseTo(pos.x, 6);
        expect(f.entities[id]!.y).toBeCloseTo(pos.y, 6);
      }
    });
    const start = evaluate(b, 1000);
    expect(start.entities[BALL_ID]!.x).toBeCloseTo(b.phases[0]!.positions[BALL_ID]!.x);
  });

  it('interpolates and lofts the ball', () => {
    const b = board();
    const mid = evaluate(b, 3500); // halfway linear transition to phase 2
    expect(mid.inTransition).toBe(true);
    expect(mid.entities[BALL_ID]!.x).toBeCloseTo(80);
    expect(mid.entities[BALL_ID]!.height).toBeCloseTo(8);
    expect(evaluate(b, 4500).entities[BALL_ID]!.height).toBeUndefined();
  });

  it('fades annotations during transitions', () => {
    const d = new Dispatcher(board());
    d.dispatch('addAnnotation', { phase: 0, annotation: { type: 'text', at: { x: 1, y: 1 }, text: 'a', size: 2 } });
    d.dispatch('addAnnotation', { phase: 1, annotation: { type: 'text', at: { x: 1, y: 1 }, text: 'b', size: 2 } });
    const b = d.board;
    expect(evaluate(b, 500).annotations.map((a) => a.opacity)).toEqual([1]);
    const early = evaluate(b, 1200);
    expect(early.annotations).toHaveLength(1);
    expect(early.annotations[0]!.phaseIndex).toBe(0);
    const late = evaluate(b, 1900);
    expect(late.annotations[0]!.phaseIndex).toBe(1);
  });

  it('follow_ball camera stays within the pitch and zooms', () => {
    const d = new Dispatcher(board());
    d.dispatch('updatePhase', { phase: 1, camera: { mode: 'follow_ball', zoom: 2 } });
    d.dispatch('updatePhase', { phase: 2, camera: { mode: 'follow_ball', zoom: 2 } });
    const f = evaluate(d.board, 4500);
    expect(f.camera.w).toBeCloseTo(52.5);
    expect(f.camera.x + f.camera.w).toBeLessThanOrEqual(108.0001);
  });
});

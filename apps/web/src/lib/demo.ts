import { BALL_ID, createEmptyBoard, Dispatcher, type Board } from '@diagonale/core';
import i18n from '../i18n';

type P = [number, number];

/** Starter board: 4-3-3 build-up against a 4-4-2 high press, in 4 phases. */
export function buildDemoBoard(lang: string): Board {
  const t = i18n.getFixedT(lang, 'editor');
  const d = new Dispatcher(
    createEmptyBoard({ title: t('demo.title'), homeName: i18n.getFixedT(lang, 'team')('defaults.home'), awayName: i18n.getFixedT(lang, 'team')('defaults.away') }),
  );
  d.dispatch('applyFormation', { team: 'home', formationId: '4-3-3', allPhases: true });
  d.dispatch('applyFormation', { team: 'away', formationId: '4-4-2', allPhases: true });
  const H = d.board.teams[0]!.players.map((p) => p.id);
  const A = d.board.teams[1]!.players.map((p) => p.id);
  // home slots: GK, LB, LCB, RCB, RB, DM, LCM, RCM, LW, ST, RW
  // away slots: GK, LB, LCB, RCB, RB, LM, LCM, RCM, RM, ST, ST
  const [hGK, hLB, hLCB, hRCB, hRB, hDM, hLCM, hRCM, hLW, hST, hRW] = H as [string, ...string[]];
  const [aGK, aLB, aLCB, aRCB, aRB, aLM, aLCM, aRCM, aRM, aST1, aST2] = A as [string, ...string[]];
  const move = (phase: number, m: Record<string, P>) =>
    d.dispatch('moveEntities', { phase, moves: Object.entries(m).map(([entityId, [x, y]]) => ({ entityId, x, y })) });

  const base: Record<string, P> = {
    [hGK!]: [4, 34], [hLCB!]: [10, 19], [hRCB!]: [10, 49], [hLB!]: [27, 6], [hRB!]: [27, 62], [hDM!]: [20, 34],
    [hLCM!]: [34, 24], [hRCM!]: [34, 44], [hLW!]: [48, 6], [hST!]: [52, 34], [hRW!]: [48, 62],
    [aGK!]: [100, 34], [aLB!]: [58, 58], [aLCB!]: [56, 42], [aRCB!]: [56, 26], [aRB!]: [58, 10],
    [aLM!]: [38, 56], [aLCM!]: [38, 40], [aRCM!]: [38, 28], [aRM!]: [38, 12], [aST1!]: [22, 42], [aST2!]: [22, 26],
    [BALL_ID]: [6.2, 34],
  };
  move(0, base);
  d.dispatch('updatePhase', { phase: 0, label: t('demo.p0'), ballCarrierId: hGK, holdMs: 1200 });
  d.dispatch('addAnnotation', { phase: 0, annotation: { type: 'arrow', style: 'pass', from: { entityId: hGK }, to: { entityId: hRCB } } });
  d.dispatch('addAnnotation', { phase: 0, annotation: { type: 'arrow', style: 'press', from: { entityId: aST1 }, to: { x: 13, y: 46.5 } } });

  d.dispatch('addPhase', { label: t('demo.p1'), durationMs: 1400 });
  move(1, { [BALL_ID]: [11, 48.4], [aST1!]: [15, 45], [aST2!]: [19, 31], [hDM!]: [19, 38], [hRB!]: [30, 63], [aLM!]: [36, 57] });
  d.dispatch('updatePhase', { phase: 1, ballCarrierId: hRCB });
  d.dispatch('addAnnotation', { phase: 1, annotation: { type: 'arrow', style: 'pass', from: { entityId: hRCB }, to: { entityId: hRB }, control: { x: 22, y: 60 } } });
  d.dispatch('addAnnotation', { phase: 1, annotation: { type: 'arrow', style: 'run', from: { entityId: hRW }, to: { x: 50, y: 52 } } });

  d.dispatch('addPhase', { label: t('demo.p2'), durationMs: 1500 });
  move(2, { [BALL_ID]: [30.5, 62.2], [aLM!]: [33, 59], [aLCM!]: [37, 47], [hRW!]: [50, 52], [hRCM!]: [37, 47.5], [aST1!]: [17, 49], [hST!]: [50, 40] });
  d.dispatch('updatePhase', { phase: 2, ballCarrierId: hRB });
  d.dispatch('addAnnotation', { phase: 2, annotation: { type: 'arrow', style: 'pass', from: { entityId: hRB }, to: { entityId: hRCM } } });
  d.dispatch('addAnnotation', { phase: 2, annotation: { type: 'arrow', style: 'run', from: { entityId: hRCM }, to: { x: 40, y: 50 } } });

  d.dispatch('addPhase', { label: t('demo.p3'), durationMs: 1300, holdMs: 1800 });
  move(3, { [BALL_ID]: [40.5, 50.5], [hRCM!]: [40, 50], [aLCM!]: [39, 46], [hRW!]: [55, 50], [hST!]: [56, 38], [hLCM!]: [40, 28] });
  d.dispatch('updatePhase', { phase: 3, ballCarrierId: hRCM });
  d.dispatch('addAnnotation', { phase: 3, annotation: { type: 'zone', shape: 'rect', points: [{ x: 36, y: 44 }, { x: 52, y: 56 }], color: '#F2C230', opacity: 0.22 } });
  d.dispatch('addAnnotation', { phase: 3, annotation: { type: 'text', at: { x: 36.5, y: 57.5 }, text: t('demo.note'), size: 2.2 } });
  d.dispatch('addAnnotation', { phase: 3, annotation: { type: 'arrow', style: 'carry', from: { entityId: hRCM }, to: { x: 50, y: 46 } } });
  return d.board;
}

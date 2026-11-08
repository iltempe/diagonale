import Konva from 'konva';
import { MARKINGS, type PitchConfig, type Vec2 } from '@diagonale/core';
import { sampleEllipse, segment, type Viewport } from './geometry';

export type SurfaceTheme = { a: string; b: string; surround: string; line: string; lineOpacity: number };

export const SURFACES: Record<PitchConfig['surface'], SurfaceTheme> = {
  grass_stripes: { a: '#3C8D40', b: '#348338', surround: '#2C7231', line: '#F4F1EA', lineOpacity: 0.95 },
  grass_plain: { a: '#3A8A3F', b: '#3A8A3F', surround: '#2E7533', line: '#F4F1EA', lineOpacity: 0.95 },
  artificial: { a: '#2E9160', b: '#2A885A', surround: '#22704A', line: '#F4F1EA', lineOpacity: 0.95 },
  chalkboard: { a: '#22302C', b: '#22302C', surround: '#18221F', line: '#F4F1EA', lineOpacity: 0.85 },
};

const SEG = 12; // subdivisions for straight lines (keeps broadcast perspective accurate)

/** Draw the pitch surface, regulation markings and optional training grid into a layer. */
export function drawPitch(layer: Konva.Layer, vp: Viewport, pitch: PitchConfig): void {
  layer.destroyChildren();
  const theme = SURFACES[pitch.surface];
  const L = pitch.length;
  const W = pitch.width;
  layer.add(new Konva.Rect({ x: 0, y: 0, width: vp.width, height: vp.height, fill: theme.surround, listening: false }));

  const poly = (pts: Vec2[], fill: string) =>
    layer.add(new Konva.Line({ points: vp.points(pts), closed: true, fill, listening: false, perfectDrawEnabled: false }));

  const rectPts = (x: number, y: number, w: number, h: number): Vec2[] => [
    ...segment({ x, y }, { x: x + w, y }, SEG),
    ...segment({ x: x + w, y }, { x: x + w, y: y + h }, SEG),
    ...segment({ x: x + w, y: y + h }, { x, y: y + h }, SEG),
    ...segment({ x, y: y + h }, { x, y }, SEG),
  ];

  // surface + stripes
  poly(rectPts(0, 0, L, W), theme.a);
  if (theme.a !== theme.b) {
    const n = Math.max(6, Math.round(L / 8.75));
    const sw = L / n;
    for (let i = 1; i < n; i += 2) poly(rectPts(i * sw, 0, sw, W), theme.b);
  }

  const scale = vp.flatScale;
  const lineWidth = Math.max(1, 0.12 * scale);
  const line = (pts: Vec2[], closed = false) =>
    layer.add(
      new Konva.Line({
        points: vp.points(pts),
        stroke: theme.line,
        opacity: theme.lineOpacity,
        strokeWidth: lineWidth,
        closed,
        lineJoin: 'round',
        listening: false,
        perfectDrawEnabled: false,
      }),
    );
  const spot = (p: Vec2, r = 0.25) => {
    const pts = sampleEllipse(p.x, p.y, r, r, 12);
    layer.add(
      new Konva.Line({ points: vp.points(pts), closed: true, fill: theme.line, opacity: theme.lineOpacity, listening: false }),
    );
  };

  // grid (training)
  if (pitch.grid?.visible && pitch.grid.cellMeters > 0) {
    const c = pitch.grid.cellMeters;
    for (let x = c; x < L - 0.01; x += c) {
      layer.add(
        new Konva.Line({
          points: vp.points(segment({ x, y: 0 }, { x, y: W }, SEG)),
          stroke: theme.line,
          opacity: 0.28,
          strokeWidth: Math.max(1, lineWidth * 0.6),
          dash: [6, 6],
          listening: false,
        }),
      );
    }
    for (let y = c; y < W - 0.01; y += c) {
      layer.add(
        new Konva.Line({
          points: vp.points(segment({ x: 0, y }, { x: L, y }, SEG)),
          stroke: theme.line,
          opacity: 0.28,
          strokeWidth: Math.max(1, lineWidth * 0.6),
          dash: [6, 6],
          listening: false,
        }),
      );
    }
  }

  // boundary
  line(rectPts(0, 0, L, W), true);
  if (pitch.markings === 'outline') return;

  // scale markings for small (youth) pitches
  const k = Math.min(1, L / 105);
  const M = Object.fromEntries(Object.entries(MARKINGS).map(([key, v]) => [key, v * k])) as typeof MARKINGS;

  line(segment({ x: L / 2, y: 0 }, { x: L / 2, y: W }, SEG));
  line(sampleEllipse(L / 2, W / 2, M.centreCircleRadius, M.centreCircleRadius, 64), true);
  spot({ x: L / 2, y: W / 2 });

  for (const side of [0, 1] as const) {
    const gx = side === 0 ? 0 : L;
    const dir = side === 0 ? 1 : -1;
    const pa = M.penaltyAreaDepth;
    const pw = Math.min(M.penaltyAreaWidth, W - 2);
    const ga = M.goalAreaDepth;
    const gw = Math.min(M.goalAreaWidth, W - 4);
    const box = (depth: number, width: number) => [
      ...segment({ x: gx, y: W / 2 - width / 2 }, { x: gx + dir * depth, y: W / 2 - width / 2 }, SEG),
      ...segment({ x: gx + dir * depth, y: W / 2 - width / 2 }, { x: gx + dir * depth, y: W / 2 + width / 2 }, SEG),
      ...segment({ x: gx + dir * depth, y: W / 2 + width / 2 }, { x: gx, y: W / 2 + width / 2 }, SEG),
    ];
    line(box(pa, pw));
    line(box(ga, gw));
    const ps = { x: gx + dir * M.penaltySpot, y: W / 2 };
    spot(ps);
    // penalty arc: part of the circle outside the box
    const r = M.centreCircleRadius;
    const dx = pa - M.penaltySpot;
    if (dx < r) {
      const a = Math.acos(dx / r);
      const base = side === 0 ? 0 : Math.PI;
      line(sampleEllipse(ps.x, ps.y, r, r, 24, base - a, base + a));
    }
    // corner arcs
    const cr = M.cornerRadius;
    if (side === 0) {
      line(sampleEllipse(0, 0, cr, cr, 8, 0, Math.PI / 2));
      line(sampleEllipse(0, W, cr, cr, 8, -Math.PI / 2, 0));
    } else {
      line(sampleEllipse(L, 0, cr, cr, 8, Math.PI / 2, Math.PI));
      line(sampleEllipse(L, W, cr, cr, 8, Math.PI, Math.PI * 1.5));
    }
    // goal
    const gwid = M.goalWidth;
    const gd = Math.max(1, M.goalDepth);
    const goal = [
      { x: gx, y: W / 2 - gwid / 2 },
      { x: gx - dir * gd, y: W / 2 - gwid / 2 },
      { x: gx - dir * gd, y: W / 2 + gwid / 2 },
      { x: gx, y: W / 2 + gwid / 2 },
    ];
    layer.add(
      new Konva.Line({
        points: vp.points(goal),
        stroke: '#FFFFFF',
        strokeWidth: lineWidth * 1.6,
        fill: 'rgba(255,255,255,0.12)',
        closed: false,
        listening: false,
      }),
    );
  }
}

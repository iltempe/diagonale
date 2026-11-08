import Konva from 'konva';
import {
  resolveAnchor,
  type Annotation,
  type ArrowAnnotation,
  type ArrowStyle,
  type EquipmentAnnotation,
  type EquipmentItem,
  type Vec2,
} from '@diagonale/core';
import { pointAt, polylineLength, sampleEllipse, sampleQuad, segment, trimPolyline, type Viewport } from './geometry';

export const ARROW_COLORS: Record<ArrowStyle, string> = {
  pass: '#FFFFFF',
  run: '#F2C230',
  carry: '#FFFFFF',
  press: '#FF5A4E',
  lofted: '#FFFFFF',
  block: '#F2C230',
  shot: '#FF5A4E',
};

export type DrawContext = {
  vp: Viewport;
  entities: Record<string, Vec2>;
  /** radius in px of the entity at an anchor (used to trim arrows) */
  entityRadius: (id: string) => number;
};

/** Pixel polyline of an arrow (meters → screen), including automatic arc for lofted passes. */
export function arrowPolyline(a: ArrowAnnotation, ctx: DrawContext): number[] {
  const from = resolveAnchor(a.from, ctx.entities);
  const to = resolveAnchor(a.to, ctx.entities);
  let control = a.control;
  if (!control && a.style === 'lofted') {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    control = { x: mx - dy * 0.2, y: my + dx * 0.2 };
  }
  const pts = control ? sampleQuad(from, control, to, 28) : segment(from, to, 10);
  const raw = ctx.vp.points(pts);
  const startTrim = 'entityId' in a.from ? ctx.entityRadius(a.from.entityId) + 2 : 0;
  const endTrim = 'entityId' in a.to ? ctx.entityRadius(a.to.entityId) + 3 : 0;
  return trimPolyline(raw, startTrim, endTrim);
}

function head(x: number, y: number, angle: number, size: number, color: string, filled = true): Konva.Line {
  const a1 = angle + Math.PI - 0.45;
  const a2 = angle + Math.PI + 0.45;
  return new Konva.Line({
    points: [x + Math.cos(a1) * size, y + Math.sin(a1) * size, x, y, x + Math.cos(a2) * size, y + Math.sin(a2) * size],
    closed: filled,
    fill: filled ? color : undefined,
    stroke: color,
    strokeWidth: filled ? 1 : Math.max(2, size / 4),
    lineJoin: 'round',
    lineCap: 'round',
  });
}

function wavy(pts: number[], amplitude: number, wavelength: number): number[] {
  const len = polylineLength(pts);
  if (len < 1) return pts;
  const out: number[] = [];
  const steps = Math.max(8, Math.round(len / 3));
  const straightTail = Math.min(len * 0.25, wavelength * 1.2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointAt(pts, t);
    const d = t * len;
    const fade = d > len - straightTail ? Math.max(0, (len - d) / straightTail) : Math.min(1, d / wavelength);
    const off = Math.sin((d / wavelength) * Math.PI * 2) * amplitude * fade;
    out.push(p.x + Math.cos(p.angle + Math.PI / 2) * off, p.y + Math.sin(p.angle + Math.PI / 2) * off);
  }
  return out;
}

export function drawArrow(a: ArrowAnnotation, ctx: DrawContext, opacity: number): Konva.Group {
  const g = new Konva.Group({ opacity });
  const pts = arrowPolyline(a, ctx);
  if (pts.length < 4) return g;
  const color = ARROW_COLORS[a.style];
  const s = ctx.vp.flatScale;
  const w = Math.max(1.6, 0.22 * s);
  const headSize = Math.max(8, w * 4);
  const end = pointAt(pts, 1);
  const common = { stroke: color, lineCap: 'round' as const, lineJoin: 'round' as const, hitStrokeWidth: 16 };
  const shadow = { shadowColor: 'rgba(0,0,0,0.35)', shadowBlur: 2, shadowOffset: { x: 0, y: 1 } };
  // stop the shaft just before the tip so the head stays sharp
  const shaft = trimPolyline(pts, 0, a.style === 'block' ? 0 : headSize * 0.6);
  switch (a.style) {
    case 'pass':
      g.add(new Konva.Line({ points: shaft, strokeWidth: w, ...common, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize, color));
      break;
    case 'run':
      g.add(new Konva.Line({ points: shaft, strokeWidth: w, dash: [w * 3.2, w * 2.4], ...common, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize, color, false));
      break;
    case 'carry':
      g.add(new Konva.Line({ points: wavy(shaft, w * 1.6, w * 7), strokeWidth: w, ...common, tension: 0.3, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize, color));
      break;
    case 'press': {
      g.add(new Konva.Line({ points: shaft, strokeWidth: w * 2, ...common, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize * 1.2, color));
      const back = pointAt(pts, Math.max(0, 1 - (headSize * 1.1) / Math.max(1, polylineLength(pts))));
      g.add(head(back.x, back.y, end.angle, headSize * 1.2, color));
      break;
    }
    case 'lofted':
      g.add(new Konva.Line({ points: shaft, strokeWidth: w, dash: [w * 1.2, w * 2.2], ...common, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize, color));
      break;
    case 'block': {
      g.add(new Konva.Line({ points: shaft, strokeWidth: w * 1.3, ...common, ...shadow }));
      const bar = headSize * 0.9;
      const px = Math.cos(end.angle + Math.PI / 2) * bar;
      const py = Math.sin(end.angle + Math.PI / 2) * bar;
      g.add(new Konva.Line({ points: [end.x - px, end.y - py, end.x + px, end.y + py], strokeWidth: w * 2, ...common }));
      break;
    }
    case 'shot':
      g.add(new Konva.Line({ points: shaft, strokeWidth: w * 1.5, ...common, ...shadow }));
      g.add(head(end.x, end.y, end.angle, headSize * 1.5, color));
      break;
  }
  if (a.label) {
    const mid = pointAt(pts, 0.5);
    const fs = Math.max(11, 1.4 * s);
    const t = new Konva.Text({
      text: a.label,
      fontSize: fs,
      fontStyle: 'bold',
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: '#FFFFFF',
      shadowColor: '#000',
      shadowBlur: 3,
      shadowOpacity: 0.8,
    });
    t.position({ x: mid.x - t.width() / 2, y: mid.y - fs * 1.6 });
    g.add(t);
  }
  return g;
}

export function zonePoints(a: Extract<Annotation, { type: 'zone' }>): Vec2[] {
  const [p0, p1] = a.points;
  if (a.shape === 'rect' && p0 && p1) {
    return [
      ...segment(p0, { x: p1.x, y: p0.y }, 8),
      ...segment({ x: p1.x, y: p0.y }, p1, 8),
      ...segment(p1, { x: p0.x, y: p1.y }, 8),
      ...segment({ x: p0.x, y: p1.y }, p0, 8),
    ];
  }
  if (a.shape === 'ellipse' && p0 && p1) {
    return sampleEllipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 48);
  }
  return a.points;
}

function equipmentShape(item: EquipmentItem, s: number): Konva.Group {
  const g = new Konva.Group();
  const orange = '#FF7A1A';
  const yellow = '#F2C230';
  const white = '#FFFFFF';
  const stroke = 'rgba(0,0,0,0.45)';
  const sw = Math.max(1, s * 0.05);
  switch (item) {
    case 'cone':
      g.add(new Konva.Line({ points: [-0.35 * s, 0.3 * s, 0, -0.45 * s, 0.35 * s, 0.3 * s], closed: true, fill: orange, stroke, strokeWidth: sw }));
      break;
    case 'tall_cone':
      g.add(new Konva.Line({ points: [-0.35 * s, 0.4 * s, 0, -0.9 * s, 0.35 * s, 0.4 * s], closed: true, fill: orange, stroke, strokeWidth: sw }));
      g.add(new Konva.Rect({ x: -0.22 * s, y: -0.25 * s, width: 0.44 * s, height: 0.14 * s, fill: white }));
      break;
    case 'disc':
      g.add(new Konva.Ellipse({ radiusX: 0.32 * s, radiusY: 0.22 * s, fill: yellow, stroke, strokeWidth: sw }));
      g.add(new Konva.Ellipse({ radiusX: 0.1 * s, radiusY: 0.07 * s, fill: 'rgba(0,0,0,0.25)' }));
      break;
    case 'pole':
      g.add(new Konva.Rect({ x: -0.07 * s, y: -1.3 * s, width: 0.14 * s, height: 1.4 * s, fill: yellow, stroke, strokeWidth: sw }));
      g.add(new Konva.Rect({ x: -0.07 * s, y: -1.3 * s, width: 0.14 * s, height: 0.35 * s, fill: '#D7263D' }));
      break;
    case 'mini_goal':
      g.add(new Konva.Rect({ x: -1.5 * s, y: -0.5 * s, width: 3 * s, height: 1 * s, stroke: white, strokeWidth: sw * 2, fill: 'rgba(255,255,255,0.15)' }));
      break;
    case 'goal':
      g.add(new Konva.Rect({ x: -3.66 * s, y: -1 * s, width: 7.32 * s, height: 2 * s, stroke: white, strokeWidth: sw * 3, fill: 'rgba(255,255,255,0.15)' }));
      break;
    case 'hurdle':
      g.add(new Konva.Line({ points: [-0.6 * s, 0, 0.6 * s, 0], stroke: yellow, strokeWidth: sw * 3 }));
      g.add(new Konva.Line({ points: [-0.6 * s, -0.15 * s, -0.6 * s, 0.15 * s], stroke: white, strokeWidth: sw * 2 }));
      g.add(new Konva.Line({ points: [0.6 * s, -0.15 * s, 0.6 * s, 0.15 * s], stroke: white, strokeWidth: sw * 2 }));
      break;
    case 'ladder': {
      g.add(new Konva.Rect({ x: -2 * s, y: -0.25 * s, width: 4 * s, height: 0.5 * s, stroke: yellow, strokeWidth: sw * 2 }));
      for (let i = 1; i < 8; i++) {
        const x = -2 * s + (4 * s * i) / 8;
        g.add(new Konva.Line({ points: [x, -0.25 * s, x, 0.25 * s], stroke: yellow, strokeWidth: sw * 1.5 }));
      }
      break;
    }
    case 'mannequin':
      g.add(new Konva.Rect({ x: -0.3 * s, y: -0.9 * s, width: 0.6 * s, height: 1.1 * s, cornerRadius: 0.2 * s, fill: '#2B6CB0', stroke, strokeWidth: sw }));
      g.add(new Konva.Circle({ y: -1.1 * s, radius: 0.2 * s, fill: '#2B6CB0', stroke, strokeWidth: sw }));
      break;
    case 'ring':
      g.add(new Konva.Circle({ radius: 0.35 * s, stroke: '#9B5DE5', strokeWidth: sw * 3 }));
      break;
    case 'bib':
      g.add(new Konva.Rect({ x: -0.3 * s, y: -0.35 * s, width: 0.6 * s, height: 0.7 * s, cornerRadius: 0.1 * s, fill: '#C6F432', stroke, strokeWidth: sw }));
      break;
    case 'ball_pile':
      for (const [x, y] of [[-0.3, 0.1], [0.3, 0.1], [0, -0.2], [0, 0.35], [-0.15, -0.5], [0.2, -0.45]] as const) {
        g.add(new Konva.Circle({ x: x * s, y: y * s, radius: 0.22 * s, fill: white, stroke: '#222', strokeWidth: sw }));
      }
      break;
    case 'rebounder':
      g.add(new Konva.Rect({ x: -1 * s, y: -0.15 * s, width: 2 * s, height: 0.3 * s, fill: '#555', stroke: white, strokeWidth: sw * 2 }));
      break;
    case 'flag':
      g.add(new Konva.Line({ points: [0, 0.3 * s, 0, -1.2 * s], stroke: white, strokeWidth: sw * 2 }));
      g.add(new Konva.Line({ points: [0, -1.2 * s, 0.6 * s, -0.95 * s, 0, -0.7 * s], closed: true, fill: '#D7263D' }));
      break;
    case 'marker_line':
      g.add(new Konva.Line({ points: [-2.5 * s, 0, 2.5 * s, 0], stroke: yellow, strokeWidth: sw * 3, dash: [s * 0.5, s * 0.4] }));
      break;
    case 'arc':
      g.add(new Konva.Arc({ innerRadius: 2 * s, outerRadius: 2 * s + sw * 3, angle: 180, rotation: 180, fill: yellow }));
      break;
    case 'wall':
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.7 * s;
        g.add(new Konva.Rect({ x: x - 0.28 * s, y: -0.9 * s, width: 0.56 * s, height: 1.1 * s, cornerRadius: 0.2 * s, fill: '#2B6CB0', stroke, strokeWidth: sw }));
        g.add(new Konva.Circle({ x, y: -1.1 * s, radius: 0.18 * s, fill: '#2B6CB0', stroke, strokeWidth: sw }));
      }
      break;
  }
  return g;
}

export function drawEquipment(a: EquipmentAnnotation, vp: Viewport, opacity: number): Konva.Group {
  const p = vp.toScreen(a.at);
  const s = Math.max(6, vp.scaleAt(a.at));
  const g = equipmentShape(a.item, s);
  g.position(p);
  g.rotation(a.rotation ?? 0);
  g.opacity(opacity);
  return g;
}

/** Draw any annotation as a Konva group (attr annotationId set for hit testing). */
export function drawAnnotation(a: Annotation, ctx: DrawContext, opacity: number): Konva.Group {
  let g: Konva.Group;
  const vp = ctx.vp;
  switch (a.type) {
    case 'arrow':
      g = drawArrow(a, ctx, opacity);
      break;
    case 'zone': {
      g = new Konva.Group({ opacity });
      g.add(
        new Konva.Line({
          points: vp.points(zonePoints(a)),
          closed: true,
          fill: a.color,
          opacity: a.opacity,
          stroke: a.color,
          strokeWidth: 0,
        }),
      );
      g.add(
        new Konva.Line({
          points: vp.points(zonePoints(a)),
          closed: true,
          stroke: a.color,
          strokeWidth: Math.max(1.5, vp.flatScale * 0.12),
          opacity: Math.min(1, a.opacity + 0.4),
        }),
      );
      break;
    }
    case 'line': {
      g = new Konva.Group({ opacity });
      const pts: Vec2[] = [];
      for (let i = 1; i < a.points.length; i++) pts.push(...segment(a.points[i - 1]!, a.points[i]!, 8));
      g.add(
        new Konva.Line({
          points: vp.points(pts),
          stroke: a.color,
          strokeWidth: Math.max(1.6, vp.flatScale * 0.18),
          dash: a.dashed ? [10, 7] : undefined,
          lineCap: 'round',
          hitStrokeWidth: 16,
        }),
      );
      break;
    }
    case 'text': {
      g = new Konva.Group({ opacity });
      const p = vp.toScreen(a.at);
      const fs = Math.max(10, a.size * vp.scaleAt(a.at));
      g.add(
        new Konva.Text({
          x: p.x,
          y: p.y,
          text: a.text,
          fontSize: fs,
          fontStyle: 'bold',
          fontFamily: 'Inter, system-ui, sans-serif',
          fill: '#FFFFFF',
          shadowColor: '#000',
          shadowBlur: 4,
          shadowOpacity: 0.7,
        }),
      );
      break;
    }
    case 'equipment':
      g = drawEquipment(a, vp, opacity);
      break;
  }
  g.setAttr('annotationId', a.id);
  return g;
}

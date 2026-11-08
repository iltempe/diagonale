import type { Rect, Vec2 } from '@diagonale/core';

/** 3x3 homography stored row-major (h33 normalised to 1). */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solve A x = b (n x n) with Gaussian elimination and partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) throw new Error('Singular matrix');
    for (let k = c; k <= n; k++) M[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Homography mapping 4 source points onto 4 destination points. */
export function homography(src: Vec2[], dst: Vec2[]): Mat3 {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Singular homography');
  const inv: Mat3 = [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
  const k = inv[8];
  return inv.map((v) => v / k) as Mat3;
}

export function apply(m: Mat3, p: Vec2): Vec2 {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export type ViewportOptions = {
  orientation: 'horizontal' | 'vertical';
  perspective: 'flat' | 'broadcast';
  /** Extra meters shown around the camera rect. */
  marginMeters?: number;
  /** Extra pixels of padding inside the canvas. */
  paddingPx?: number;
  /** Pixels reserved at the top/bottom (e.g. social video header and footer). */
  insets?: { top: number; bottom: number };
};

/**
 * Maps pitch meters to canvas pixels. Flat views are a rect→rect mapping (rotated for the vertical
 * orientation); the broadcast view tilts the far side of the same mapping with a projective transform.
 */
export class Viewport {
  readonly H: Mat3;
  readonly Hinv: Mat3;
  /** pixels per meter of the flat mapping */
  readonly flatScale: number;
  readonly rect: Rect;

  constructor(
    camera: Rect,
    readonly width: number,
    readonly height: number,
    readonly opts: ViewportOptions,
  ) {
    const m = opts.marginMeters ?? 3;
    const r: Rect = { x: camera.x - m, y: camera.y - m, w: camera.w + 2 * m, h: camera.h + 2 * m };
    this.rect = r;
    const pad = opts.paddingPx ?? 0;
    const W = Math.max(1, width - 2 * pad);
    const inTop = opts.insets?.top ?? 0;
    const inBottom = opts.insets?.bottom ?? 0;
    const Hh = Math.max(1, height - 2 * pad - inTop - inBottom);
    const vertical = opts.orientation === 'vertical';
    const broadcast = opts.perspective === 'broadcast';
    // screen extents of the mapped rectangle
    const mw = vertical ? r.h : r.w;
    const mh = vertical ? r.w : r.h;
    const tilt = broadcast ? 0.62 : 1; // vertical compression
    const s = Math.min(W / mw, Hh / (mh * tilt));
    this.flatScale = s;
    const sw = mw * s;
    const sh = mh * s * tilt;
    const ox = pad + (W - sw) / 2;
    const oy = pad + inTop + (Hh - sh) / 2;
    const inset = broadcast ? sw * 0.16 : 0;
    // screen quad: TL, TR, BR, BL
    const TL = { x: ox + inset, y: oy };
    const TR = { x: ox + sw - inset, y: oy };
    const BR = { x: ox + sw, y: oy + sh };
    const BL = { x: ox, y: oy + sh };
    const src = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
    // horizontal: meters TL→screen TL. vertical: +x points up, y=0 on the left.
    const dst = vertical ? [BL, TL, TR, BR] : [TL, TR, BR, BL];
    this.H = homography(src, dst);
    this.Hinv = invert(this.H);
  }

  toScreen = (p: Vec2): Vec2 => apply(this.H, p);
  toMeters = (p: Vec2): Vec2 => apply(this.Hinv, p);

  /** Local pixels-per-meter at a pitch point (used to scale sprites with depth). */
  scaleAt(p: Vec2): number {
    const a = this.toScreen(p);
    const bx = this.toScreen({ x: p.x + 1, y: p.y });
    const by = this.toScreen({ x: p.x, y: p.y + 1 });
    return Math.max(Math.hypot(bx.x - a.x, bx.y - a.y), Math.hypot(by.x - a.x, by.y - a.y));
  }

  /** Map a polyline in meters to a flat [x0,y0,x1,y1…] array of pixels. */
  points(pts: Vec2[]): number[] {
    const out: number[] = [];
    for (const p of pts) {
      const s = this.toScreen(p);
      out.push(s.x, s.y);
    }
    return out;
  }
}

/** Sample a quadratic bezier. */
export function sampleQuad(a: Vec2, c: Vec2, b: Vec2, n = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

export function sampleEllipse(cx: number, cy: number, rx: number, ry: number, n = 48, from = 0, to = Math.PI * 2): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

/** Subdivide a straight segment so that projective transforms keep it accurate. */
export function segment(a: Vec2, b: Vec2, n = 1): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  return out;
}

/** Trim a pixel polyline by `start` px at the beginning and `end` px at the end. */
export function trimPolyline(pts: number[], start: number, end: number): number[] {
  const P: Vec2[] = [];
  for (let i = 0; i < pts.length; i += 2) P.push({ x: pts[i]!, y: pts[i + 1]! });
  const cut = (arr: Vec2[], d: number): Vec2[] => {
    let rem = d;
    const out = [...arr];
    while (out.length >= 2 && rem > 0) {
      const a = out[0]!;
      const b = out[1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > rem) {
        const t = rem / len;
        out[0] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        rem = 0;
      } else {
        rem -= len;
        if (out.length === 2) {
          out[0] = b;
          break;
        }
        out.shift();
      }
    }
    return out;
  };
  let res = cut(P, start);
  res = cut(res.reverse(), end).reverse();
  return res.flatMap((p) => [p.x, p.y]);
}

export function polylineLength(pts: number[]): number {
  let l = 0;
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
  return l;
}

/** Point and tangent at fraction t of a pixel polyline. */
export function pointAt(pts: number[], t: number): { x: number; y: number; angle: number } {
  const total = polylineLength(pts);
  let target = total * t;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2]!;
    const ay = pts[i - 1]!;
    const bx = pts[i]!;
    const by = pts[i + 1]!;
    const l = Math.hypot(bx - ax, by - ay);
    if (l >= target || i === pts.length - 2) {
      const f = l > 0 ? Math.min(1, target / l) : 0;
      return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, angle: Math.atan2(by - ay, bx - ax) };
    }
    target -= l;
  }
  return { x: pts[0] ?? 0, y: pts[1] ?? 0, angle: 0 };
}

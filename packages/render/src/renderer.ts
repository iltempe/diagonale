import Konva from 'konva';
import {
  BALL_ID,
  allPlayers,
  type Annotation,
  type Board,
  type FrameState,
  type Player,
  type Rect,
  type Team,
  type Vec2,
} from '@diagonale/core';
import { drawAnnotation, type DrawContext } from './annotations';
import { Viewport } from './geometry';
import { drawPitch } from './pitch';

export type RenderOptions = {
  editable?: boolean;
  selection?: ReadonlySet<string>;
  selectedAnnotationId?: string | null;
  showNames?: boolean;
  showNumbers?: boolean;
  /** draw player photos (photoUrl) inside the disc */
  showPhotos?: boolean;
  playerScale?: number;
  /** positions of the previous phase, drawn as faint ghosts with trails (editor only) */
  ghost?: Record<string, Vec2> | null;
  orientation?: 'horizontal' | 'vertical';
  perspective?: 'flat' | 'broadcast';
  /** annotation being drawn */
  draft?: Annotation | null;
  /** selection rectangle in screen px */
  marquee?: Rect | null;
  caption?: string | null;
  watermark?: string | null;
  /** Social video layout (9:16, 4:5, 1:1): title band on top, phase progress and brand at the bottom. */
  social?: SocialLayout | null;
};

export type SocialLayout = {
  title: string;
  caption: string;
  brand: string;
  phase: number;
  phases: number;
  /** 0..1 progress inside the current transition (animates the progress bar) */
  progress?: number;
};

/** Reserved bands for social formats; tall formats keep clear of the platforms' bottom UI. */
export function socialInsets(width: number, height: number): { top: number; bottom: number } {
  const tall = height / width > 1.5;
  return { top: Math.round(height * (tall ? 0.15 : 0.14)), bottom: Math.round(height * (tall ? 0.13 : 0.09)) };
}

export type PointerInfo = {
  meters: Vec2;
  screen: Vec2;
  entityId?: string;
  annotationId?: string;
  handle?: string;
  shift: boolean;
  /** true for touch input */
  touch: boolean;
};

export type RendererEvents = {
  onPointerDown?: (p: PointerInfo) => void;
  onPointerMove?: (p: PointerInfo) => void;
  onPointerUp?: (p: PointerInfo) => void;
  onDoubleClick?: (p: PointerInfo) => void;
  onEntitiesMoved?: (moves: { entityId: string; x: number; y: number }[]) => void;
  onAnnotationMoved?: (annotationId: string, patch: Record<string, unknown>) => void;
};

const BALL_RADIUS_M = 0.55;
const PLAYER_RADIUS_M = 1.45;
const FONT = 'Inter, system-ui, sans-serif';

/** ISO 3166 alpha-2 → flag emoji. */
export function flagEmoji(code?: string): string {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const images = new Map<string, HTMLImageElement>();
const imageListeners = new Set<() => void>();

function imageFor(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => imageListeners.forEach((l) => l());
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Load all player photos of a board (call before offscreen exports). */
export async function preloadImages(board: Board): Promise<void> {
  const urls = allPlayers(board)
    .map((p) => p.photoUrl)
    .filter((u): u is string => !!u);
  await Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((res) => {
          const img = imageFor(u) ?? images.get(u)!;
          if (img.complete) return res();
          img.addEventListener('load', () => res(), { once: true });
          img.addEventListener('error', () => res(), { once: true });
        }),
    ),
  );
}

class PlayerNode {
  readonly group: Konva.Group;
  private shadow = new Konva.Ellipse({ radiusX: 1, radiusY: 1, fill: 'rgba(0,0,0,0.28)', listening: false });
  private ring = new Konva.Circle({ radius: 1, stroke: '#F2C230', strokeWidth: 3, listening: false });
  private disc = new Konva.Circle({ radius: 1 });
  private stripe = new Konva.Arc({ innerRadius: 0, outerRadius: 1, angle: 0, listening: false });
  private photo = new Konva.Image({ image: undefined, listening: false });
  private photoClip = new Konva.Group({ listening: false });
  private num = new Konva.Text({ fontFamily: FONT, fontStyle: 'bold', align: 'center', verticalAlign: 'middle', listening: false });
  private facing = new Konva.Line({ closed: true, listening: false });
  private label = new Konva.Text({
    fontFamily: FONT,
    fontStyle: 'bold',
    fill: '#FFFFFF',
    align: 'center',
    shadowColor: '#000',
    shadowBlur: 3,
    shadowOpacity: 0.9,
    listening: false,
  });

  constructor(readonly id: string) {
    this.group = new Konva.Group();
    this.group.setAttr('entityId', id);
    this.photoClip.add(this.photo);
    this.group.add(this.shadow, this.ring, this.disc, this.stripe, this.photoClip, this.facing, this.num, this.label);
  }

  update(p: Player, team: Team, screen: Vec2, r: number, facingAngle: number | null, opts: RenderOptions) {
    const kit = team.kit;
    const gk = p.role === 'GK';
    this.group.position(screen);
    this.shadow.setAttrs({ radiusX: r * 1.05, radiusY: r * 0.55, y: r * 0.85 });
    this.disc.setAttrs({
      radius: r,
      fill: gk ? kit.gkPrimary : kit.primary,
      stroke: kit.secondary,
      strokeWidth: Math.max(1.5, r * 0.16),
    });
    this.stripe.visible(false);
    const selected = opts.selection?.has(p.id) ?? false;
    this.ring.setAttrs({ radius: r + Math.max(3, r * 0.3), visible: selected, strokeWidth: Math.max(2, r * 0.22) });
    const img = opts.showPhotos && p.photoUrl ? imageFor(p.photoUrl) : null;
    if (img) {
      const ir = r * 0.86;
      this.photoClip.visible(true);
      this.photoClip.clipFunc((ctx) => ctx.arc(0, 0, ir, 0, Math.PI * 2, false));
      this.photo.setAttrs({ image: img, x: -ir, y: -ir, width: ir * 2, height: ir * 2 });
    } else this.photoClip.visible(false);
    const showNum = opts.showNumbers !== false && p.number != null && !img;
    this.num.setAttrs({
      text: showNum ? String(p.number) : '',
      fontSize: r * (String(p.number ?? '').length > 2 ? 0.8 : 1.05),
      fill: kit.number,
      width: r * 2,
      height: r * 2,
      x: -r,
      y: -r + r * 0.04,
    });
    if (facingAngle != null) {
      const a = facingAngle;
      const tip = r * 1.55;
      const base = r * 0.95;
      const spread = 0.42;
      this.facing.setAttrs({
        visible: true,
        points: [
          Math.cos(a) * tip,
          Math.sin(a) * tip,
          Math.cos(a + spread) * base,
          Math.sin(a + spread) * base,
          Math.cos(a - spread) * base,
          Math.sin(a - spread) * base,
        ],
        fill: kit.secondary,
      });
    } else this.facing.visible(false);
    const flag = flagEmoji(p.flag);
    const baseName = opts.showNames !== false ? (p.shortName ?? p.name ?? '') : '';
    const name = [flag, img && p.number != null ? `${p.number}` : '', baseName].filter(Boolean).join(' ');
    const fs = Math.max(9, r * 0.85);
    this.label.setAttrs({ text: name, fontSize: fs, visible: !!name });
    if (name) this.label.setAttrs({ x: -this.label.width() / 2, y: r + 3 });
  }
}

class BallNode {
  readonly group = new Konva.Group();
  private shadow = new Konva.Ellipse({ radiusX: 1, radiusY: 1, fill: 'rgba(0,0,0,0.35)', listening: false });
  private body = new Konva.Group();
  private ball = new Konva.Circle({ radius: 1, fill: '#FFFFFF', stroke: '#111', strokeWidth: 1.2 });
  private patch = new Konva.RegularPolygon({ sides: 5, radius: 1, fill: '#111', listening: false });
  private ring = new Konva.Circle({ radius: 1, stroke: '#F2C230', strokeWidth: 2, listening: false });

  constructor() {
    this.group.setAttr('entityId', BALL_ID);
    this.body.add(this.ring, this.ball, this.patch);
    this.group.add(this.shadow, this.body);
  }

  update(screen: Vec2, r: number, heightPx: number, selected: boolean) {
    this.group.position(screen);
    const lift = heightPx;
    const scale = 1 + Math.min(1.2, lift / (r * 18));
    this.shadow.setAttrs({ radiusX: r * 1.1 * (1 - Math.min(0.5, lift / (r * 40))), radiusY: r * 0.55, y: r * 0.6 });
    this.body.setAttrs({ y: -lift, scaleX: scale, scaleY: scale });
    this.ball.radius(r);
    this.patch.radius(r * 0.42);
    this.ring.setAttrs({ radius: r + 4, visible: selected });
  }
}

/**
 * Imperative Konva renderer. The same class renders the editor, the shared player and every export,
 * so what you see is what you export.
 */
export class BoardRenderer {
  readonly stage: Konva.Stage;
  private pitchLayer = new Konva.Layer({ listening: false });
  private annLayer = new Konva.Layer();
  private entLayer = new Konva.Layer();
  private overlay = new Konva.Layer();
  private players = new Map<string, PlayerNode>();
  private ball = new BallNode();
  private pitchKey = '';
  private vp: Viewport | null = null;
  private lastBoard: Board | null = null;
  private lastFrame: FrameState | null = null;
  private lastOpts: RenderOptions = {};
  private dragging = false;
  private screenPos = new Map<string, Vec2>();
  private radii = new Map<string, number>();
  events: RendererEvents = {};
  private imageListener: () => void;

  constructor(container: HTMLDivElement, width: number, height: number, opts: { interactive?: boolean } = {}) {
    this.stage = new Konva.Stage({ container, width, height });
    this.stage.add(this.pitchLayer, this.annLayer, this.entLayer, this.overlay);
    this.entLayer.add(this.ball.group);
    this.imageListener = () => {
      if (this.lastBoard && this.lastFrame) this.render(this.lastBoard, this.lastFrame, this.lastOpts);
    };
    imageListeners.add(this.imageListener);
    if (opts.interactive) this.bindEvents();
    else {
      this.annLayer.listening(false);
      this.entLayer.listening(false);
    }
  }

  get viewport(): Viewport | null {
    return this.vp;
  }

  setSize(width: number, height: number) {
    this.stage.size({ width, height });
    this.pitchKey = '';
    if (this.lastBoard && this.lastFrame) this.render(this.lastBoard, this.lastFrame, this.lastOpts);
  }

  destroy() {
    imageListeners.delete(this.imageListener);
    this.stage.destroy();
  }

  private info(e: Konva.KonvaEventObject<PointerEvent | MouseEvent | TouchEvent>): PointerInfo {
    const pos = this.stage.getPointerPosition() ?? { x: 0, y: 0 };
    const meters = this.vp ? this.vp.toMeters(pos) : pos;
    let node: Konva.Node | null = e.target;
    let entityId: string | undefined;
    let annotationId: string | undefined;
    let handle: string | undefined;
    while (node && node !== this.stage) {
      entityId ??= node.getAttr('entityId');
      annotationId ??= node.getAttr('annotationId');
      handle ??= node.getAttr('handle');
      node = node.getParent();
    }
    const evt = e.evt as PointerEvent;
    return {
      meters,
      screen: pos,
      entityId,
      annotationId,
      handle,
      shift: !!(evt.shiftKey || evt.metaKey || evt.ctrlKey),
      touch: evt.pointerType === 'touch' || (typeof TouchEvent !== 'undefined' && e.evt instanceof TouchEvent),
    };
  }

  private bindEvents() {
    this.stage.on('pointerdown', (e) => this.events.onPointerDown?.(this.info(e)));
    this.stage.on('pointermove', (e) => {
      if (!this.dragging) this.events.onPointerMove?.(this.info(e));
    });
    this.stage.on('pointerup', (e) => this.events.onPointerUp?.(this.info(e)));
    this.stage.on('dblclick dbltap', (e) => this.events.onDoubleClick?.(this.info(e as never)));
  }

  /** Entity whose disc is under a screen point (within tolerance). */
  entityAt(screen: Vec2, tolerance = 6): string | undefined {
    let best: string | undefined;
    let bestD = Infinity;
    for (const [id, p] of this.screenPos) {
      const r = (this.radii.get(id) ?? 8) + tolerance;
      const d = Math.hypot(p.x - screen.x, p.y - screen.y);
      if (d <= r && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  /** Entities whose screen position lies inside a px rectangle. */
  entitiesIn(rect: Rect): string[] {
    const out: string[] = [];
    for (const [id, p] of this.screenPos) {
      if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) out.push(id);
    }
    return out;
  }

  private makeViewport(board: Board, frame: FrameState, opts: RenderOptions): Viewport {
    const w = this.stage.width();
    const h = this.stage.height();
    return new Viewport(frame.camera, w, h, {
      orientation: opts.orientation ?? board.pitch.orientation,
      perspective: opts.perspective ?? board.pitch.perspective,
      marginMeters: 3,
      paddingPx: Math.min(w, h) < 400 ? 4 : 10,
      ...(opts.social ? { insets: socialInsets(w, h) } : {}),
    });
  }

  render(board: Board, frame: FrameState, opts: RenderOptions = {}) {
    this.lastBoard = board;
    this.lastFrame = frame;
    this.lastOpts = opts;
    const vp = this.makeViewport(board, frame, opts);
    this.vp = vp;
    const key = JSON.stringify([board.pitch, frame.camera, this.stage.width(), this.stage.height(), opts.orientation, opts.perspective]);
    if (key !== this.pitchKey) {
      drawPitch(this.pitchLayer, vp, board.pitch);
      this.pitchKey = key;
      this.pitchLayer.batchDraw();
    }

    const scale = opts.playerScale ?? 1;
    const players = allPlayers(board);
    const teamOf = new Map(board.teams.map((t) => [t.id, t]));
    const editable = !!opts.editable;

    // ---- entities ----
    this.screenPos.clear();
    this.radii.clear();
    const seen = new Set<string>();
    const order: { node: Konva.Group; y: number }[] = [];
    for (const p of players) {
      const e = frame.entities[p.id];
      const team = teamOf.get(p.teamId);
      if (!e || !team) continue;
      seen.add(p.id);
      let node = this.players.get(p.id);
      if (!node) {
        node = new PlayerNode(p.id);
        this.players.set(p.id, node);
        this.entLayer.add(node.group);
        this.bindDrag(node.group);
      }
      const s = vp.toScreen(e);
      const r = Math.max(7, PLAYER_RADIUS_M * vp.scaleAt(e) * scale);
      let facingAngle: number | null = null;
      if (e.facing !== undefined) {
        const rad = (e.facing * Math.PI) / 180;
        const ahead = vp.toScreen({ x: e.x + Math.cos(rad), y: e.y + Math.sin(rad) });
        facingAngle = Math.atan2(ahead.y - s.y, ahead.x - s.x);
      }
      if (!(this.dragging && node.group.isDragging())) node.update(p, team, s, r, facingAngle, opts);
      node.group.draggable(editable);
      this.screenPos.set(p.id, s);
      this.radii.set(p.id, r);
      order.push({ node: node.group, y: s.y });
    }
    for (const [id, node] of this.players) {
      if (!seen.has(id)) {
        node.group.destroy();
        this.players.delete(id);
      }
    }
    // depth sort (matters in broadcast view)
    order.sort((a, b) => a.y - b.y).forEach((o, i) => o.node.zIndex(i));
    const be = frame.entities[BALL_ID];
    if (be) {
      const s = vp.toScreen(be);
      const r = Math.max(4, BALL_RADIUS_M * vp.scaleAt(be) * Math.max(0.9, scale));
      const lift = (be.height ?? 0) * vp.scaleAt(be) * 0.6;
      if (!(this.dragging && this.ball.group.isDragging()))
        this.ball.update(s, r, lift, opts.selection?.has(BALL_ID) ?? false);
      this.ball.group.visible(true);
      this.ball.group.draggable(editable);
      if (!this.ball.group.getAttr('dragBound')) this.bindDrag(this.ball.group);
      this.ball.group.moveToTop();
      this.screenPos.set(BALL_ID, s);
      this.radii.set(BALL_ID, r);
    } else this.ball.group.visible(false);

    // ---- annotations ----
    if (!this.dragging) this.drawAnnotations(board, frame, opts, vp);
    this.drawOverlay(board, frame, opts, vp);
    this.entLayer.batchDraw();
  }

  private ctx(frame: FrameState, vp: Viewport): DrawContext {
    return {
      vp,
      entities: frame.entities,
      entityRadius: (id) => this.radii.get(id) ?? 0,
    };
  }

  private drawAnnotations(board: Board, frame: FrameState, opts: RenderOptions, vp: Viewport) {
    this.annLayer.destroyChildren();
    const ctx = this.ctx(frame, vp);
    // ghosts of the previous phase
    if (opts.ghost) {
      for (const [id, g] of Object.entries(opts.ghost)) {
        const cur = frame.entities[id];
        if (!cur || Math.hypot(cur.x - g.x, cur.y - g.y) < 0.3) continue;
        const a = vp.toScreen(g);
        const b = vp.toScreen(cur);
        const r = (this.radii.get(id) ?? 8) * 0.8;
        this.annLayer.add(
          new Konva.Line({ points: [a.x, a.y, b.x, b.y], stroke: '#FFFFFF', opacity: 0.35, dash: [3, 5], strokeWidth: 1.5, listening: false }),
          new Konva.Circle({ x: a.x, y: a.y, radius: r, stroke: '#FFFFFF', opacity: 0.35, strokeWidth: 1.5, dash: [3, 3], listening: false }),
        );
      }
    }
    // zones first, then lines/arrows, then text/equipment
    const rank = (a: Annotation) => (a.type === 'zone' ? 0 : a.type === 'line' || a.type === 'arrow' ? 1 : 2);
    const items = [...frame.annotations].sort((a, b) => rank(a.annotation) - rank(b.annotation));
    for (const af of items) {
      const g = drawAnnotation(af.annotation, ctx, af.opacity);
      const selected = opts.selectedAnnotationId === af.annotation.id;
      if (selected) {
        g.find('Line, Text, Rect, Circle, Ellipse').forEach((n) => {
          (n as Konva.Shape).shadowColor('#F2C230');
          (n as Konva.Shape).shadowBlur(10);
          (n as Konva.Shape).shadowOpacity(1);
        });
      }
      if (opts.editable && selected) this.bindAnnotationDrag(g, af.annotation, vp);
      this.annLayer.add(g);
      if (opts.editable && selected && af.annotation.type === 'arrow') this.addArrowHandles(af.annotation, frame, vp);
    }
    this.annLayer.batchDraw();
  }

  private addArrowHandles(a: Extract<Annotation, { type: 'arrow' }>, frame: FrameState, vp: Viewport) {
    const mk = (name: string, m: Vec2) => {
      const s = vp.toScreen(m);
      const c = new Konva.Circle({ x: s.x, y: s.y, radius: 7, fill: '#F2C230', stroke: '#0F3D2E', strokeWidth: 2, draggable: true });
      c.setAttr('handle', name);
      c.setAttr('annotationId', a.id);
      c.on('dragstart', () => (this.dragging = true));
      c.on('dragend', () => {
        this.dragging = false;
        const p = vp.toMeters(c.position());
        const r = (v: number) => Math.round(v * 100) / 100;
        const pt = { x: r(p.x), y: r(p.y) };
        if (name === 'control') this.events.onAnnotationMoved?.(a.id, { control: pt });
        else {
          const hit = this.entityAt(c.position(), 4);
          this.events.onAnnotationMoved?.(a.id, { [name]: hit ? { entityId: hit } : pt });
        }
      });
      this.annLayer.add(c);
    };
    const from = 'entityId' in a.from ? frame.entities[a.from.entityId] : a.from;
    const to = 'entityId' in a.to ? frame.entities[a.to.entityId] : a.to;
    if (from && !('entityId' in a.from)) mk('from', from);
    if (to && !('entityId' in a.to)) mk('to', to);
    if (from && to) mk('control', a.control ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  }

  private bindAnnotationDrag(g: Konva.Group, a: Annotation, vp: Viewport) {
    if (a.type === 'arrow' && ('entityId' in a.from || 'entityId' in a.to)) return;
    g.draggable(true);
    g.on('dragstart', () => (this.dragging = true));
    g.on('dragend', () => {
      this.dragging = false;
      const d = g.position();
      const mv = (p: Vec2) => {
        const s = vp.toScreen(p);
        const m = vp.toMeters({ x: s.x + d.x, y: s.y + d.y });
        return { x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 };
      };
      let patch: Record<string, unknown> = {};
      switch (a.type) {
        case 'text':
        case 'equipment':
          patch = { at: mv(a.at) };
          break;
        case 'zone':
        case 'line':
          patch = { points: a.points.map(mv) };
          break;
        case 'arrow':
          patch = { from: mv(a.from as Vec2), to: mv(a.to as Vec2), ...(a.control ? { control: mv(a.control) } : {}) };
          break;
      }
      g.position({ x: 0, y: 0 });
      this.events.onAnnotationMoved?.(a.id, patch);
    });
  }

  private bindDrag(group: Konva.Group) {
    group.setAttr('dragBound', true);
    let start = new Map<string, Vec2>();
    group.on('dragstart', () => {
      this.dragging = true;
      const id = group.getAttr('entityId') as string;
      const sel = this.lastOpts.selection;
      const ids = sel?.has(id) ? [...sel] : [id];
      start = new Map();
      for (const eid of ids) {
        const node = eid === BALL_ID ? this.ball.group : this.players.get(eid)?.group;
        if (node) start.set(eid, node.position());
      }
    });
    group.on('dragmove', () => {
      const id = group.getAttr('entityId') as string;
      const s0 = start.get(id);
      if (!s0) return;
      const p = group.position();
      const dx = p.x - s0.x;
      const dy = p.y - s0.y;
      for (const [eid, s] of start) {
        if (eid === id) continue;
        const node = eid === BALL_ID ? this.ball.group : this.players.get(eid)?.group;
        node?.position({ x: s.x + dx, y: s.y + dy });
      }
    });
    group.on('dragend', () => {
      this.dragging = false;
      if (!this.vp) return;
      const moves: { entityId: string; x: number; y: number }[] = [];
      for (const eid of start.keys()) {
        const node = eid === BALL_ID ? this.ball.group : this.players.get(eid)?.group;
        if (!node) continue;
        const m = this.vp.toMeters(node.position());
        moves.push({ entityId: eid, x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 });
      }
      this.events.onEntitiesMoved?.(moves);
    });
  }

  private drawOverlay(board: Board, frame: FrameState, opts: RenderOptions, vp: Viewport) {
    this.overlay.destroyChildren();
    if (opts.draft) {
      const g = drawAnnotation(opts.draft, this.ctx(frame, vp), 0.85);
      g.listening(false);
      this.overlay.add(g);
    }
    if (opts.marquee) {
      const m = opts.marquee;
      this.overlay.add(
        new Konva.Rect({ x: m.x, y: m.y, width: m.w, height: m.h, stroke: '#F2C230', dash: [5, 4], fill: 'rgba(242,194,48,0.12)', listening: false }),
      );
    }
    const W = this.stage.width();
    const H = this.stage.height();
    if (opts.social) {
      this.drawSocial(opts.social, W, H);
      this.overlay.batchDraw();
      this.annLayer.batchDraw();
      return;
    }
    if (opts.caption) {
      const fs = Math.max(13, Math.min(W, H) * 0.032);
      const t = new Konva.Text({ text: opts.caption, fontSize: fs, fontFamily: FONT, fontStyle: 'bold', fill: '#F4F1EA', padding: fs * 0.5, listening: false });
      const bg = new Konva.Rect({ x: 12, y: 12, width: t.width(), height: t.height(), fill: 'rgba(15,61,46,0.85)', cornerRadius: 6, listening: false });
      t.position({ x: 12, y: 12 });
      this.overlay.add(bg, t);
    }
    if (opts.watermark) {
      const fs = Math.max(10, Math.min(W, H) * 0.022);
      const t = new Konva.Text({ text: opts.watermark, fontSize: fs, fontFamily: FONT, fontStyle: 'bold', fill: '#F4F1EA', opacity: 0.7, listening: false });
      t.position({ x: W - t.width() - 12, y: H - t.height() - 10 });
      this.overlay.add(t);
    }
    void board;
    this.overlay.batchDraw();
    this.annLayer.batchDraw();
  }

  private drawSocial(s: SocialLayout, W: number, H: number) {
    const ins = socialInsets(W, H);
    const chalk = '#F4F1EA';
    const accent = '#F2C230';
    const DISPLAY = 'Oswald, Inter, system-ui, sans-serif';
    this.overlay.add(new Konva.Rect({ x: 0, y: 0, width: W, height: ins.top, fill: '#0F3D2E', listening: false }));
    this.overlay.add(new Konva.Rect({ x: 0, y: H - ins.bottom, width: W, height: ins.bottom, fill: '#0F3D2E', listening: false }));
    const margin = W * 0.06;
    // title: shrink to fit at most 2 lines
    let fs = W * (H / W > 1.5 ? 0.072 : 0.058);
    let title: Konva.Text;
    const maxW = W - margin * 2;
    const words = s.title.toUpperCase().split(/\s+/).filter(Boolean);
    // break only on spaces (Konva would also split "4-4-2" on hyphens)
    const layout = (size: number) => {
      const probe = new Konva.Text({ fontSize: size, fontFamily: DISPLAY, fontStyle: 'bold', wrap: 'none' });
      const width = (t: string) => (probe.text(t), probe.width());
      const lines: string[] = [];
      for (const w of words) {
        const cur = lines[lines.length - 1];
        if (cur !== undefined && width(`${cur} ${w}`) <= maxW) lines[lines.length - 1] = `${cur} ${w}`;
        else lines.push(w);
      }
      const fits = lines.length <= 2 && lines.every((l) => width(l) <= maxW);
      probe.destroy();
      return { lines, fits };
    };
    let lay = layout(fs);
    while (!lay.fits && fs > W * 0.03) {
      fs *= 0.92;
      lay = layout(fs);
    }
    for (;;) {
      title = new Konva.Text({ text: lay.lines.join('\n'), width: maxW, align: 'center', fontSize: fs, fontFamily: DISPLAY, fontStyle: 'bold', fill: chalk, lineHeight: 1.05, wrap: 'none', listening: false });
      if (title.height() <= ins.top * 0.58 || fs < W * 0.03) break;
      fs *= 0.92;
      lay = layout(fs);
    }
    const capFs = W * 0.036;
    const cap = new Konva.Text({ text: s.caption, width: W - margin * 2, align: 'center', fontSize: capFs, fontFamily: FONT, fontStyle: 'bold', fill: accent, wrap: 'none', ellipsis: true, listening: false });
    const block = title.height() + capFs * 0.6 + cap.height();
    const y0 = Math.max(ins.top * 0.1, (ins.top - block) / 2);
    title.position({ x: margin, y: y0 });
    cap.position({ x: margin, y: y0 + title.height() + capFs * 0.6 });
    this.overlay.add(title, cap);
    // phase progress segments
    const n = Math.max(1, s.phases);
    const gap = W * 0.012;
    const barW = (W - margin * 2 - gap * (n - 1)) / n;
    const barH = Math.max(4, H * 0.006);
    const by = H - ins.bottom + ins.bottom * 0.22;
    for (let i = 0; i < n; i++) {
      const x = margin + i * (barW + gap);
      this.overlay.add(new Konva.Rect({ x, y: by, width: barW, height: barH, cornerRadius: barH / 2, fill: 'rgba(244,241,234,0.25)', listening: false }));
      const fill = i < s.phase ? 1 : i === s.phase ? (s.progress ?? 1) : 0;
      if (fill > 0) this.overlay.add(new Konva.Rect({ x, y: by, width: barW * fill, height: barH, cornerRadius: barH / 2, fill: accent, listening: false }));
    }
    const brand = new Konva.Text({ text: s.brand, width: W, align: 'center', fontSize: W * 0.03, fontFamily: FONT, fontStyle: 'bold', fill: chalk, opacity: 0.85, listening: false });
    brand.position({ x: 0, y: by + barH + ins.bottom * 0.14 });
    this.overlay.add(brand);
  }

  /** Draw synchronously (needed before reading pixels for export). */
  drawNow() {
    this.stage.draw();
  }

  toCanvas(pixelRatio = 1): HTMLCanvasElement {
    this.stage.draw();
    return this.stage.toCanvas({ pixelRatio });
  }

  toDataURL(pixelRatio = 1): string {
    this.stage.draw();
    return this.stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
  }
}

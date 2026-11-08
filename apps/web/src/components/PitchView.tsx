import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BALL_ID,
  evaluate,
  findTeam,
  phaseFrame,
  type Anchor,
  type Annotation,
  type ArrowStyle,
  type Board,
  type Rect,
  type Vec2,
} from '@diagonale/core';
import { BoardRenderer, type PointerInfo } from '@diagonale/render';
import { displayedBoard, useEditor } from '../store/editor';

type Draft =
  | { kind: 'arrow'; style: ArrowStyle; from: Anchor; fromM: Vec2; to: Vec2 }
  | { kind: 'zone'; shape: 'rect' | 'ellipse'; p0: Vec2; p1: Vec2 }
  | { kind: 'line'; p0: Vec2; p1: Vec2 }
  | { kind: 'marquee'; s0: Vec2; s1: Vec2 };

const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Vec2): Vec2 => ({ x: r2(p.x), y: r2(p.y) });

function nextNumber(board: Board, team: 'home' | 'away'): number {
  const used = new Set(findTeam(board, team)?.players.map((p) => p.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function draftAnnotation(d: Draft, color: string): Annotation | null {
  switch (d.kind) {
    case 'arrow':
      return { id: 'draft', type: 'arrow', style: d.style, from: d.from, to: d.to };
    case 'zone':
      return { id: 'draft', type: 'zone', shape: d.shape, points: [d.p0, d.p1], color, opacity: 0.25 };
    case 'line':
      return { id: 'draft', type: 'line', points: [d.p0, d.p1], color: '#F4F1EA', dashed: true };
    default:
      return null;
  }
}

/** The interactive field: renders the board through @diagonale/render and turns pointer input into commands. */
export function PitchView() {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current!;
    const r = new BoardRenderer(host, host.clientWidth || 800, host.clientHeight || 500, { interactive: true });
    rendererRef.current = r;

    const draw = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const s = useEditor.getState();
        const board = displayedBoard(s);
        const phase = Math.min(s.phase, board.phases.length - 1);
        const free = s.playing || s.freeTime;
        const frame = free ? evaluate(board, s.t) : phaseFrame(board, phase);
        const d = draftRef.current;
        let marquee: Rect | null = null;
        if (d?.kind === 'marquee') {
          marquee = { x: Math.min(d.s0.x, d.s1.x), y: Math.min(d.s0.y, d.s1.y), w: Math.abs(d.s1.x - d.s0.x), h: Math.abs(d.s1.y - d.s0.y) };
        }
        const editable = !free && !s.aiPreview;
        r.render(board, frame, {
          editable: editable && s.tool === 'select',
          selection: new Set(s.selection),
          selectedAnnotationId: editable ? s.selectedAnnotationId : null,
          showNames: s.showNames,
          showPhotos: s.showPhotos,
          playerScale: s.playerScale,
          ghost: editable && s.ghosts && phase > 0 ? board.phases[phase - 1]!.positions : null,
          draft: d ? draftAnnotation(d, s.zoneColor) : null,
          marquee,
          caption: s.aiPreview ? t('ai:previewBadge') : null,
        });
      });
    };

    const unsub = useEditor.subscribe(draw);
    const ro = new ResizeObserver(() => {
      r.setSize(Math.max(50, host.clientWidth), Math.max(50, host.clientHeight));
      draw();
    });
    ro.observe(host);

    // ---------- interactions ----------
    const st = () => useEditor.getState();

    const snapIfFree = (): boolean => {
      const s = st();
      if (s.aiPreview) return true;
      if (s.playing || s.freeTime) {
        s.setPhase(s.phase);
        return true;
      }
      return false;
    };

    r.events.onPointerDown = (p: PointerInfo) => {
      if (snapIfFree()) return;
      const s = st();
      const m = rp(p.meters);
      const tool = s.tool;
      if (tool === 'select') {
        if (p.handle) return;
        if (p.entityId) {
          if (p.shift) {
            const has = s.selection.includes(p.entityId);
            s.select(has ? s.selection.filter((x) => x !== p.entityId) : [...s.selection, p.entityId]);
          } else if (!s.selection.includes(p.entityId)) s.select([p.entityId]);
          s.selectAnnotation(null);
          return;
        }
        if (p.annotationId) {
          s.selectAnnotation(p.annotationId);
          return;
        }
        if (s.tapToPlace && s.selection.length === 1) {
          s.dispatch('moveEntity', { phase: s.phase, entityId: s.selection[0], x: m.x, y: m.y, propagate: true });
          return;
        }
        draftRef.current = { kind: 'marquee', s0: p.screen, s1: p.screen };
        return;
      }
      if (tool === 'player_home' || tool === 'player_away') {
        const team = tool === 'player_home' ? 'home' : 'away';
        const res = s.dispatch('addPlayer', { team, number: nextNumber(s.board, team), x: m.x, y: m.y });
        if (res.ok) s.select([(res.result as { playerId: string }).playerId]);
        return;
      }
      if (tool === 'ball') {
        s.dispatch('moveEntity', { phase: s.phase, entityId: BALL_ID, x: m.x, y: m.y, propagate: true });
        return;
      }
      if (tool.startsWith('arrow_')) {
        const style = tool.slice(6) as ArrowStyle;
        const hit = p.entityId ?? r.entityAt(p.screen, 4);
        draftRef.current = { kind: 'arrow', style, from: hit ? { entityId: hit } : m, fromM: m, to: m };
        return;
      }
      if (tool === 'zone_rect' || tool === 'zone_ellipse') {
        draftRef.current = { kind: 'zone', shape: tool === 'zone_rect' ? 'rect' : 'ellipse', p0: m, p1: m };
        return;
      }
      if (tool === 'line') {
        draftRef.current = { kind: 'line', p0: m, p1: m };
        return;
      }
      if (tool === 'text') {
        const res = s.dispatch('addAnnotation', { phase: s.phase, annotation: { type: 'text', at: m, text: t('editor:defaults.text'), size: 2 } });
        if (res.ok) {
          s.set({ tool: 'select' });
          s.selectAnnotation((res.result as { annotationId: string }).annotationId);
        }
        return;
      }
      if (tool === 'equipment') {
        s.dispatch('addAnnotation', { phase: s.phase, annotation: { type: 'equipment', item: s.equipmentItem, at: m } });
      }
    };

    r.events.onPointerMove = (p) => {
      const d = draftRef.current;
      if (!d) return;
      const m = rp(p.meters);
      if (d.kind === 'marquee') d.s1 = p.screen;
      else if (d.kind === 'arrow') d.to = m;
      else d.p1 = m;
      draw();
    };

    r.events.onPointerUp = (p) => {
      const d = draftRef.current;
      draftRef.current = null;
      if (!d) return;
      const s = st();
      const m = rp(p.meters);
      if (d.kind === 'marquee') {
        const rect = { x: Math.min(d.s0.x, p.screen.x), y: Math.min(d.s0.y, p.screen.y), w: Math.abs(p.screen.x - d.s0.x), h: Math.abs(p.screen.y - d.s0.y) };
        if (rect.w < 4 && rect.h < 4) s.set({ selection: [], selectedAnnotationId: null });
        else s.set({ selection: r.entitiesIn(rect), selectedAnnotationId: null });
        draw();
        return;
      }
      if (d.kind === 'arrow') {
        if (Math.hypot(m.x - d.fromM.x, m.y - d.fromM.y) < 1) return draw();
        const hit = r.entityAt(p.screen, 4);
        const fromId = 'entityId' in d.from ? d.from.entityId : undefined;
        const to: Anchor = hit && hit !== fromId ? { entityId: hit } : m;
        s.dispatch('addAnnotation', { phase: s.phase, annotation: { type: 'arrow', style: d.style, from: d.from, to } });
        return;
      }
      const p0 = d.p0;
      if (Math.hypot(m.x - p0.x, m.y - p0.y) < 1) return draw();
      if (d.kind === 'zone') {
        s.dispatch('addAnnotation', { phase: s.phase, annotation: { type: 'zone', shape: d.shape, points: [p0, m], color: s.zoneColor, opacity: 0.25 } });
      } else {
        s.dispatch('addAnnotation', { phase: s.phase, annotation: { type: 'line', points: [p0, m], color: '#F4F1EA', dashed: true } });
      }
    };

    r.events.onEntitiesMoved = (moves) => {
      const s = st();
      const b = s.board;
      const changed = moves.filter((mv) => {
        const cur = b.phases[s.phase]?.positions[mv.entityId];
        return !cur || Math.hypot(cur.x - mv.x, cur.y - mv.y) > 0.05;
      });
      if (!changed.length) return draw();
      s.dispatch('moveEntities', { phase: s.phase, moves: changed, propagate: true }, t('editor:history.move'));
    };

    r.events.onAnnotationMoved = (id, patch) => {
      const s = st();
      s.dispatch('updateAnnotation', { phase: s.phase, annotationId: id, patch });
    };

    draw();
    return () => {
      unsub();
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      r.destroy();
    };
  }, [t]);

  return <div className="pitch-host" ref={hostRef} data-testid="pitch" />;
}

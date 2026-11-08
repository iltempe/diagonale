import type { Board, PitchConfig, PitchView, Rect, Vec2 } from './schema';

export const DEFAULT_PITCH: PitchConfig = {
  length: 105,
  width: 68,
  view: 'full',
  surface: 'grass_stripes',
  orientation: 'horizontal',
  perspective: 'flat',
};

/**
 * Resolve a PitchView to a rectangle in meters.
 * Home team attacks towards +x; its left flank is y = 0 (see docs/decisions.md D-003).
 */
export function viewRect(pitch: Pick<PitchConfig, 'length' | 'width'>, view: PitchView): Rect {
  const L = pitch.length;
  const W = pitch.width;
  if (typeof view === 'object') return { ...view.custom };
  switch (view) {
    case 'full':
      return { x: 0, y: 0, w: L, h: W };
    case 'half_attack':
      return { x: L / 2, y: 0, w: L / 2, h: W };
    case 'half_defence':
      return { x: 0, y: 0, w: L / 2, h: W };
    case 'third_defensive':
      return { x: 0, y: 0, w: L / 3, h: W };
    case 'third_middle':
      return { x: L / 3, y: 0, w: L / 3, h: W };
    case 'third_final':
      return { x: (2 * L) / 3, y: 0, w: L / 3, h: W };
    case 'box': {
      const depth = Math.min(L / 2, 26);
      const h = Math.min(W, 52);
      return { x: L - depth, y: (W - h) / 2, w: depth, h };
    }
    case 'wide_left':
      return { x: L / 2, y: 0, w: L / 2, h: W / 2 };
    case 'wide_right':
      return { x: L / 2, y: W / 2, w: L / 2, h: W / 2 };
  }
}

export function clampToPitch(p: Vec2, pitch: Pick<PitchConfig, 'length' | 'width'>, margin = 4): Vec2 {
  return {
    x: Math.min(pitch.length + margin, Math.max(-margin, p.x)),
    y: Math.min(pitch.width + margin, Math.max(-margin, p.y)),
  };
}

/** Standard regulation measurements (meters). */
export const MARKINGS = {
  centreCircleRadius: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltySpot: 11,
  goalWidth: 7.32,
  goalDepth: 2,
  cornerRadius: 1,
};

export function boardViewRect(board: Board): Rect {
  return viewRect(board.pitch, board.pitch.view);
}

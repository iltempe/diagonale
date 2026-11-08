import { create } from 'zustand';
import {
  createEmptyBoard,
  Dispatcher,
  phaseTime,
  timeline,
  type ArrowStyle,
  type Board,
  type DispatchResult,
  type EquipmentItem,
  type PhaseContent,
} from '@diagonale/core';

export type Tool =
  | 'select'
  | 'player_home'
  | 'player_away'
  | 'ball'
  | `arrow_${ArrowStyle}`
  | 'zone_rect'
  | 'zone_ellipse'
  | 'line'
  | 'text'
  | 'equipment';

export type Toast = { id: number; kind: 'error' | 'info'; message: string };

export type AIPreview = { board: Board; commands: { name: string; args: unknown }[] };

type State = {
  board: Board;
  canUndo: boolean;
  canRedo: boolean;
  phase: number;
  tool: Tool;
  equipmentItem: EquipmentItem;
  zoneColor: string;
  selection: string[];
  selectedAnnotationId: string | null;
  playing: boolean;
  /** true while the displayed time is not aligned to the current phase (playing/scrubbing) */
  freeTime: boolean;
  t: number;
  speed: number;
  loop: boolean;
  tapToPlace: boolean;
  showNames: boolean;
  showPhotos: boolean;
  ghosts: boolean;
  playerScale: number;
  clipboard: PhaseContent | null;
  aiOpen: boolean;
  aiPreview: AIPreview | null;
  toasts: Toast[];
};

type Actions = {
  dispatch: (name: string, args?: unknown, label?: string) => DispatchResult;
  transaction: (label: string, fn: () => void) => void;
  undo: () => void;
  redo: () => void;
  loadBoard: (b: Board) => void;
  setPhase: (i: number) => void;
  setTool: (t: Tool) => void;
  select: (ids: string[]) => void;
  selectAnnotation: (id: string | null) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  set: (partial: Partial<State>) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
};

export const dispatcher = new Dispatcher(createEmptyBoard());

let toastSeq = 0;

export const useEditor = create<State & Actions>()((set, get) => ({
  board: dispatcher.board,
  canUndo: false,
  canRedo: false,
  phase: 0,
  tool: 'select',
  equipmentItem: 'cone',
  zoneColor: '#F2C230',
  selection: [],
  selectedAnnotationId: null,
  playing: false,
  freeTime: false,
  t: 0,
  speed: 1,
  loop: false,
  tapToPlace: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  showNames: true,
  showPhotos: true,
  ghosts: true,
  playerScale: 1,
  clipboard: null,
  aiOpen: false,
  aiPreview: null,
  toasts: [],

  dispatch: (name, args = {}, label) => {
    const r = dispatcher.dispatch(name, args, { label });
    if (!r.ok) get().toast(r.error, 'error');
    return r;
  },
  transaction: (label, fn) => dispatcher.transaction(label, fn),
  undo: () => {
    dispatcher.undo();
  },
  redo: () => {
    dispatcher.redo();
  },
  loadBoard: (b) => {
    dispatcher.load(b);
    set({ phase: 0, selection: [], selectedAnnotationId: null, playing: false, freeTime: false, t: 0, aiPreview: null });
  },
  setPhase: (i) => {
    const b = get().board;
    const phase = Math.max(0, Math.min(i, b.phases.length - 1));
    set({ phase, playing: false, freeTime: false, t: phaseTime(b, phase), selectedAnnotationId: null });
  },
  setTool: (tool) => set({ tool }),
  select: (ids) => set({ selection: ids, selectedAnnotationId: ids.length ? null : get().selectedAnnotationId }),
  selectAnnotation: (id) => set({ selectedAnnotationId: id, selection: id ? [] : get().selection }),
  play: () => {
    const { board, t, freeTime, phase } = get();
    const total = timeline(board).totalMs;
    let start = freeTime ? t : phaseTime(board, phase);
    if (start >= total - 1) start = 0;
    set({ playing: true, freeTime: true, t: start });
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  seek: (t) => {
    const b = get().board;
    const tl = timeline(b);
    const seg = tl.segments.find((s) => t <= s.end) ?? tl.segments[tl.segments.length - 1]!;
    set({ t, freeTime: true, playing: false, phase: seg.phaseIndex });
  },
  set: (partial) => set(partial),
  toast: (message, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

// keep React state in sync with the command bus
dispatcher.subscribe((e) => {
  const s = useEditor.getState();
  const phase = Math.min(s.phase, e.board.phases.length - 1);
  const ids = new Set([...e.board.teams.flatMap((t) => t.players.map((p) => p.id)), 'ball']);
  const annIds = new Set(e.board.phases[phase]?.annotations.map((a) => a.id));
  useEditor.setState({
    board: e.board,
    canUndo: dispatcher.canUndo,
    canRedo: dispatcher.canRedo,
    phase,
    selection: s.selection.filter((id) => ids.has(id)),
    selectedAnnotationId: s.selectedAnnotationId && annIds.has(s.selectedAnnotationId) ? s.selectedAnnotationId : null,
    ...(e.kind === 'load' ? {} : { freeTime: false, playing: false, t: phaseTime(e.board, phase) }),
  });
});

/** Board currently displayed (AI preview has priority). */
export function displayedBoard(s: Pick<State, 'board' | 'aiPreview'>): Board {
  return s.aiPreview?.board ?? s.board;
}

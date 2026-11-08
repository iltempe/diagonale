import { z } from 'zod';
import { describeBoard } from '../describe';
import { FORMATIONS } from '../formations';
import { ROUTINES } from '../routines';
import { extractSequence } from '../sequences';
import { timeline } from '../animation';
import { defineQuery } from './types';

export const getBoard = defineQuery({
  name: 'getBoard',
  description: 'Return the full board JSON.',
  schema: z.object({}),
  run: (board) => board,
});

export const describeBoardQuery = defineQuery({
  name: 'describeBoard',
  description:
    'Return a textual summary of the board (pitch, teams, players with ids, phases with positions and annotations) plus a compact JSON. Call it to understand the current state.',
  schema: z.object({}),
  run: (board) => describeBoard(board).text,
});

export const listFormations = defineQuery({
  name: 'listFormations',
  description: 'List available formation ids (11-a-side and youth 5/7/9-a-side) with their roles.',
  schema: z.object({ players: z.number().int().optional().describe('Filter by number of players (5, 7, 9, 11)') }),
  run: (_b, a) =>
    FORMATIONS.filter((f) => !a.players || f.players === a.players).map((f) => ({
      id: f.id,
      name: f.label.en,
      players: f.players,
      roles: f.slots.map((s) => s.role).join(' '),
    })),
});

export const listRoutines = defineQuery({
  name: 'listRoutines',
  description: 'List predefined set-piece routines usable with applySetPieceRoutine.',
  schema: z.object({}),
  run: () => ROUTINES.map((r) => ({ id: r.id, name: r.name, description: r.description, phases: r.phases.length })),
});

export const listSequences = defineQuery({
  name: 'listSequences',
  description: 'List reusable sequences saved by the user.',
  schema: z.object({}),
  run: (_b, _a, ctx) => ctx.sequences ?? [],
});

export const copyPhaseContent = defineQuery({
  name: 'copyPhaseContent',
  description: 'Return positions and annotations of a phase, to be pasted elsewhere with pastePhaseContent.',
  schema: z.object({ phase: z.number().int().min(0) }),
  run: (board, a) => {
    const ph = board.phases[a.phase];
    if (!ph) throw new Error(`Phase ${a.phase} does not exist`);
    return { positions: ph.positions, annotations: ph.annotations };
  },
});

export const saveSequence = defineQuery({
  name: 'saveSequence',
  description:
    'Build a reusable Sequence (role slots, no names) from a range of phases. Returns the Sequence JSON; it does not modify the board.',
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    fromPhase: z.number().int().min(0).optional(),
    toPhase: z.number().int().min(0).optional(),
  }),
  run: (board, a) => extractSequence(board, a),
});

export const getTimeline = defineQuery({
  name: 'getTimeline',
  description: 'Return the animation timeline (start/hold/end ms of each phase and total duration).',
  schema: z.object({}),
  run: (board) => timeline(board),
});

export const QUERIES = [
  getBoard,
  describeBoardQuery,
  listFormations,
  listRoutines,
  listSequences,
  copyPhaseContent,
  saveSequence,
  getTimeline,
] as const;

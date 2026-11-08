import { z } from 'zod';

/** Session planner (SPEC §13.2). */
export const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  date: z.string(),
  durationMin: z.number().int().min(0).max(600),
  objectives: z.array(z.string().max(300)),
  drills: z.array(
    z.object({
      boardId: z.string().min(1),
      durationMin: z.number().int().min(0).max(300),
      notes: z.string().max(4000).default(''),
      players: z.string().max(200).default(''),
    }),
  ),
});
export type Session = z.infer<typeof SessionSchema>;

/** Match plan (SPEC §13.3): boards grouped by game moment. */
export const MATCH_PLAN_SECTIONS = [
  'possession',
  'non_possession',
  'transition_attack',
  'transition_defence',
  'set_pieces_attack',
  'set_pieces_defence',
  'build_up',
] as const;
export type MatchPlanSection = (typeof MATCH_PLAN_SECTIONS)[number];

export const MatchPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  opponent: z.string().max(120).default(''),
  date: z.string().optional(),
  sections: z.record(z.enum(MATCH_PLAN_SECTIONS), z.object({ boardIds: z.array(z.string()), notes: z.string().max(4000).default('') })),
});
export type MatchPlan = z.infer<typeof MatchPlanSchema>;

export function sessionTotalMinutes(s: Pick<Session, 'drills'>): number {
  return s.drills.reduce((n, d) => n + d.durationMin, 0);
}

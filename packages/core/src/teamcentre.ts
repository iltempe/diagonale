import { z } from 'zod';
import { RoleSchema } from './schema';

/** Team Centre (SPEC §13.4): squad, fixtures, call-ups, results, season stats. Pure, headless. */

export const SquadPlayerSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().max(60),
  lastName: z.string().max(60).default(''),
  number: z.number().int().min(0).max(999).optional(),
  role: RoleSchema.optional(),
  birthYear: z.number().int().min(1900).max(2100).optional(),
});
export type SquadPlayer = z.infer<typeof SquadPlayerSchema>;

export const PlayerMatchStatsSchema = z.object({
  minutes: z.number().int().min(0).max(150).default(0),
  goals: z.number().int().min(0).max(20).default(0),
  yellow: z.number().int().min(0).max(2).default(0),
  red: z.number().int().min(0).max(1).default(0),
});
export type PlayerMatchStats = z.infer<typeof PlayerMatchStatsSchema>;

export const FixtureSchema = z.object({
  id: z.string().min(1),
  uid: z.string().optional(),
  date: z.string().describe('ISO date-time'),
  opponent: z.string().max(120),
  home: z.boolean().default(true),
  competition: z.string().max(120).optional(),
  location: z.string().max(200).optional(),
  callup: z
    .object({
      available: z.array(z.string()).default([]),
      starters: z.array(z.string()).default([]),
      bench: z.array(z.string()).default([]),
      captainId: z.string().optional(),
    })
    .optional(),
  result: z
    .object({
      goalsFor: z.number().int().min(0),
      goalsAgainst: z.number().int().min(0),
      players: z.record(z.string(), PlayerMatchStatsSchema).default({}),
    })
    .optional(),
  notes: z.string().max(4000).optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const TeamCentreSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  season: z.string().max(40).optional(),
  squad: z.array(SquadPlayerSchema),
  fixtures: z.array(FixtureSchema),
});
export type TeamCentre = z.infer<typeof TeamCentreSchema>;

// ---------- privacy ----------

export type NamePrivacy = 'full' | 'first' | 'initials';

/** Name as shown in reports for parents. Default privacy is initials (minors). */
export function formatName(p: Pick<SquadPlayer, 'firstName' | 'lastName'>, privacy: NamePrivacy = 'initials'): string {
  const first = p.firstName.trim();
  const last = p.lastName.trim();
  if (privacy === 'full') return [first, last].filter(Boolean).join(' ');
  if (privacy === 'first') return first || (last ? `${last[0]}.` : '');
  return [first, last]
    .filter(Boolean)
    .map((s) => `${s[0]!.toUpperCase()}.`)
    .join(' ');
}

// ---------- stats ----------

export type SeasonPlayerStats = {
  playerId: string;
  calledUp: number;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  yellow: number;
  red: number;
};

export type SeasonTeamStats = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export function fixtureOutcome(f: Fixture): 'W' | 'D' | 'L' | null {
  if (!f.result) return null;
  const d = f.result.goalsFor - f.result.goalsAgainst;
  return d > 0 ? 'W' : d < 0 ? 'L' : 'D';
}

export function seasonStats(tc: Pick<TeamCentre, 'squad' | 'fixtures'>): { team: SeasonTeamStats; players: SeasonPlayerStats[] } {
  const team: SeasonTeamStats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
  const map = new Map<string, SeasonPlayerStats>(
    tc.squad.map((p) => [p.id, { playerId: p.id, calledUp: 0, appearances: 0, starts: 0, minutes: 0, goals: 0, yellow: 0, red: 0 }]),
  );
  for (const f of tc.fixtures) {
    const called = new Set([...(f.callup?.starters ?? []), ...(f.callup?.bench ?? [])]);
    for (const id of called) {
      const s = map.get(id);
      if (s) s.calledUp++;
    }
    if (!f.result) continue;
    team.played++;
    team.goalsFor += f.result.goalsFor;
    team.goalsAgainst += f.result.goalsAgainst;
    const o = fixtureOutcome(f);
    if (o === 'W') (team.won++, (team.points += 3));
    else if (o === 'D') (team.drawn++, (team.points += 1));
    else team.lost++;
    for (const id of f.callup?.starters ?? []) {
      const s = map.get(id);
      if (s) s.starts++;
    }
    for (const [id, ps] of Object.entries(f.result.players)) {
      const s = map.get(id);
      if (!s) continue;
      if (ps.minutes > 0) s.appearances++;
      s.minutes += ps.minutes;
      s.goals += ps.goals;
      s.yellow += ps.yellow;
      s.red += ps.red;
    }
  }
  return { team, players: [...map.values()] };
}

// ---------- ICS (RFC 5545, subset) ----------

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Parse an ICS date (DATE or DATE-TIME, UTC or floating) to an ISO string. */
export function parseIcsDate(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  return z ? new Date(iso + 'Z').toISOString() : new Date(iso).toISOString();
}

export type IcsEvent = { uid?: string; start: string; summary: string; location?: string; description?: string };

export function parseICS(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur?.start) out.push({ summary: '', ...cur } as IcsEvent);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const name = line.slice(0, i).split(';')[0]!.toUpperCase();
      const value = line.slice(i + 1);
      if (name === 'UID') cur.uid = value;
      else if (name === 'DTSTART') cur.start = parseIcsDate(value) ?? undefined;
      else if (name === 'SUMMARY') cur.summary = unescapeText(value);
      else if (name === 'LOCATION') cur.location = unescapeText(value);
      else if (name === 'DESCRIPTION') cur.description = unescapeText(value);
    }
  }
  return out;
}

/**
 * Guess opponent and home/away from an event summary like "Home FC - Rivals" or "Rivals vs Home FC".
 * If the team name is not found, the whole summary becomes the opponent.
 */
export function fixtureFromEvent(ev: IcsEvent, teamName: string, id: string): Fixture {
  const parts = ev.summary.split(/\s+(?:-|–|vs\.?|v)\s+/i).map((s) => s.trim());
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
  const tn = norm(teamName);
  let opponent = ev.summary;
  let home = true;
  if (parts.length === 2 && tn) {
    if (norm(parts[0]!).includes(tn)) opponent = parts[1]!;
    else if (norm(parts[1]!).includes(tn)) {
      opponent = parts[0]!;
      home = false;
    }
  }
  return { id, uid: ev.uid, date: ev.start, opponent, home, ...(ev.location ? { location: ev.location } : {}) };
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** ICS feed of the fixtures. Contains no player data (SPEC §13.4). */
export function toICS(tc: Pick<TeamCentre, 'name' | 'fixtures'>, opts: { durationMin?: number; now?: Date } = {}): string {
  const dur = (opts.durationMin ?? 105) * 60000;
  const stamp = icsDate((opts.now ?? new Date()).toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diagonale//Team Centre//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(tc.name)}`];
  for (const f of tc.fixtures) {
    const summary = f.home ? `${tc.name} - ${f.opponent}` : `${f.opponent} - ${tc.name}`;
    const result = f.result ? ` (${f.home ? f.result.goalsFor : f.result.goalsAgainst}-${f.home ? f.result.goalsAgainst : f.result.goalsFor})` : '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${f.uid ?? `${f.id}@diagonale`}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(f.date)}`,
      `DTEND:${icsDate(new Date(new Date(f.date).getTime() + dur).toISOString())}`,
      `SUMMARY:${escapeText(summary + result)}`,
      ...(f.location ? [`LOCATION:${escapeText(f.location)}`] : []),
      ...(f.competition ? [`CATEGORIES:${escapeText(f.competition)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Configurable external calendar source hook (e.g. a TempeFootball dataset): accepts either ICS text
 * or a JSON array of {date, opponent, home?, competition?, location?, uid?}.
 */
export function parseExternalFixtures(text: string, teamName: string, idFor: (i: number) => string): Fixture[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('BEGIN:VCALENDAR')) return parseICS(trimmed).map((e, i) => fixtureFromEvent(e, teamName, idFor(i)));
  const data = JSON.parse(trimmed) as unknown;
  const arr = Array.isArray(data) ? data : ((data as { fixtures?: unknown[] }).fixtures ?? []);
  return arr.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    return FixtureSchema.parse({
      id: idFor(i),
      uid: r.uid ?? r.id,
      date: new Date(String(r.date ?? r.datetime ?? r.kickoff)).toISOString(),
      opponent: String(r.opponent ?? r.away ?? ''),
      home: r.home !== false,
      competition: r.competition ?? undefined,
      location: r.location ?? r.venue ?? undefined,
    });
  });
}

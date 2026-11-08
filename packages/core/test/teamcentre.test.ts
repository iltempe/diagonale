import { describe, expect, it } from 'vitest';
import { fixtureFromEvent, formatName, parseExternalFixtures, parseICS, seasonStats, sessionTotalMinutes, toICS, type TeamCentre } from '../src';

const tc: TeamCentre = {
  id: 't',
  name: 'Diagonale U12',
  squad: [
    { id: 'a', firstName: 'Luca', lastName: 'Rossi', number: 9 },
    { id: 'b', firstName: 'Marco', lastName: 'Bianchi', number: 1 },
  ],
  fixtures: [
    {
      id: 'f1',
      date: '2026-09-14T09:30:00.000Z',
      opponent: 'Rivali, FC',
      home: true,
      callup: { available: ['a', 'b'], starters: ['a', 'b'], bench: [] },
      result: { goalsFor: 3, goalsAgainst: 1, players: { a: { minutes: 60, goals: 2, yellow: 1, red: 0 }, b: { minutes: 60, goals: 0, yellow: 0, red: 0 } } },
    },
    {
      id: 'f2',
      date: '2026-09-21T09:30:00.000Z',
      opponent: 'Altri',
      home: false,
      callup: { available: ['a'], starters: ['a'], bench: ['b'] },
      result: { goalsFor: 1, goalsAgainst: 1, players: { a: { minutes: 45, goals: 1, yellow: 0, red: 0 } } },
    },
    { id: 'f3', date: '2026-09-28T09:30:00.000Z', opponent: 'Futuri', home: true },
  ],
};

describe('team centre', () => {
  it('formats names with privacy (initials by default)', () => {
    expect(formatName({ firstName: 'Luca', lastName: 'Rossi' })).toBe('L. R.');
    expect(formatName({ firstName: 'Luca', lastName: 'Rossi' }, 'first')).toBe('Luca');
    expect(formatName({ firstName: 'Luca', lastName: 'Rossi' }, 'full')).toBe('Luca Rossi');
  });

  it('computes season stats', () => {
    const s = seasonStats(tc);
    expect(s.team).toEqual({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 4, goalsAgainst: 2, points: 4 });
    const a = s.players.find((p) => p.playerId === 'a')!;
    expect(a).toMatchObject({ calledUp: 2, appearances: 2, starts: 2, minutes: 105, goals: 3, yellow: 1 });
    expect(s.players.find((p) => p.playerId === 'b')).toMatchObject({ calledUp: 2, appearances: 1, starts: 1 });
  });

  it('round-trips fixtures through ICS without player data', () => {
    const ics = toICS(tc, { now: new Date('2026-01-01T00:00:00Z') });
    expect(ics).toContain('SUMMARY:Diagonale U12 - Rivali\\, FC (3-1)');
    expect(ics).toContain('SUMMARY:Altri - Diagonale U12 (1-1)');
    expect(ics).not.toContain('Rossi');
    const events = parseICS(ics);
    expect(events).toHaveLength(3);
    expect(events[0]!.start).toBe('2026-09-14T09:30:00.000Z');
    const f = fixtureFromEvent(events[1]!, 'Diagonale U12', 'x');
    expect(f).toMatchObject({ opponent: 'Altri', home: false });
  });

  it('parses folded ICS lines and DATE values', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261004\r\nSUMMARY:Squadra A vs Diago\r\n nale U12\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const [e] = parseICS(ics);
    expect(e!.summary).toBe('Squadra A vs Diagonale U12');
    expect(fixtureFromEvent(e!, 'Diagonale U12', 'i')).toMatchObject({ opponent: 'Squadra A', home: false });
  });

  it('imports an external JSON source', () => {
    const list = parseExternalFixtures(JSON.stringify([{ date: '2026-10-10T10:00:00Z', opponent: 'X', home: false, venue: 'Campo 2' }]), 'T', (i) => `e${i}`);
    expect(list[0]).toMatchObject({ id: 'e0', opponent: 'X', home: false, location: 'Campo 2' });
  });

  it('sums session minutes', () => {
    expect(sessionTotalMinutes({ drills: [{ boardId: 'a', durationMin: 15, notes: '', players: '' }, { boardId: 'b', durationMin: 20, notes: '', players: '' }] })).toBe(35);
  });
});

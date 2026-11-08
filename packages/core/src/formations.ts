import type { PitchConfig, Position, Role } from './schema';

/**
 * A formation slot. Coordinates are normalized on the team's defensive half:
 *  - depth 0 = own goal line, 1 = halfway line
 *  - lateral 0 = the team's left touchline, 1 = right touchline
 * The away team is mirrored (see formationPosition).
 */
export type FormationSlot = { role: Role; depth: number; lateral: number; number: number };

export type Formation = {
  id: string;
  label: { en: string; it: string };
  players: 5 | 7 | 9 | 11;
  suggestedPitch?: { length: number; width: number };
  slots: FormationSlot[];
};

type S = [Role, number, number, number];
const s = (rows: S[]): FormationSlot[] =>
  rows.map(([role, depth, lateral, number]) => ({ role, depth, lateral, number }));

const GK: S = ['GK', 0.05, 0.5, 1];
const BACK4: S[] = [
  ['FB', 0.3, 0.12, 3],
  ['CB', 0.25, 0.38, 5],
  ['CB', 0.25, 0.62, 4],
  ['FB', 0.3, 0.88, 2],
];
const BACK3: S[] = [
  ['CB', 0.26, 0.26, 4],
  ['CB', 0.24, 0.5, 5],
  ['CB', 0.26, 0.74, 6],
];
const BACK5: S[] = [
  ['WB', 0.36, 0.08, 3],
  ['CB', 0.25, 0.28, 4],
  ['CB', 0.23, 0.5, 5],
  ['CB', 0.25, 0.72, 6],
  ['WB', 0.36, 0.92, 2],
];

const f = (
  id: string,
  en: string,
  it: string,
  slots: S[],
  players: Formation['players'] = 11,
  suggestedPitch?: Formation['suggestedPitch'],
): Formation => ({ id, label: { en, it }, players, slots: s(slots), suggestedPitch });

export const FORMATIONS: Formation[] = [
  f('4-4-2', '4-4-2', '4-4-2', [
    GK,
    ...BACK4,
    ['W', 0.6, 0.12, 11],
    ['CM', 0.55, 0.38, 8],
    ['CM', 0.55, 0.62, 6],
    ['W', 0.6, 0.88, 7],
    ['ST', 0.92, 0.4, 10],
    ['ST', 0.92, 0.6, 9],
  ]),
  f('4-4-2-diamond', '4-4-2 diamond', '4-4-2 rombo', [
    GK,
    ...BACK4,
    ['DM', 0.45, 0.5, 6],
    ['CM', 0.58, 0.3, 8],
    ['CM', 0.58, 0.7, 7],
    ['AM', 0.74, 0.5, 10],
    ['ST', 0.93, 0.4, 11],
    ['ST', 0.93, 0.6, 9],
  ]),
  f('4-3-3', '4-3-3', '4-3-3', [
    GK,
    ...BACK4,
    ['DM', 0.45, 0.5, 6],
    ['CM', 0.6, 0.3, 10],
    ['CM', 0.6, 0.7, 8],
    ['W', 0.88, 0.15, 11],
    ['ST', 0.95, 0.5, 9],
    ['W', 0.88, 0.85, 7],
  ]),
  f('4-2-3-1', '4-2-3-1', '4-2-3-1', [
    GK,
    ...BACK4,
    ['DM', 0.48, 0.38, 6],
    ['DM', 0.48, 0.62, 8],
    ['W', 0.72, 0.15, 11],
    ['AM', 0.75, 0.5, 10],
    ['W', 0.72, 0.85, 7],
    ['ST', 0.95, 0.5, 9],
  ]),
  f('4-1-4-1', '4-1-4-1', '4-1-4-1', [
    GK,
    ...BACK4,
    ['DM', 0.45, 0.5, 6],
    ['W', 0.65, 0.12, 11],
    ['CM', 0.64, 0.38, 8],
    ['CM', 0.64, 0.62, 10],
    ['W', 0.65, 0.88, 7],
    ['ST', 0.95, 0.5, 9],
  ]),
  f('4-3-1-2', '4-3-1-2', '4-3-1-2', [
    GK,
    ...BACK4,
    ['DM', 0.45, 0.5, 6],
    ['CM', 0.55, 0.28, 8],
    ['CM', 0.55, 0.72, 4],
    ['AM', 0.75, 0.5, 10],
    ['ST', 0.93, 0.38, 11],
    ['ST', 0.93, 0.62, 9],
  ]),
  f('4-3-2-1', '4-3-2-1 (Christmas tree)', '4-3-2-1 (albero di Natale)', [
    GK,
    ...BACK4,
    ['DM', 0.45, 0.5, 6],
    ['CM', 0.52, 0.25, 8],
    ['CM', 0.52, 0.75, 4],
    ['AM', 0.78, 0.35, 10],
    ['AM', 0.78, 0.65, 7],
    ['ST', 0.95, 0.5, 9],
  ]),
  f('4-5-1', '4-5-1', '4-5-1', [
    GK,
    ...BACK4,
    ['W', 0.62, 0.1, 11],
    ['CM', 0.55, 0.32, 8],
    ['DM', 0.48, 0.5, 6],
    ['CM', 0.55, 0.68, 10],
    ['W', 0.62, 0.9, 7],
    ['ST', 0.93, 0.5, 9],
  ]),
  f('4-4-1-1', '4-4-1-1', '4-4-1-1', [
    GK,
    ...BACK4,
    ['W', 0.58, 0.12, 11],
    ['CM', 0.54, 0.38, 8],
    ['CM', 0.54, 0.62, 6],
    ['W', 0.58, 0.88, 7],
    ['AM', 0.78, 0.5, 10],
    ['ST', 0.95, 0.5, 9],
  ]),
  f('4-2-2-2', '4-2-2-2', '4-2-2-2', [
    GK,
    ...BACK4,
    ['DM', 0.48, 0.35, 6],
    ['DM', 0.48, 0.65, 8],
    ['AM', 0.72, 0.2, 11],
    ['AM', 0.72, 0.8, 7],
    ['ST', 0.93, 0.4, 10],
    ['ST', 0.93, 0.6, 9],
  ]),
  f('3-5-2', '3-5-2', '3-5-2', [
    GK,
    ...BACK3,
    ['WB', 0.55, 0.08, 3],
    ['CM', 0.55, 0.32, 8],
    ['DM', 0.47, 0.5, 7],
    ['CM', 0.55, 0.68, 10],
    ['WB', 0.55, 0.92, 2],
    ['ST', 0.93, 0.4, 11],
    ['ST', 0.93, 0.6, 9],
  ]),
  f('3-4-3', '3-4-3', '3-4-3', [
    GK,
    ...BACK3,
    ['WB', 0.55, 0.1, 3],
    ['CM', 0.52, 0.38, 8],
    ['CM', 0.52, 0.62, 10],
    ['WB', 0.55, 0.9, 2],
    ['W', 0.88, 0.18, 11],
    ['ST', 0.95, 0.5, 9],
    ['W', 0.88, 0.82, 7],
  ]),
  f('3-4-2-1', '3-4-2-1', '3-4-2-1', [
    GK,
    ...BACK3,
    ['WB', 0.55, 0.1, 3],
    ['CM', 0.5, 0.38, 8],
    ['CM', 0.5, 0.62, 6],
    ['WB', 0.55, 0.9, 2],
    ['AM', 0.78, 0.35, 10],
    ['AM', 0.78, 0.65, 7],
    ['ST', 0.95, 0.5, 9],
  ]),
  f('3-4-1-2', '3-4-1-2', '3-4-1-2', [
    GK,
    ...BACK3,
    ['WB', 0.55, 0.1, 3],
    ['CM', 0.5, 0.38, 8],
    ['CM', 0.5, 0.62, 6],
    ['WB', 0.55, 0.9, 2],
    ['AM', 0.76, 0.5, 10],
    ['ST', 0.93, 0.4, 11],
    ['ST', 0.93, 0.6, 9],
  ]),
  f('3-1-4-2', '3-1-4-2', '3-1-4-2', [
    GK,
    ...BACK3,
    ['DM', 0.42, 0.5, 8],
    ['W', 0.6, 0.1, 3],
    ['CM', 0.58, 0.37, 10],
    ['CM', 0.58, 0.63, 7],
    ['W', 0.6, 0.9, 2],
    ['ST', 0.93, 0.4, 11],
    ['ST', 0.93, 0.6, 9],
  ]),
  f('5-3-2', '5-3-2', '5-3-2', [
    GK,
    ...BACK5,
    ['CM', 0.55, 0.28, 8],
    ['DM', 0.5, 0.5, 10],
    ['CM', 0.55, 0.72, 7],
    ['ST', 0.92, 0.4, 11],
    ['ST', 0.92, 0.6, 9],
  ]),
  f('5-4-1', '5-4-1', '5-4-1', [
    GK,
    ...BACK5,
    ['W', 0.6, 0.12, 11],
    ['CM', 0.55, 0.38, 8],
    ['CM', 0.55, 0.62, 10],
    ['W', 0.6, 0.88, 7],
    ['ST', 0.93, 0.5, 9],
  ]),
  // ---- Youth: 5-a-side ----
  f(
    '5-2-1-1',
    '5-a-side 2-1-1',
    'Calcio a 5 2-1-1',
    [GK, ['CB', 0.3, 0.3, 2], ['CB', 0.3, 0.7, 3], ['CM', 0.6, 0.5, 4], ['ST', 0.9, 0.5, 5]],
    5,
    { length: 40, width: 25 },
  ),
  f(
    '5-1-2-1',
    '5-a-side 1-2-1',
    'Calcio a 5 1-2-1',
    [GK, ['CB', 0.3, 0.5, 2], ['W', 0.6, 0.2, 3], ['W', 0.6, 0.8, 4], ['ST', 0.92, 0.5, 5]],
    5,
    { length: 40, width: 25 },
  ),
  // ---- Youth: 7-a-side ----
  f(
    '7-2-3-1',
    '7-a-side 2-3-1',
    'Calcio a 7 2-3-1',
    [
      GK,
      ['CB', 0.28, 0.32, 2],
      ['CB', 0.28, 0.68, 3],
      ['W', 0.6, 0.15, 4],
      ['CM', 0.55, 0.5, 5],
      ['W', 0.6, 0.85, 6],
      ['ST', 0.92, 0.5, 7],
    ],
    7,
    { length: 60, width: 40 },
  ),
  f(
    '7-3-2-1',
    '7-a-side 3-2-1',
    'Calcio a 7 3-2-1',
    [
      GK,
      ['FB', 0.3, 0.2, 2],
      ['CB', 0.26, 0.5, 3],
      ['FB', 0.3, 0.8, 4],
      ['CM', 0.6, 0.35, 5],
      ['CM', 0.6, 0.65, 6],
      ['ST', 0.92, 0.5, 7],
    ],
    7,
    { length: 60, width: 40 },
  ),
  f(
    '7-3-1-2',
    '7-a-side 3-1-2',
    'Calcio a 7 3-1-2',
    [
      GK,
      ['FB', 0.3, 0.2, 2],
      ['CB', 0.26, 0.5, 3],
      ['FB', 0.3, 0.8, 4],
      ['CM', 0.58, 0.5, 5],
      ['ST', 0.9, 0.35, 6],
      ['ST', 0.9, 0.65, 7],
    ],
    7,
    { length: 60, width: 40 },
  ),
  // ---- Youth: 9-a-side ----
  f(
    '9-3-3-2',
    '9-a-side 3-3-2',
    'Calcio a 9 3-3-2',
    [
      GK,
      ['FB', 0.3, 0.2, 2],
      ['CB', 0.26, 0.5, 3],
      ['FB', 0.3, 0.8, 4],
      ['W', 0.6, 0.18, 5],
      ['CM', 0.56, 0.5, 6],
      ['W', 0.6, 0.82, 7],
      ['ST', 0.92, 0.38, 8],
      ['ST', 0.92, 0.62, 9],
    ],
    9,
    { length: 75, width: 50 },
  ),
  f(
    '9-3-2-3',
    '9-a-side 3-2-3',
    'Calcio a 9 3-2-3',
    [
      GK,
      ['FB', 0.3, 0.2, 2],
      ['CB', 0.26, 0.5, 3],
      ['FB', 0.3, 0.8, 4],
      ['CM', 0.55, 0.36, 5],
      ['CM', 0.55, 0.64, 6],
      ['W', 0.88, 0.15, 7],
      ['ST', 0.94, 0.5, 9],
      ['W', 0.88, 0.85, 8],
    ],
    9,
    { length: 75, width: 50 },
  ),
  f(
    '9-3-4-1',
    '9-a-side 3-4-1',
    'Calcio a 9 3-4-1',
    [
      GK,
      ['CB', 0.27, 0.28, 2],
      ['CB', 0.25, 0.5, 3],
      ['CB', 0.27, 0.72, 4],
      ['W', 0.6, 0.1, 5],
      ['CM', 0.56, 0.38, 6],
      ['CM', 0.56, 0.62, 8],
      ['W', 0.6, 0.9, 7],
      ['ST', 0.93, 0.5, 9],
    ],
    9,
    { length: 75, width: 50 },
  ),
];

export function getFormation(id: string): Formation | undefined {
  return FORMATIONS.find((f) => f.id === id);
}

/**
 * Convert a formation slot to pitch meters. Home attacks +x, away is mirrored.
 * `compactness` scales the depth (1 = default spread over the own half).
 */
export function formationPosition(
  slot: Pick<FormationSlot, 'depth' | 'lateral'>,
  side: 'home' | 'away',
  pitch: Pick<PitchConfig, 'length' | 'width'>,
): Position {
  const half = pitch.length / 2;
  const x = slot.depth * half;
  const y = slot.lateral * pitch.width;
  return side === 'home'
    ? { x: round(x), y: round(y) }
    : { x: round(pitch.length - x), y: round(pitch.width - y) };
}

const round = (n: number) => Math.round(n * 100) / 100;

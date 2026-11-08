import { z } from 'zod';

/** Current board schema version. Bump together with a migration in migrations.ts. */
export const SCHEMA_VERSION = 1 as const;

export const BALL_ID = 'ball' as const;

export const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const ROLES = ['GK', 'CB', 'FB', 'WB', 'DM', 'CM', 'AM', 'W', 'ST'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const BOARD_KINDS = ['tactic', 'set_piece', 'training', 'match_plan'] as const;
export const BoardKindSchema = z.enum(BOARD_KINDS);
export type BoardKind = z.infer<typeof BoardKindSchema>;

export const SURFACES = ['grass_stripes', 'grass_plain', 'artificial', 'chalkboard'] as const;
export const PITCH_VIEWS = [
  'full',
  'half_attack',
  'half_defence',
  'third_defensive',
  'third_middle',
  'third_final',
  'box',
  'wide_left',
  'wide_right',
] as const;

export const RectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type Rect = z.infer<typeof RectSchema>;

export const PitchViewSchema = z.union([z.enum(PITCH_VIEWS), z.object({ custom: RectSchema })]);
export type PitchView = z.infer<typeof PitchViewSchema>;

export const PitchConfigSchema = z.object({
  length: z.number().min(5).max(130).describe('Pitch length in meters (x axis). Default 105.'),
  width: z.number().min(5).max(100).describe('Pitch width in meters (y axis). Default 68.'),
  view: PitchViewSchema,
  surface: z.enum(SURFACES),
  orientation: z.enum(['horizontal', 'vertical']),
  perspective: z.enum(['flat', 'broadcast']),
  grid: z.object({ cellMeters: z.number().positive(), visible: z.boolean() }).optional(),
  /** Decision D-004: 'outline' draws only the boundary (training grids). */
  markings: z.enum(['regulation', 'outline']).optional(),
});
export type PitchConfig = z.infer<typeof PitchConfigSchema>;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');

export const KitSchema = z.object({
  primary: color,
  secondary: color,
  number: color,
  gkPrimary: color,
});
export type Kit = z.infer<typeof KitSchema>;

export const PlayerSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  number: z.number().int().min(0).max(999).optional(),
  name: z.string().max(80).optional(),
  shortName: z.string().max(24).optional(),
  role: RoleSchema.optional(),
  photoUrl: z.string().optional(),
  flag: z.string().length(2).optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kit: KitSchema,
  players: z.array(PlayerSchema),
});
export type Team = z.infer<typeof TeamSchema>;

export const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  facing: z.number().finite().optional().describe('Facing direction in degrees, 0 = towards +x'),
});
export type Position = z.infer<typeof PositionSchema>;

export const PathHintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('straight') }),
  z.object({ type: z.literal('curve'), control: Vec2Schema }),
  z.object({ type: z.literal('lofted'), peakHeight: z.number().min(0).max(40) }),
]);
export type PathHint = z.infer<typeof PathHintSchema>;

export const ARROW_STYLES = ['pass', 'run', 'carry', 'press', 'lofted', 'block', 'shot'] as const;
export const ArrowStyleSchema = z.enum(ARROW_STYLES);
export type ArrowStyle = z.infer<typeof ArrowStyleSchema>;

export const AnchorSchema = z.union([z.object({ entityId: z.string().min(1) }), Vec2Schema]);
export type Anchor = z.infer<typeof AnchorSchema>;

export const EQUIPMENT_ITEMS = [
  'cone',
  'disc',
  'pole',
  'mini_goal',
  'goal',
  'hurdle',
  'ladder',
  'mannequin',
  'ring',
  'bib',
  'ball_pile',
  'rebounder',
  'flag',
  'marker_line',
  'tall_cone',
  'arc',
  'wall',
] as const;
export const EquipmentItemSchema = z.enum(EQUIPMENT_ITEMS);
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;

export const ArrowAnnotationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('arrow'),
  style: ArrowStyleSchema,
  from: AnchorSchema,
  to: AnchorSchema,
  control: Vec2Schema.optional(),
  label: z.string().max(80).optional(),
});
export const ZoneAnnotationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('zone'),
  shape: z.enum(['rect', 'ellipse', 'polygon']),
  points: z.array(Vec2Schema).min(2),
  color,
  opacity: z.number().min(0).max(1),
});
export const LineAnnotationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('line'),
  points: z.array(Vec2Schema).min(2),
  dashed: z.boolean().optional(),
  color,
});
export const TextAnnotationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  at: Vec2Schema,
  text: z.string().max(500),
  size: z.number().min(0.5).max(20).describe('Font size in meters'),
});
export const EquipmentAnnotationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('equipment'),
  item: EquipmentItemSchema,
  at: Vec2Schema,
  rotation: z.number().optional(),
});

export const AnnotationSchema = z.discriminatedUnion('type', [
  ArrowAnnotationSchema,
  ZoneAnnotationSchema,
  LineAnnotationSchema,
  TextAnnotationSchema,
  EquipmentAnnotationSchema,
]);
export type Annotation = z.infer<typeof AnnotationSchema>;
export type ArrowAnnotation = z.infer<typeof ArrowAnnotationSchema>;
export type ZoneAnnotation = z.infer<typeof ZoneAnnotationSchema>;
export type LineAnnotation = z.infer<typeof LineAnnotationSchema>;
export type TextAnnotation = z.infer<typeof TextAnnotationSchema>;
export type EquipmentAnnotation = z.infer<typeof EquipmentAnnotationSchema>;

export const CameraSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed') }),
  z.object({ mode: z.literal('follow_ball'), zoom: z.number().min(1).max(6) }),
  z.object({
    mode: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
]);
export type CameraSpec = z.infer<typeof CameraSpecSchema>;

export const EASINGS = ['linear', 'easeInOut', 'easeOut'] as const;
export const EasingSchema = z.enum(EASINGS);
export type Easing = z.infer<typeof EasingSchema>;

export const PhaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  durationMs: z.number().int().min(0).max(60000),
  holdMs: z.number().int().min(0).max(60000),
  easing: EasingSchema,
  positions: z.record(z.string(), PositionSchema),
  paths: z.record(z.string(), PathHintSchema).optional(),
  annotations: z.array(AnnotationSchema),
  camera: CameraSpecSchema.optional(),
  ballCarrierId: z.string().optional(),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const BoardSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().max(200),
  kind: BoardKindSchema,
  pitch: PitchConfigSchema,
  teams: z.array(TeamSchema).min(1).max(2),
  ball: z.object({ id: z.literal(BALL_ID) }),
  phases: z.array(PhaseSchema).min(1),
  sequencesUsed: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Board = z.infer<typeof BoardSchema>;

export type EntityId = string;

// ---- Sequences ----

export const SequencePhaseSchema = z.object({
  durationMs: z.number().int().min(0).max(60000),
  holdMs: z.number().int().min(0).max(60000).optional(),
  label: z.string().optional(),
  positions: z.record(z.string(), PositionSchema),
  paths: z.record(z.string(), PathHintSchema).optional(),
  annotations: z.array(AnnotationSchema).default([]),
  ballCarrier: z.string().optional(),
});

export const SequenceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  slots: z.array(
    z.object({
      slotId: z.string().min(1),
      role: RoleSchema.optional(),
      team: z.enum(['home', 'away']),
    }),
  ),
  phases: z.array(SequencePhaseSchema).min(1),
  coordinateFrame: z.enum(['absolute', 'relative_to_ball']),
  /** Pitch the sequence was authored on; absolute coordinates are rescaled to the target pitch. */
  pitch: z.object({ length: z.number(), width: z.number() }).optional(),
});
export type Sequence = z.infer<typeof SequenceSchema>;
export type SequenceInput = z.input<typeof SequenceSchema>;

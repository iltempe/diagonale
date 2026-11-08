import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { PUBLIC_COMMANDS } from './commands/commands';
import { QUERIES } from './commands/queries';

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema of the arguments (object). */
  inputSchema: Record<string, unknown>;
  kind: 'command' | 'query';
};

function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const s = zodToJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** Hidden/internal args that the model should not see. */
const HIDDEN_ARGS = new Set(['seed', 'playerIds']);

function strip(schema: Record<string, unknown>): Record<string, unknown> {
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props) return schema;
  const out: Record<string, unknown> = { ...schema, properties: { ...props } };
  for (const k of HIDDEN_ARGS) delete (out.properties as Record<string, unknown>)[k];
  if (Array.isArray(out.required)) out.required = (out.required as string[]).filter((r) => !HIDDEN_ARGS.has(r));
  return out;
}

/** AI tool definitions generated from the same Zod schemas used by the command bus. */
export function toolDefinitions(opts: { include?: (name: string) => boolean } = {}): ToolDef[] {
  const defs: ToolDef[] = [
    ...PUBLIC_COMMANDS.map((c) => ({
      name: c.name,
      description: c.description,
      inputSchema: strip(jsonSchema(c.schema)),
      kind: 'command' as const,
    })),
    ...QUERIES.map((q) => ({
      name: q.name,
      description: q.description,
      inputSchema: strip(jsonSchema(q.schema)),
      kind: 'query' as const,
    })),
  ];
  return opts.include ? defs.filter((d) => opts.include!(d.name)) : defs;
}

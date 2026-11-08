import { describe, expect, it } from 'vitest';
import { createEmptyBoard, parseBoard, serializeBoard, toolDefinitions, BoardParseError } from '../src';

describe('migrations & serialization', () => {
  it('round-trips a board', () => {
    const b = createEmptyBoard({ id: 'x', title: 'T' });
    expect(parseBoard(JSON.parse(serializeBoard(b)))).toEqual(b);
  });

  it('migrates a v0 board', () => {
    const b = createEmptyBoard({ id: 'x' }) as unknown as Record<string, unknown>;
    const { schemaVersion: _s, ball: _b, ...v0 } = b;
    const phases = (v0.phases as Record<string, unknown>[]).map(({ easing: _e, annotations: _a, ...p }) => p);
    const out = parseBoard({ ...v0, phases });
    expect(out.schemaVersion).toBe(1);
    expect(out.phases[0]!.annotations).toEqual([]);
  });

  it('rejects future versions and garbage', () => {
    expect(() => parseBoard({ schemaVersion: 99 })).toThrow(BoardParseError);
    expect(() => parseBoard('nope')).toThrow(BoardParseError);
  });

  it('generates JSON-schema tool definitions from Zod', () => {
    const tools = toolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('applyFormation');
    expect(names).toContain('describeBoard');
    expect(names).not.toContain('replaceBoard');
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(10);
    }
    const af = tools.find((t) => t.name === 'applyFormation')!;
    expect(Object.keys(af.inputSchema.properties as object)).not.toContain('playerIds');
  });
});

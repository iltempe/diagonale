import { describe, expect, it } from 'vitest';
import { createEmptyBoard, Dispatcher, isQuery, runQuery, describeBoard, toolDefinitions } from '@diagonale/core';
import { parseCommandBlock, runAgent, type AgentEvent, type AIProvider, type ChatEvent, type ChatRequest } from '../src';

/** Scripted fake model: returns the next scripted turn for each call. */
function scripted(turns: ChatEvent[][], tools = true): AIProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    id: 'fake',
    capabilities: { tools, vision: false, jsonMode: false },
    requests,
    async *chat(req) {
      requests.push(JSON.parse(JSON.stringify(req)));
      for (const e of turns.shift() ?? [{ type: 'text', delta: 'done' }, { type: 'done' }]) yield e;
    },
  };
}

function executor(d: Dispatcher) {
  return {
    execute: (name: string, args: unknown) => {
      if (isQuery(name)) return runQuery(d.board, name, args);
      const r = d.dispatch(name, args);
      return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error };
    },
    describe: () => describeBoard(d.board).text,
  };
}

async function run(gen: AsyncGenerator<AgentEvent>) {
  const evs: AgentEvent[] = [];
  for await (const e of gen) evs.push(e);
  return evs;
}

describe('agent loop', () => {
  it('executes tool calls through the command bus and feeds results back', async () => {
    const d = new Dispatcher(createEmptyBoard());
    const provider = scripted([
      [
        { type: 'tool_call', id: '1', name: 'applyFormation', args: { team: 'home', formationId: '4-3-3' } },
        { type: 'tool_call', id: '2', name: 'applyFormation', args: { team: 'away', formationId: '4-4-2' } },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } },
      ],
      [{ type: 'tool_call', id: '3', name: 'addPhase', args: { label: 'Build-up' } }, { type: 'done' }],
      [{ type: 'text', delta: 'Built it.' }, { type: 'done', usage: { inputTokens: 3, outputTokens: 2 } }],
    ]);
    d.begin('AI');
    const evs = await run(
      runAgent({ provider, model: 'm', tools: toolDefinitions(), executor: executor(d), locale: 'it', history: [], userInput: '4-3-3 vs 4-4-2' }),
    );
    d.commit();
    expect(d.board.teams[0]!.players).toHaveLength(11);
    expect(d.board.teams[1]!.players).toHaveLength(11);
    expect(d.board.phases).toHaveLength(2);
    expect(d.historyLabels().past).toEqual(['AI']);
    expect(evs.filter((e) => e.type === 'tool_result').every((e) => (e as { ok: boolean }).ok)).toBe(true);
    const done = evs.find((e) => e.type === 'done') as Extract<AgentEvent, { type: 'done' }>;
    expect(done.usage).toEqual({ inputTokens: 13, outputTokens: 7 });
    // system prompt is localized and includes the board description
    expect(provider.requests[0]!.system).toContain('Sei l\'AI Coach');
    expect(provider.requests[1]!.system).toContain('11 players');
    // tool results were sent back
    expect(provider.requests[1]!.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('returns command errors to the model', async () => {
    const d = new Dispatcher(createEmptyBoard());
    const provider = scripted([
      [{ type: 'tool_call', id: '1', name: 'moveEntity', args: { phase: 9, entityId: 'ball', x: 1, y: 1 } }, { type: 'done' }],
      [{ type: 'text', delta: 'ok' }, { type: 'done' }],
    ]);
    await run(runAgent({ provider, model: 'm', tools: [], executor: executor(d), locale: 'en', history: [], userInput: 'x' }));
    const toolMsg = provider.requests[1]!.messages.find((m) => m.role === 'tool');
    expect(toolMsg && 'content' in toolMsg && String(toolMsg.content)).toContain('Error');
  });

  it('stops after maxSteps', async () => {
    const d = new Dispatcher(createEmptyBoard());
    const loop = Array.from({ length: 30 }, (_, i) => [
      { type: 'tool_call', id: String(i), name: 'describeBoard', args: {} } as ChatEvent,
      { type: 'done' } as ChatEvent,
    ]);
    const provider = scripted(loop);
    await run(runAgent({ provider, model: 'm', tools: [], executor: executor(d), locale: 'en', history: [], userInput: 'x', maxSteps: 20 }));
    expect(provider.requests).toHaveLength(20);
  });

  it('JSON fallback for models without tool calling, with retry on invalid blocks', async () => {
    const d = new Dispatcher(createEmptyBoard());
    const provider = scripted(
      [
        [{ type: 'text', delta: '```json\n{"commands": [{"nome": 1}]}\n```' }, { type: 'done' }],
        [
          { type: 'text', delta: '```json\n{"commands":[{"name":"applyFormation","args":{"team":"home","formationId":"4-4-2"}}]}\n```' },
          { type: 'done' },
        ],
        [{ type: 'text', delta: 'Fatto.' }, { type: 'done' }],
      ],
      false,
    );
    await run(runAgent({ provider, model: 'm', tools: toolDefinitions(), executor: executor(d), locale: 'it', history: [], userInput: 'x' }));
    expect(d.board.teams[0]!.players).toHaveLength(11);
    expect(provider.requests[0]!.tools).toBeUndefined();
    expect(provider.requests[0]!.system).toContain('"commands"');
    expect(provider.requests).toHaveLength(3);
  });

  it('parses command blocks', () => {
    expect(parseCommandBlock('no json here')).toBeNull();
    expect(parseCommandBlock('```json\n{"commands":[{"name":"addPhase"}]}\n```')).toEqual({
      ok: true,
      commands: [{ name: 'addPhase', args: {} }],
    });
    expect(parseCommandBlock('```json\n{bad\n```')).toMatchObject({ ok: false });
  });
});

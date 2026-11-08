import { describe, expect, it } from 'vitest';
import { createProvider, type ChatEvent, type Message, type ProviderKind } from '../src';
import { fixture, sseFetch } from './helpers';

const CASES: { kind: ProviderKind; fixture: string; url: RegExp }[] = [
  { kind: 'anthropic', fixture: 'anthropic.sse', url: /\/v1\/messages$/ },
  { kind: 'openai-compatible', fixture: 'openai.sse', url: /\/chat\/completions$/ },
  { kind: 'gemini', fixture: 'gemini.sse', url: /:streamGenerateContent\?alt=sse$/ },
];

const history: Message[] = [
  { role: 'user', content: 'Build a 4-3-3' },
  { role: 'assistant', content: 'Sure.', toolCalls: [{ id: 't0', name: 'describeBoard', args: {} }] },
  { role: 'tool', toolCallId: 't0', name: 'describeBoard', content: '"Board ..."' },
];

const tools = [
  {
    name: 'applyFormation',
    description: 'Place a team in a formation',
    inputSchema: {
      type: 'object',
      properties: { team: { type: 'string' }, formationId: { type: 'string' } },
      required: ['team', 'formationId'],
      additionalProperties: false,
    },
  },
];

async function collect(it: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe.each(CASES)('adapter contract: $kind', ({ kind, fixture: fx, url }) => {
  it('streams text, tool calls and usage in the neutral format', async () => {
    const stub = sseFetch(fixture(fx));
    const p = createProvider({ kind }, { apiKey: 'k', fetch: stub.fetch });
    const events = await collect(p.chat({ model: 'm', system: 'sys', messages: history, tools }));
    const text = events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('');
    expect(text).toBe('Placing the 4-3-3.');
    const calls = events.filter((e) => e.type === 'tool_call');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'applyFormation', args: { team: 'home', formationId: '4-3-3' } });
    const done = events[events.length - 1]!;
    expect(done).toMatchObject({ type: 'done', usage: { inputTokens: 120, outputTokens: 45 } });
    expect(stub.calls[0]!.url).toMatch(url);
  });

  it('translates history with tool results', async () => {
    const stub = sseFetch(fixture(fx));
    const p = createProvider({ kind }, { apiKey: 'k', fetch: stub.fetch });
    await collect(p.chat({ model: 'm', system: 'sys', messages: history, tools }));
    const body = JSON.stringify(stub.calls[0]!.body);
    expect(body).toContain('describeBoard');
    expect(body).toContain('sys');
    expect(body).toContain('applyFormation');
  });

  it('reports HTTP errors as error events', async () => {
    const stub = sseFetch('{"error":{"message":"bad key"}}', 401);
    const p = createProvider({ kind }, { apiKey: 'k', fetch: stub.fetch });
    const events = await collect(p.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }));
    expect(events).toEqual([{ type: 'error', error: 'HTTP 401: bad key' }]);
  });
});

describe('provider specifics', () => {
  it('anthropic merges consecutive tool results into one user turn and sends browser header', async () => {
    const stub = sseFetch(fixture('anthropic.sse'));
    const p = createProvider({ kind: 'anthropic' }, { apiKey: 'k', fetch: stub.fetch });
    await collect(
      p.chat({
        model: 'm',
        messages: [
          { role: 'user', content: 'x' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'n', args: {} }, { id: 'b', name: 'n', args: {} }] },
          { role: 'tool', toolCallId: 'a', name: 'n', content: '1' },
          { role: 'tool', toolCallId: 'b', name: 'n', content: '2' },
        ],
      }),
    );
    const body = stub.calls[0]!.body;
    expect(body.messages).toHaveLength(3);
    expect(body.messages[2].content).toHaveLength(2);
    expect((stub.calls[0]!.init!.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('gemini strips unsupported JSON-schema keywords', async () => {
    const stub = sseFetch(fixture('gemini.sse'));
    const p = createProvider({ kind: 'gemini' }, { apiKey: 'k', fetch: stub.fetch });
    await collect(p.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools }));
    const params = stub.calls[0]!.body.tools[0].functionDeclarations[0].parameters;
    expect(params.additionalProperties).toBeUndefined();
    expect(params.required).toEqual(['team', 'formationId']);
  });
});

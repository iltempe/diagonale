import { z } from 'zod';
import { PROMPTS } from './prompts.generated';
import type { AIProvider, ContentPart, Message, ToolCall, ToolDef, Usage } from './types';

/** What the agent needs from the host: run a command/query and describe the board. */
export interface AgentExecutor {
  execute(name: string, args: unknown): { ok: boolean; result?: unknown; error?: string };
  describe(): string;
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; result?: unknown; error?: string }
  | { type: 'step'; step: number }
  | { type: 'done'; usage: Usage; messages: Message[] }
  | { type: 'error'; error: string };

export type AgentOptions = {
  provider: AIProvider;
  model: string;
  tools: ToolDef[];
  executor: AgentExecutor;
  locale: 'it' | 'en' | string;
  /** previous conversation (without system) */
  history: Message[];
  userInput: string | ContentPart[];
  maxSteps?: number;
  signal?: AbortSignal;
  temperature?: number;
};

export function systemPrompt(locale: string, boardText: string, opts: { jsonFallback?: boolean; tools?: ToolDef[] } = {}): string {
  const base = PROMPTS[`coach.${locale.startsWith('it') ? 'it' : 'en'}`] ?? PROMPTS['coach.en']!;
  let s = `${base}\n\n## Current board\n\n${boardText}`;
  if (opts.jsonFallback && opts.tools) {
    s += `\n\n## Command protocol (no native tool calling)\n\nTo change the board reply with ONE fenced JSON block:\n\n\`\`\`json\n{ "commands": [ { "name": "<command>", "args": { } } ] }\n\`\`\`\n\nAvailable commands and their JSON Schema:\n\n`;
    for (const t of opts.tools) s += `- ${t.name}: ${t.description}\n  schema: ${JSON.stringify(t.inputSchema)}\n`;
    s += `\nWhen you are done (or only answering), reply in plain text without a JSON block.`;
  }
  return s;
}

const FallbackSchema = z.object({
  commands: z.array(z.object({ name: z.string().min(1), args: z.record(z.string(), z.unknown()).default({}) })).min(1),
});

/** Extract `{ "commands": [...] }` from a model reply. Returns null if there is no JSON block. */
export function parseCommandBlock(text: string): { ok: true; commands: { name: string; args: unknown }[] } | { ok: false; error: string } | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  let raw = fence?.[1];
  if (!raw) {
    const i = text.indexOf('{"commands"');
    const j = text.indexOf('{ "commands"');
    const k = i >= 0 ? i : j;
    if (k < 0) return null;
    raw = text.slice(k, text.lastIndexOf('}') + 1);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const p = FallbackSchema.safeParse(json);
  if (!p.success) return { ok: false, error: `Invalid command block: ${p.error.issues[0]?.path.join('.')} ${p.error.issues[0]?.message}` };
  return { ok: true, commands: p.data.commands };
}

function truncate(v: unknown, max = 6000): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? null);
  return s.length > max ? s.slice(0, max) + '…(truncated)' : s;
}

/**
 * AI Coach loop: user → model (system prompt + describeBoard + tools) → tool calls executed through
 * the command bus → results back to the model → … until the model stops or maxSteps.
 */
export async function* runAgent(o: AgentOptions): AsyncGenerator<AgentEvent> {
  const maxSteps = o.maxSteps ?? 20;
  const native = o.provider.capabilities.tools;
  const messages: Message[] = [...o.history, { role: 'user', content: o.userInput }];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let retries = 0;

  for (let step = 1; step <= maxSteps; step++) {
    if (o.signal?.aborted) return;
    yield { type: 'step', step };
    const system = systemPrompt(o.locale, o.executor.describe(), { jsonFallback: !native, tools: o.tools });
    let text = '';
    const calls: ToolCall[] = [];
    for await (const ev of o.provider.chat(
      { model: o.model, system, messages, tools: native ? o.tools : undefined, toolChoice: native ? 'auto' : undefined, temperature: o.temperature },
      o.signal,
    )) {
      if (ev.type === 'text') {
        text += ev.delta;
        yield ev;
      } else if (ev.type === 'tool_call') {
        calls.push({ id: ev.id, name: ev.name, args: ev.args });
      } else if (ev.type === 'done') {
        if (ev.usage) {
          usage.inputTokens += ev.usage.inputTokens;
          usage.outputTokens += ev.usage.outputTokens;
        }
      } else if (ev.type === 'error') {
        yield ev;
        return;
      }
    }

    if (native) {
      messages.push({ role: 'assistant', content: text, ...(calls.length ? { toolCalls: calls } : {}) });
      if (!calls.length) break;
      for (const c of calls) {
        yield { type: 'tool_call', id: c.id, name: c.name, args: c.args };
        const r = o.executor.execute(c.name, c.args);
        yield { type: 'tool_result', id: c.id, name: c.name, ok: r.ok, result: r.result, error: r.error };
        messages.push({
          role: 'tool',
          toolCallId: c.id,
          name: c.name,
          content: r.ok ? truncate(r.result ?? 'ok') : `Error: ${r.error}`,
          ...(r.ok ? {} : { isError: true }),
        });
      }
      continue;
    }

    // ---- JSON fallback ----
    messages.push({ role: 'assistant', content: text });
    const parsed = parseCommandBlock(text);
    if (!parsed) break;
    if (!parsed.ok) {
      if (retries++ >= 2) {
        yield { type: 'error', error: parsed.error };
        break;
      }
      messages.push({ role: 'user', content: `${parsed.error}. Reply again with a valid {"commands": [...]} block.` });
      continue;
    }
    const results: string[] = [];
    let failed = false;
    for (const [i, c] of parsed.commands.entries()) {
      const id = `json_${step}_${i}`;
      yield { type: 'tool_call', id, name: c.name, args: c.args };
      const r = o.executor.execute(c.name, c.args);
      yield { type: 'tool_result', id, name: c.name, ok: r.ok, result: r.result, error: r.error };
      if (!r.ok) failed = true;
      results.push(`${c.name}: ${r.ok ? truncate(r.result ?? 'ok', 1500) : 'ERROR ' + r.error}`);
    }
    if (failed && retries++ >= 2) {
      yield { type: 'error', error: results.join('\n') };
      break;
    }
    messages.push({
      role: 'user',
      content: `Command results:\n${results.join('\n')}\n\nContinue with more commands if needed, otherwise reply with a short summary in plain text.`,
    });
  }
  yield { type: 'done', usage, messages };
}

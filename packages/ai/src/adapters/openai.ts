import { errorText, parseSSE, safeJson } from '../sse';
import type { AdapterOptions, AIProvider, ChatEvent, ChatRequest, Message, ModelInfo } from '../types';

type OAMessage =
  | { role: 'system' | 'user'; content: string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAIMessages(messages: Message[], system?: string): OAMessage[] {
  const out: OAMessage[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') out.push({ role: 'user', content: m.content });
      else
        out.push({
          role: 'user',
          content: m.content.map((p) =>
            p.type === 'text'
              ? { type: 'text' as const, text: p.text }
              : { type: 'image_url' as const, image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
          ),
        });
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
              })),
            }
          : {}),
      });
    } else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

export function openAIBody(req: ChatRequest, opts: { streamUsage?: boolean } = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAIMessages(req.messages, req.system),
    stream: true,
  };
  if (opts.streamUsage !== false) body.stream_options = { include_usage: true };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    body.tool_choice =
      req.toolChoice === 'none'
        ? 'none'
        : typeof req.toolChoice === 'object'
          ? { type: 'function', function: { name: req.toolChoice.name } }
          : 'auto';
  }
  return body;
}

/** OpenAI Chat Completions; works with OpenAI, Mistral, Groq, OpenRouter, Together, DeepSeek, Ollama, LM Studio, vLLM. */
export function createOpenAICompatible(opts: AdapterOptions): AIProvider {
  const base = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  const headers = () => ({
    'content-type': 'application/json',
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
  });
  return {
    id: 'openai-compatible',
    capabilities: { tools: true, vision: true, jsonMode: true, ...opts.capabilities },
    async listModels(): Promise<ModelInfo[]> {
      const res = await f(`${base}/models`, { headers: headers() });
      if (!res.ok) throw new Error(await errorText(res));
      const j = (await res.json()) as { data: { id: string }[] };
      return j.data.map((m) => ({ id: m.id }));
    },
    async *chat(req, signal): AsyncGenerator<ChatEvent> {
      let res: Response;
      try {
        res = await f(`${base}/chat/completions`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(openAIBody(req, { streamUsage: !isLocal })),
          signal,
        });
      } catch (e) {
        yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
        return;
      }
      if (!res.ok || !res.body) {
        yield { type: 'error', error: await errorText(res) };
        return;
      }
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      for await (const ev of parseSSE(res.body)) {
        if (ev.data === '[DONE]') break;
        const d = safeJson(ev.data) as Record<string, any>;
        if (d.error) {
          yield { type: 'error', error: d.error.message ?? String(d.error) };
          return;
        }
        if (d.usage) usage = { inputTokens: d.usage.prompt_tokens ?? 0, outputTokens: d.usage.completion_tokens ?? 0 };
        const choice = d.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) yield { type: 'text', delta: delta.content };
        for (const tc of delta?.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          const cur = calls.get(idx) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(idx, cur);
        }
      }
      for (const [i, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        yield { type: 'tool_call', id: c.id || `call_${i}`, name: c.name, args: safeJson(c.args) };
      }
      yield { type: 'done', ...(usage ? { usage } : {}) };
    },
  };
}

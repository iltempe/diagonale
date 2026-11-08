import { errorText, parseSSE, safeJson } from '../sse';
import type { AdapterOptions, AIProvider, ChatEvent, ChatRequest, Message, ModelInfo } from '../types';

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] };

export function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  const push = (role: 'user' | 'assistant', blocks: AnthropicBlock[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'user') {
      const parts = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
      push(
        'user',
        parts.map((p) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } },
        ),
      );
    } else if (m.role === 'assistant') {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} });
      if (blocks.length) push('assistant', blocks);
    } else {
      push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) }]);
    }
  }
  return out;
}

export function anthropicBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 8192,
    messages: toAnthropicMessages(req.messages),
    stream: true,
  };
  if (req.system) body.system = req.system;
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    if (req.toolChoice === 'none') body.tool_choice = { type: 'none' };
    else if (typeof req.toolChoice === 'object') body.tool_choice = { type: 'tool', name: req.toolChoice.name };
    else body.tool_choice = { type: 'auto' };
  }
  return body;
}

export function createAnthropic(opts: AdapterOptions): AIProvider {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const headers = () => ({
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
  });
  return {
    id: 'anthropic',
    capabilities: { tools: true, vision: true, jsonMode: false, maxContext: 200000, ...opts.capabilities },
    async listModels(): Promise<ModelInfo[]> {
      const res = await f(`${base}/v1/models?limit=100`, { headers: headers() });
      if (!res.ok) throw new Error(await errorText(res));
      const j = (await res.json()) as { data: { id: string; display_name?: string }[] };
      return j.data.map((m) => ({ id: m.id, name: m.display_name }));
    },
    async *chat(req, signal): AsyncGenerator<ChatEvent> {
      let res: Response;
      try {
        res = await f(`${base}/v1/messages`, { method: 'POST', headers: headers(), body: JSON.stringify(anthropicBody(req)), signal });
      } catch (e) {
        yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
        return;
      }
      if (!res.ok || !res.body) {
        yield { type: 'error', error: await errorText(res) };
        return;
      }
      const blocks = new Map<number, { kind: 'text' | 'tool'; id?: string; name?: string; json: string }>();
      let input = 0;
      let output = 0;
      for await (const ev of parseSSE(res.body)) {
        const d = safeJson(ev.data) as Record<string, any>;
        switch (d.type) {
          case 'message_start':
            input = d.message?.usage?.input_tokens ?? 0;
            output = d.message?.usage?.output_tokens ?? 0;
            break;
          case 'content_block_start': {
            const b = d.content_block;
            if (b?.type === 'tool_use') blocks.set(d.index, { kind: 'tool', id: b.id, name: b.name, json: '' });
            else blocks.set(d.index, { kind: 'text', json: '' });
            break;
          }
          case 'content_block_delta': {
            const delta = d.delta;
            if (delta?.type === 'text_delta') yield { type: 'text', delta: delta.text };
            else if (delta?.type === 'input_json_delta') {
              const b = blocks.get(d.index);
              if (b) b.json += delta.partial_json ?? '';
            }
            break;
          }
          case 'content_block_stop': {
            const b = blocks.get(d.index);
            if (b?.kind === 'tool') yield { type: 'tool_call', id: b.id!, name: b.name!, args: safeJson(b.json) };
            break;
          }
          case 'message_delta':
            output = d.usage?.output_tokens ?? output;
            break;
          case 'error':
            yield { type: 'error', error: d.error?.message ?? 'Anthropic stream error' };
            return;
        }
      }
      yield { type: 'done', usage: { inputTokens: input, outputTokens: output } };
    },
  };
}

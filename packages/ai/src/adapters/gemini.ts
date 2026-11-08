import { errorText, parseSSE, safeJson } from '../sse';
import type { AdapterOptions, AIProvider, ChatEvent, ChatRequest, Message, ModelInfo } from '../types';

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: { result: unknown } } };

type Content = { role: 'user' | 'model'; parts: Part[] };

const UNSUPPORTED = new Set(['additionalProperties', '$schema', 'exclusiveMinimum', 'exclusiveMaximum', 'default', '$ref', 'definitions']);

/** Reduce a JSON Schema to the OpenAPI subset accepted by Gemini function declarations. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (UNSUPPORTED.has(k)) continue;
    if (k === 'const') {
      out.enum = [v];
      if (!s.type) out.type = typeof v === 'number' ? 'number' : 'string';
      continue;
    }
    if (k === 'type' && Array.isArray(v)) {
      const nonNull = v.filter((t) => t !== 'null');
      out.type = nonNull[0] ?? 'string';
      if (v.includes('null')) out.nullable = true;
      continue;
    }
    if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  if (out.type === 'object' && !out.properties && !out.anyOf) out.properties = {};
  return out;
}

export function toGeminiContents(messages: Message[]): Content[] {
  const out: Content[] = [];
  const push = (role: Content['role'], parts: Part[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  };
  for (const m of messages) {
    if (m.role === 'user') {
      const parts = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
      push(
        'user',
        parts.map((p) => (p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.data } })),
      );
    } else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args ?? {} } });
      if (parts.length) push('model', parts);
    } else {
      push('user', [{ functionResponse: { name: m.name, response: { result: safeJson(m.content) } } }]);
    }
  }
  return out;
}

export function geminiBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  const gen: Record<string, unknown> = {};
  if (req.temperature !== undefined) gen.temperature = req.temperature;
  if (req.maxTokens !== undefined) gen.maxOutputTokens = req.maxTokens;
  if (Object.keys(gen).length) body.generationConfig = gen;
  if (req.tools?.length) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.inputSchema),
        })),
      },
    ];
    body.toolConfig = {
      functionCallingConfig:
        req.toolChoice === 'none'
          ? { mode: 'NONE' }
          : typeof req.toolChoice === 'object'
            ? { mode: 'ANY', allowedFunctionNames: [req.toolChoice.name] }
            : { mode: 'AUTO' },
    };
  }
  return body;
}

export function createGemini(opts: AdapterOptions): AIProvider {
  const base = (opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const headers = () => ({ 'content-type': 'application/json', ...(opts.apiKey ? { 'x-goog-api-key': opts.apiKey } : {}) });
  return {
    id: 'gemini',
    capabilities: { tools: true, vision: true, jsonMode: true, maxContext: 1000000, ...opts.capabilities },
    async listModels(): Promise<ModelInfo[]> {
      const res = await f(`${base}/models?pageSize=200`, { headers: headers() });
      if (!res.ok) throw new Error(await errorText(res));
      const j = (await res.json()) as { models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
      return j.models
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName }));
    },
    async *chat(req, signal): AsyncGenerator<ChatEvent> {
      let res: Response;
      try {
        res = await f(`${base}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(geminiBody(req)),
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
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let n = 0;
      for await (const ev of parseSSE(res.body)) {
        const d = safeJson(ev.data) as Record<string, any>;
        if (d.error) {
          yield { type: 'error', error: d.error.message ?? 'Gemini error' };
          return;
        }
        if (d.usageMetadata)
          usage = { inputTokens: d.usageMetadata.promptTokenCount ?? 0, outputTokens: d.usageMetadata.candidatesTokenCount ?? 0 };
        for (const part of d.candidates?.[0]?.content?.parts ?? []) {
          if (typeof part.text === 'string' && part.text && !part.thought) yield { type: 'text', delta: part.text };
          if (part.functionCall)
            yield { type: 'tool_call', id: part.functionCall.id ?? `gemini_${n++}`, name: part.functionCall.name, args: part.functionCall.args ?? {} };
        }
      }
      yield { type: 'done', ...(usage ? { usage } : {}) };
    },
  };
}

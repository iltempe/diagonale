import { createAnthropic } from './adapters/anthropic';
import { createGemini } from './adapters/gemini';
import { createOpenAICompatible } from './adapters/openai';
import type { AdapterOptions, AIProvider, FetchLike, ProviderConfig, ProviderKind } from './types';

export type ProviderPreset = { id: string; kind: ProviderKind; label: string; baseUrl?: string; defaultModel: string; needsKey: boolean };

/** Ready-made presets shown in the settings UI. Model names are editable defaults. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'anthropic', kind: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', needsKey: true },
  { id: 'openai', kind: 'openai-compatible', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5-mini', needsKey: true },
  { id: 'gemini', kind: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', needsKey: true },
  { id: 'openrouter', kind: 'openai-compatible', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-sonnet-5.5', needsKey: true },
  { id: 'mistral', kind: 'openai-compatible', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', needsKey: true },
  { id: 'groq', kind: 'openai-compatible', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', needsKey: true },
  { id: 'deepseek', kind: 'openai-compatible', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', needsKey: true },
  { id: 'ollama', kind: 'openai-compatible', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'qwen3:8b', needsKey: false },
  { id: 'lmstudio', kind: 'openai-compatible', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', defaultModel: 'local-model', needsKey: false },
];

/**
 * Wrap fetch so that requests go through the optional pass-through proxy
 * (supabase/functions/ai-proxy). The target URL travels in the x-target-url header.
 */
export function proxiedFetch(proxyUrl: string, base: FetchLike = (u, i) => fetch(u, i)): FetchLike {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-target-url', input);
    return base(proxyUrl, { ...init, headers });
  };
}

export function createProvider(
  cfg: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'capabilities'>,
  opts: { apiKey?: string; fetch?: FetchLike } = {},
): AIProvider {
  const a: AdapterOptions = { apiKey: opts.apiKey, baseUrl: cfg.baseUrl, fetch: opts.fetch, capabilities: cfg.capabilities };
  switch (cfg.kind) {
    case 'anthropic':
      return createAnthropic(a);
    case 'openai-compatible':
      return createOpenAICompatible(a);
    case 'gemini':
      return createGemini(a);
  }
}

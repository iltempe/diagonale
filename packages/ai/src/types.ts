export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string /* base64 */ };

export type ToolCall = { id: string; name: string; args: unknown };

/** Provider-neutral message format. */
export type Message =
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

export type ChatRequest = {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'none' | { name: string };
  temperature?: number;
  maxTokens?: number;
};

export type Usage = { inputTokens: number; outputTokens: number };

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'done'; usage?: Usage }
  | { type: 'error'; error: string };

export type ModelInfo = { id: string; name?: string };

export type Capabilities = { tools: boolean; vision: boolean; jsonMode: boolean; maxContext?: number };

export interface AIProvider {
  id: string;
  listModels?(): Promise<ModelInfo[]>;
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>;
  capabilities: Capabilities;
}

export type ProviderKind = 'anthropic' | 'openai-compatible' | 'gemini';

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label?: string;
  baseUrl?: string;
  /** Reference to the key in local storage (BYOK), never synced. */
  apiKeyRef: string;
  defaultModel: string;
  /** Override capability detection (e.g. small local models without tool calling). */
  capabilities?: Partial<Capabilities>;
};

export type AIConfig = {
  providers: ProviderConfig[];
  activeProviderId: string;
  transport: 'direct' | 'proxy';
  proxyUrl?: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AdapterOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  capabilities?: Partial<Capabilities>;
};

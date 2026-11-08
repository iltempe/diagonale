import { create } from 'zustand';
import { createProvider, proxiedFetch, type AIConfig, type AIProvider, type ProviderConfig } from '@diagonale/ai';
import { getSecret, getSetting, setSecret, setSetting } from './db';

type AIState = {
  config: AIConfig;
  loaded: boolean;
  load: () => Promise<void>;
  save: (c: AIConfig) => Promise<void>;
};

const EMPTY: AIConfig = { providers: [], activeProviderId: '', transport: 'direct' };

export const useAIConfig = create<AIState>()((set) => ({
  config: EMPTY,
  loaded: false,
  load: async () => set({ config: await getSetting<AIConfig>('aiConfig', EMPTY), loaded: true }),
  save: async (c) => {
    await setSetting('aiConfig', c);
    set({ config: c });
  },
}));

export async function saveApiKey(ref: string, key: string) {
  await setSecret(`apikey:${ref}`, key);
}

export async function loadApiKey(ref: string): Promise<string | undefined> {
  return getSecret(`apikey:${ref}`);
}

/** Build a provider instance. BYOK: the key is read from IndexedDB and sent only to the provider (or the user's proxy). */
export async function providerFor(cfg: ProviderConfig, ai: AIConfig): Promise<AIProvider> {
  const apiKey = await loadApiKey(cfg.apiKeyRef);
  const f = ai.transport === 'proxy' && ai.proxyUrl ? proxiedFetch(ai.proxyUrl) : undefined;
  return createProvider(cfg, { apiKey, fetch: f });
}

export function activeProvider(ai: AIConfig): ProviderConfig | undefined {
  return ai.providers.find((p) => p.id === ai.activeProviderId) ?? ai.providers[0];
}

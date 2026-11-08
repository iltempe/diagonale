// Diagonale AI proxy (SPEC §11.2) — Supabase Edge Function (Deno).
// Pass-through only: it does not store prompts, boards or keys.
// The client sends the provider URL in the `x-target-url` header (see packages/ai proxiedFetch).
// Optional server-side keys for self-hosted instances: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.

const DEFAULT_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.mistral.ai',
  'api.groq.com',
  'api.deepseek.com',
  'api.together.xyz',
];

const allowed = new Set([...DEFAULT_HOSTS, ...(Deno.env.get('ALLOWED_HOSTS') ?? '').split(',').map((h) => h.trim()).filter(Boolean)]);

const cors = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, x-api-key, x-goog-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, content-type, x-target-url',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const HOP = ['host', 'x-target-url', 'origin', 'referer', 'cookie', 'content-length'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const target = req.headers.get('x-target-url');
  let url: URL;
  try {
    url = new URL(target ?? '');
  } catch {
    return new Response('missing or invalid x-target-url', { status: 400, headers: cors });
  }
  if (url.protocol !== 'https:' || !allowed.has(url.hostname)) {
    return new Response(`host not allowed: ${url.hostname}`, { status: 403, headers: cors });
  }
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.includes(k.toLowerCase())) headers.set(k, v);
  });
  // inject server-side keys when the client did not send one
  if (url.hostname === 'api.anthropic.com' && !headers.has('x-api-key') && Deno.env.get('ANTHROPIC_API_KEY')) headers.set('x-api-key', Deno.env.get('ANTHROPIC_API_KEY')!);
  if (url.hostname === 'api.openai.com' && !headers.has('authorization') && Deno.env.get('OPENAI_API_KEY')) headers.set('authorization', `Bearer ${Deno.env.get('OPENAI_API_KEY')}`);
  if (url.hostname === 'generativelanguage.googleapis.com' && !headers.has('x-goog-api-key') && Deno.env.get('GEMINI_API_KEY')) headers.set('x-goog-api-key', Deno.env.get('GEMINI_API_KEY')!);
  const res = await fetch(url, { method: req.method, headers, body: req.method === 'GET' ? undefined : req.body });
  const out = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) out.set(k, v);
  return new Response(res.body, { status: res.status, headers: out });
});

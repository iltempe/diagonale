/** Parse a Server-Sent Events stream into {event, data} records. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event: string | undefined;
  let data: string[] = [];
  const flush = function* () {
    if (data.length) yield { event, data: data.join('\n') };
    event = undefined;
    data = [];
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') {
        yield* flush();
        continue;
      }
      if (line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const val = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = val;
      else if (field === 'data') data.push(val);
    }
  }
  if (buf.trim()) {
    const line = buf.trim();
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  yield* flush();
}

export async function errorText(res: Response): Promise<string> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message);
    if (msg) return `HTTP ${res.status}: ${msg}`;
  } catch {
    /* not json */
  }
  return `HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`;
}

export function safeJson(s: string): unknown {
  if (!s.trim()) return {};
  try {
    return JSON.parse(s);
  } catch {
    return { __invalid_json: s };
  }
}

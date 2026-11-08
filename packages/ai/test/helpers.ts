import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from '../src';

export function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8');
}

/** Fetch stub that records requests and replies with an SSE body, split in small chunks. */
export function sseFetch(body: string, status = 200) {
  const calls: { url: string; init?: RequestInit; body: any }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const enc = new TextEncoder();
    const bytes = enc.encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37));
        c.close();
      },
    });
    return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
  };
  return { fetch: f, calls };
}

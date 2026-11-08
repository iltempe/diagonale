import { isQuery, runQuery } from '@diagonale/core';
import { useEditor } from '../store/editor';
import i18n from '../i18n';
import { exportVideo, pngDataUrl } from './export';

export const BRIDGE_URL = 'ws://localhost:7457';
export type BridgeStatus = 'off' | 'connecting' | 'connected';

let ws: WebSocket | null = null;
let enabled = false;
let retry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(s: BridgeStatus) => void>();
let status: BridgeStatus = 'off';

function setStatus(s: BridgeStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

export function onBridgeStatus(fn: (s: BridgeStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  const st = useEditor.getState();
  switch (method) {
    case 'run': {
      const name = String(params.name);
      if (isQuery(name)) return runQuery(st.board, name, params.args);
      const r = st.dispatch(name, params.args, `MCP: ${name}`);
      return r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error };
    }
    case 'getBoard':
      return st.board;
    case 'exportPng':
      return pngDataUrl(st.board, typeof params.phase === 'number' ? params.phase : st.phase, i18n.language);
    case 'exportMp4': {
      const fmt = await exportVideo(
        st.board,
        {
          lang: i18n.language,
          resolution: params.resolution === '720p' ? '720p' : '1080p',
          orientation: params.aspect === '9:16' ? 'vertical' : 'horizontal',
        },
        () => {},
      );
      return { ok: true, result: `Video downloaded by the browser (${fmt})` };
    }
    default:
      throw new Error(`Unknown method ${method}`);
  }
}

function connect() {
  if (!enabled) return;
  setStatus('connecting');
  try {
    ws = new WebSocket(BRIDGE_URL);
  } catch {
    retry = setTimeout(connect, 3000);
    return;
  }
  ws.onopen = () => setStatus('connected');
  ws.onclose = () => {
    ws = null;
    if (enabled) {
      setStatus('connecting');
      retry = setTimeout(connect, 3000);
    } else setStatus('off');
  };
  ws.onerror = () => ws?.close();
  ws.onmessage = async (ev) => {
    let msg: { id: number; method: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    try {
      const result = await handle(msg.method, msg.params ?? {});
      ws?.send(JSON.stringify({ id: msg.id, result }));
    } catch (e) {
      ws?.send(JSON.stringify({ id: msg.id, error: e instanceof Error ? e.message : String(e) }));
    }
  };
}

/** Opt-in local bridge used by `diagonale-mcp --live`. */
export function setBridgeEnabled(on: boolean) {
  enabled = on;
  clearTimeout(retry);
  if (on && !ws) connect();
  if (!on) {
    ws?.close();
    ws = null;
    setStatus('off');
  }
}

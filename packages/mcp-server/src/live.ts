import { WebSocketServer, type WebSocket } from 'ws';
import type { Board } from '@diagonale/core';
import type { Backend, OpResult } from './backend';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

/**
 * Live mode: a local WebSocket server the web app connects to (opt-in "MCP live bridge" toggle).
 * Every tool call is forwarded to the open app, so changes are visible in real time.
 */
export class LiveBackend implements Backend {
  readonly mode = 'live' as const;
  private wss: WebSocketServer;
  private client: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(
    readonly port: number,
    private log: (m: string) => void = () => {},
  ) {
    this.wss = new WebSocketServer({ host: '127.0.0.1', port });
    this.wss.on('connection', (ws) => {
      this.client?.close();
      this.client = ws;
      this.log(`web app connected`);
      ws.on('message', (data) => this.onMessage(String(data)));
      ws.on('close', () => {
        if (this.client === ws) this.client = null;
      });
    });
  }

  close() {
    this.wss.close();
  }

  get connected() {
    return !!this.client;
  }

  private onMessage(raw: string) {
    let msg: { id?: number; result?: unknown; error?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id == null) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  }

  request<T = unknown>(method: string, params: unknown = {}, timeoutMs = 20000): Promise<T> {
    if (!this.client) {
      return Promise.reject(
        new Error(`Diagonale web app not connected. Open the app, then enable "MCP live bridge" (ws://localhost:${this.port}).`),
      );
    }
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for the web app (${method})`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.client!.send(JSON.stringify({ id, method, params }));
    });
  }

  async run(name: string, args: Record<string, unknown>): Promise<OpResult> {
    try {
      return await this.request<OpResult>('run', { name, args });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  getBoard(): Promise<Board> {
    return this.request<Board>('getBoard');
  }

  async listBoards() {
    const b = await this.getBoard();
    return [{ id: b.id, title: b.title }];
  }

  exportPng(phase?: number): Promise<string> {
    return this.request<string>('exportPng', { phase }, 30000);
  }

  async exportMp4(opts: Record<string, unknown>): Promise<OpResult> {
    try {
      return await this.request<OpResult>('exportMp4', opts, 600000);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

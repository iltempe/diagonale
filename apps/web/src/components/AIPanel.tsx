import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeBoard, Dispatcher, isQuery, runQuery, toolDefinitions, type Board } from '@diagonale/core';
import { runAgent, type ContentPart, type Message } from '@diagonale/ai';
import { useEditor } from '../store/editor';
import { activeProvider, providerFor, useAIConfig } from '../lib/aiConfig';
import { getSetting, setSetting } from '../lib/db';
import { Icon } from './Icons';

type ToolChip = { id: string; name: string; ok?: boolean; error?: string };
type ChatItem = { role: 'user' | 'assistant'; text: string; tools: ToolChip[]; image?: string; error?: string };

function diffSummary(before: Board, after: Board) {
  const players = (b: Board) => b.teams.reduce((n, t) => n + t.players.length, 0);
  let moved = 0;
  let annotations = 0;
  after.phases.forEach((ph, i) => {
    const prev = before.phases[i];
    annotations += Math.max(0, ph.annotations.length - (prev?.annotations.length ?? 0));
    for (const [id, p] of Object.entries(ph.positions)) {
      const q = prev?.positions[id];
      if (!q || Math.hypot(q.x - p.x, q.y - p.y) > 0.05) moved++;
    }
  });
  return {
    phases: after.phases.length - before.phases.length,
    players: players(after) - players(before),
    moved,
    annotations,
  };
}

export function AIPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, i18n } = useTranslation();
  const ai = useAIConfig((s) => s.config);
  const provider = activeProvider(ai);
  const preview = useEditor((s) => s.aiPreview);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<{ mediaType: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<Board | null>(null);

  useEffect(() => {
    void getSetting('aiAutoApply', false).then(setAutoApply);
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items]);

  const apply = () => {
    const s = useEditor.getState();
    if (!s.aiPreview) return;
    const next = s.aiPreview.board;
    s.set({ aiPreview: null });
    s.dispatch('replaceBoard', { board: next }, t('ai:historyLabel'));
  };
  const discard = () => useEditor.getState().set({ aiPreview: null });

  const send = async (text: string) => {
    if (!provider || busy || (!text.trim() && !image)) return;
    const s = useEditor.getState();
    if (s.aiPreview) apply();
    const start = useEditor.getState().board;
    baseRef.current = start;
    const scratch = new Dispatcher(start);
    const commands: { name: string; args: unknown }[] = [];
    const executor = {
      execute: (name: string, args: unknown) => {
        if (isQuery(name)) return runQuery(scratch.board, name, args);
        const r = scratch.dispatch(name, args);
        if (r.ok) {
          commands.push({ name, args });
          useEditor.getState().set({ aiPreview: { board: scratch.board, commands: [...commands] } });
          return { ok: true, result: r.result };
        }
        return { ok: false, error: r.error };
      },
      describe: () => describeBoard(scratch.board).text,
    };
    const userContent: string | ContentPart[] = image ? [{ type: 'image', ...image }, { type: 'text', text: text || t('ai:imagePrompt') }] : text;
    setItems((x) => [...x, { role: 'user', text, tools: [], image: image ? `data:${image.mediaType};base64,${image.data}` : undefined }, { role: 'assistant', text: '', tools: [] }]);
    setInput('');
    setImage(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const patchLast = (fn: (c: ChatItem) => ChatItem) => setItems((x) => [...x.slice(0, -1), fn(x[x.length - 1]!)]);
    try {
      const p = await providerFor(provider, ai);
      for await (const ev of runAgent({
        provider: p,
        model: provider.defaultModel,
        tools: toolDefinitions(),
        executor,
        locale: i18n.language,
        history,
        userInput: userContent,
        signal: ctrl.signal,
        maxSteps: 20,
      })) {
        if (ev.type === 'text') patchLast((c) => ({ ...c, text: c.text + ev.delta }));
        else if (ev.type === 'tool_call') patchLast((c) => ({ ...c, tools: [...c.tools, { id: ev.id, name: ev.name }] }));
        else if (ev.type === 'tool_result')
          patchLast((c) => ({ ...c, tools: c.tools.map((tc) => (tc.id === ev.id ? { ...tc, ok: ev.ok, error: ev.error } : tc)) }));
        else if (ev.type === 'error') patchLast((c) => ({ ...c, error: ev.error }));
        else if (ev.type === 'done') setHistory(ev.messages.slice(-40));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) patchLast((c) => ({ ...c, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      if (scratch.board === start) useEditor.getState().set({ aiPreview: null });
      else if (autoApply) apply();
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const url = String(fr.result);
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (m) setImage({ mediaType: m[1]!, data: m[2]! });
    };
    fr.readAsDataURL(f);
  };

  if (!provider) {
    return (
      <div className="ai-panel empty">
        <Icon.ai width={36} height={36} />
        <h3>{t('ai:title')}</h3>
        <p>{t('ai:noProvider')}</p>
        <button className="btn primary" onClick={onOpenSettings}>
          {t('ai:configure')}
        </button>
      </div>
    );
  }

  const diff = preview && baseRef.current ? diffSummary(baseRef.current, preview.board) : null;
  const examples = [t('ai:examples.buildUp'), t('ai:examples.explain'), t('ai:examples.drill')];

  return (
    <div className="ai-panel">
      <header>
        <h3>
          <Icon.ai /> {t('ai:title')}
        </h3>
        <small title={provider.defaultModel}>
          {provider.label} · {provider.defaultModel}
        </small>
      </header>
      <div className="ai-messages" ref={listRef} aria-live="polite">
        {items.length === 0 && (
          <div className="ai-examples">
            <p>{t('ai:intro')}</p>
            {examples.map((ex) => (
              <button key={ex} className="chip" onClick={() => setInput(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {items.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.image && <img src={m.image} alt="" className="msg-img" />}
            {m.text && <div className="msg-text">{m.text}</div>}
            {m.tools.length > 0 && (
              <div className="tool-chips">
                {m.tools.map((tc) => (
                  <span key={tc.id} className={`tool-chip ${tc.ok === false ? 'err' : tc.ok ? 'ok' : ''}`} title={tc.error}>
                    {tc.name}
                  </span>
                ))}
              </div>
            )}
            {m.error && <div className="err">{m.error}</div>}
            {busy && i === items.length - 1 && m.role === 'assistant' && <span className="typing" aria-label={t('ai:thinking')} />}
          </div>
        ))}
      </div>
      {preview && !busy && diff && (
        <div className="ai-preview">
          <strong>{t('ai:preview')}</strong>
          <p>{t('ai:diff', { commands: preview.commands.length, phases: diff.phases, players: diff.players, moved: diff.moved, annotations: diff.annotations })}</p>
          <div className="row-inline">
            <button className="btn primary" onClick={apply} data-testid="ai-apply">
              {t('ai:apply')}
            </button>
            <button className="btn ghost" onClick={discard}>
              {t('ai:discard')}
            </button>
          </div>
        </div>
      )}
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {image && (
          <div className="attach">
            <img src={`data:${image.mediaType};base64,${image.data}`} alt="" />
            <button type="button" className="icon-btn" onClick={() => setImage(null)} aria-label={t('common:actions.remove')}>
              <Icon.close />
            </button>
          </div>
        )}
        <textarea
          value={input}
          rows={3}
          placeholder={t('ai:placeholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          data-testid="ai-input"
        />
        <div className="row-inline">
          <label className="icon-btn" title={t('ai:attach')}>
            <Icon.image />
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <label className="check small">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => {
                setAutoApply(e.target.checked);
                void setSetting('aiAutoApply', e.target.checked);
              }}
            />
            {t('ai:autoApply')}
          </label>
          <span className="grow" />
          {busy ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
              <Icon.stop /> {t('ai:stop')}
            </button>
          ) : (
            <button type="submit" className="btn primary" disabled={!input.trim() && !image} aria-label={t('ai:send')}>
              <Icon.send />
            </button>
          )}
        </div>
        {items.length > 0 && !busy && (
          <button type="button" className="link" onClick={() => (setItems([]), setHistory([]))}>
            {t('ai:newChat')}
          </button>
        )}
      </form>
    </div>
  );
}

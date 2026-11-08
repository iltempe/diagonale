import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BOARD_KINDS, parseBoard, shareUrl, type BoardKind } from '@diagonale/core';
import { useEditor } from '../store/editor';
import { db } from '../lib/db';
import { useLiveQuery } from '../lib/useLiveQuery';
import { newBoard, openBoard, saveBoard } from '../lib/persistence';
import { exportAllPngZip, exportJson, exportPdf, exportPng, exportVideo, ASPECTS, type Aspect, type Orientation, type Resolution } from '../lib/export';
import { onBridgeStatus, setBridgeEnabled, BRIDGE_URL, type BridgeStatus } from '../lib/bridge';
import { getSetting, setSetting } from '../lib/db';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import { Modal } from './Modal';
import { AISettings } from './AISettings';
import { Icon } from './Icons';
import { cloudEnabled, createShortLink, pullAll, signInWithEmail, signInWithGoogle, signOut, useAuth } from '../lib/cloud';
import { currentTalkBlob, useTalk } from '../lib/talk';
import { publicAppUrl } from '../lib/platform';

export function BoardsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const current = useEditor((s) => s.board.id);
  const rows = useLiveQuery(() => db.boards.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<BoardKind>('tactic');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useEditor((s) => s.toast);
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const b = parseBoard(JSON.parse(await f.text()));
      await saveBoard(b);
      await openBoard(b.id);
      toast(t('common:boards.imported'));
      onClose();
    } catch (e) {
      toast(`${t('common:boards.importError')}: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <Modal title={t('common:boards.title')} onClose={onClose} wide>
      <form
        className="row-inline new-board"
        onSubmit={async (e) => {
          e.preventDefault();
          await newBoard({ title: title.trim() || t('common:untitled'), kind });
          onClose();
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('common:boards.newPlaceholder')} aria-label={t('editor:board.title')} />
        <select value={kind} onChange={(e) => setKind(e.target.value as BoardKind)} aria-label={t('editor:board.kind')}>
          {BOARD_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`editor:kinds.${k}`)}
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit" data-testid="create-board">
          <Icon.plus /> {t('common:boards.new')}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Icon.upload /> {t('common:boards.import')}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </form>
      <ul className="list boards">
        {rows.map((r) => (
          <li key={r.id} className={r.id === current ? 'current' : ''}>
            <button className="grow link-row" onClick={() => void openBoard(r.id).then(onClose)}>
              <b>{r.title || t('common:untitled')}</b>
              <small>
                {t(`editor:kinds.${r.kind}`)} · {fmt.format(new Date(r.updatedAt))} · {t('editor:phase.count', { count: r.data.phases.length })}
              </small>
            </button>
            {r.id !== current && (
              <button
                className="icon-btn"
                aria-label={t('common:actions.delete')}
                onClick={() => {
                  if (confirm(t('common:boards.confirmDelete', { title: r.title || t('common:untitled') }))) void db.boards.delete(r.id);
                }}
              >
                <Icon.trash />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const board = useEditor((s) => s.board);
  const phase = useEditor((s) => s.phase);
  const toast = useEditor((s) => s.toast);
  const [lang, setLang] = useState<string>(i18n.language);
  const [res, setRes] = useState<Resolution>('1080p');
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const orientation: Orientation = aspect === '9:16' ? 'vertical' : 'horizontal';
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasTalk = useTalk((s) => !!s.talk);
  const [withVoice, setWithVoice] = useState(true);
  const common = { lang, orientation, aspect, resolution: res };
  const videoRun = (extra: Partial<typeof common> = {}) =>
    run(async () => {
      abortRef.current = new AbortController();
      const audio = withVoice ? await currentTalkBlob() : undefined;
      const fmt = await exportVideo(board, { ...common, ...extra, audio }, setProgress, abortRef.current.signal);
      toast(t('export:videoDone', { format: fmt.toUpperCase() }));
    });

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setProgress(0);
      await fn();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(`${t('export:error')}: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal title={t('export:title')} onClose={onClose}>
      <div className="stack">
        <div className="row3">
          <label className="field">
            <span>{t('export:language')}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`common:languages.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('export:resolution')}</span>
            <select value={res} onChange={(e) => setRes(e.target.value as Resolution)}>
              {(['720p', '1080p'] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('export:format')}</span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} data-testid="export-aspect">
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {t(`export:aspects.${a.replace(':', 'x')}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="btn primary social-cta"
          disabled={progress != null}
          data-testid="export-social"
          onClick={() => void videoRun({ aspect: '9:16', orientation: 'vertical', resolution: '1080p' })}
        >
          <Icon.phone /> <span>{t('export:social')}</span>
          <small>{t('export:socialHint')}</small>
        </button>
        <div className="export-grid">
          <button className="btn" disabled={progress != null} onClick={() => void run(() => exportPng(board, phase, common))}>
            <Icon.image /> {t('export:pngCurrent')}
          </button>
          <button className="btn" disabled={progress != null} onClick={() => void run(() => exportAllPngZip(board, common))}>
            <Icon.image /> {t('export:pngAll')}
          </button>
          <button className="btn" disabled={progress != null} onClick={() => void run(() => exportPdf(board, { lang, orientation }))}>
            <Icon.download /> {t('export:pdf')}
          </button>
          <button
            className="btn primary"
            disabled={progress != null}
            data-testid="export-video"
            onClick={() => void videoRun()}
          >
            <Icon.play /> {t('export:videoFormat', { format: aspect })}
          </button>
          <button className="btn" disabled={progress != null} onClick={() => exportJson(board)}>
            <Icon.download /> {t('export:json')}
          </button>
        </div>
        {progress != null && (
          <div className="progress-row">
            <progress value={progress} max={1} />
            <span>{Math.round(progress * 100)}%</span>
            <button className="btn small" onClick={() => abortRef.current?.abort()}>
              {t('common:actions.cancel')}
            </button>
          </div>
        )}
        {hasTalk && (
          <label className="check">
            <input type="checkbox" checked={withVoice} onChange={(e) => setWithVoice(e.target.checked)} />
            {t('export:withVoice')}
          </label>
        )}
        <p className="hint">{t('export:videoHint')}</p>
      </div>
    </Modal>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const user = useAuth((s) => s.user);
  const hasTalk = useTalk((s) => !!s.talk);
  const toast = useEditor((s) => s.toast);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setUrl(shareUrl(board, publicAppUrl()));
  }, [board]);
  const shortLink = async () => {
    setBusy(true);
    try {
      const slug = await createShortLink(board, hasTalk ? await currentTalkBlob() : undefined);
      setUrl(`${publicAppUrl().replace(/#.*$/, '')}#/d/${slug}`);
      setCopied(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const canShare = typeof navigator.share === 'function';
  return (
    <Modal title={t('common:share.title')} onClose={onClose}>
      <div className="stack">
        <p>{t('common:share.intro')}</p>
        <div className="row-inline">
          <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t('common:share.link')} data-testid="share-url" />
          <button
            className="btn primary"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? t('common:share.copied') : t('common:share.copy')}
          </button>
          {canShare && (
            <button className="btn" onClick={() => void navigator.share({ title: board.title || 'Diagonale', url }).catch(() => {})}>
              <Icon.share />
            </button>
          )}
        </div>
        <p className="hint">{t('common:share.hint', { size: Math.round(url.length / 1024 * 10) / 10 })}</p>
        {cloudEnabled &&
          (user ? (
            <button className="btn" disabled={busy} onClick={() => void shortLink()} data-testid="short-link">
              {hasTalk ? t('common:share.shortWithTalk') : t('common:share.short')}
            </button>
          ) : (
            <p className="hint">{t('common:share.loginForShort')}</p>
          ))}
        {!cloudEnabled && hasTalk && <p className="hint">{t('common:share.talkNeedsCloud')}</p>}
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
          {t('common:share.open')}
        </a>
      </div>
    </Modal>
  );
}

const APP_VERSION = __APP_VERSION__;
const MCP_CMD = 'node packages/mcp-server/dist/index.js --live';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const playerScale = useEditor((s) => s.playerScale);
  const set = useEditor((s) => s.set);
  const [bridge, setBridge] = useState(false);
  const [status, setStatus] = useState<BridgeStatus>('off');
  useEffect(() => onBridgeStatus(setStatus), []);
  useEffect(() => {
    void getSetting('bridge', false).then(setBridge);
  }, []);
  return (
    <Modal title={t('common:settings.title')} onClose={onClose} wide>
      <div className="settings-grid">
        <section className="stack">
          <h3>{t('common:settings.general')}</h3>
          <label className="field">
            <span>{t('common:settings.language')}</span>
            <select value={i18n.language} onChange={(e) => setLanguage(e.target.value as Lang)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`common:languages.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('common:settings.playerSize')}</span>
            <input type="range" min={0.6} max={1.8} step={0.1} value={playerScale} onChange={(e) => set({ playerScale: Number(e.target.value) })} />
          </label>
          <h3>{t('common:settings.mcp')}</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={bridge}
              onChange={(e) => {
                setBridge(e.target.checked);
                setBridgeEnabled(e.target.checked);
                void setSetting('bridge', e.target.checked);
              }}
            />
            {t('common:settings.bridge')}
          </label>
          <p className="hint">
            {t('common:settings.bridgeHint', { url: BRIDGE_URL })} <b className={`status ${status}`}>{t(`common:settings.status.${status}`)}</b>
          </p>
          <pre className="code">{MCP_CMD}</pre>
          <h3>{t('common:about.title')}</h3>
          <p className="hint">{t('common:about.text', { version: APP_VERSION })}</p>
          <div className="row-inline wrap">
            <a className="btn small coffee" href="https://buymeacoffee.com/iltempe" target="_blank" rel="noopener noreferrer">
              {t('common:about.coffee')}
            </a>
            <a className="btn small" href="https://github.com/iltempe" target="_blank" rel="noopener noreferrer">
              {t('common:about.author')}
            </a>
            <a className="btn small" href="https://github.com/iltempe/diagonale" target="_blank" rel="noopener noreferrer">
              {t('common:about.source')}
            </a>
          </div>
        </section>
        <section className="stack">
          {cloudEnabled && <AccountSection />}
          <h3>{t('ai:settings.title')}</h3>
          <AISettings />
        </section>
      </div>
    </Modal>
  );
}

function AccountSection() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const toast = useEditor((s) => s.toast);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (user) {
    return (
      <div className="stack">
        <h3>{t('common:account.title')}</h3>
        <p>{t('common:account.signedIn', { email: user.email ?? user.id })}</p>
        <div className="row-inline">
          <button className="btn" onClick={() => void pullAll().then((n) => toast(t('common:account.synced', { count: n })))}>
            {t('common:account.syncNow')}
          </button>
          <button className="btn ghost" onClick={() => void signOut()}>
            {t('common:account.signOut')}
          </button>
        </div>
        <hr />
      </div>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await signInWithEmail(email);
          setSent(true);
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), 'error');
        }
      }}
    >
      <h3>{t('common:account.title')}</h3>
      <p className="hint">{t('common:account.why')}</p>
      <div className="row-inline">
        <input type="email" required value={email} placeholder={t('common:account.email')} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn primary" type="submit">
          {t('common:account.magicLink')}
        </button>
      </div>
      {sent && <p className="ok">{t('common:account.checkEmail')}</p>}
      <button type="button" className="btn" onClick={() => void signInWithGoogle().catch((err) => toast(String(err), 'error'))}>
        {t('common:account.google')}
      </button>
      <hr />
    </form>
  );
}

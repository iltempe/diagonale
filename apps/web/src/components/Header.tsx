import { useTranslation } from 'react-i18next';
import { useEditor } from '../store/editor';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import { Icon, Logo } from './Icons';

export type DialogName = 'boards' | 'export' | 'share' | 'settings' | null;

export function Header({ open }: { open: (d: DialogName) => void }) {
  const { t, i18n } = useTranslation();
  const title = useEditor((s) => s.board.title);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const aiOpen = useEditor((s) => s.aiOpen);
  const { undo, redo, set } = useEditor.getState();
  return (
    <header className="app-header">
      <div className="brand">
        <Logo />
        <div>
          <h1>{t('common:appName')}</h1>
          <span className="tagline">{t('common:tagline')}</span>
        </div>
      </div>
      <button className="board-title" onClick={() => open('boards')} title={t('common:boards.title')} data-testid="open-boards">
        <Icon.folder /> <span>{title || t('common:untitled')}</span>
      </button>
      <div className="header-actions">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title={`${t('common:actions.undo')} (Ctrl/Cmd+Z)`} aria-label={t('common:actions.undo')} data-testid="undo">
          <Icon.undo />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title={`${t('common:actions.redo')} (Ctrl/Cmd+Y)`} aria-label={t('common:actions.redo')}>
          <Icon.redo />
        </button>
        <span className="divider" />
        <button className="btn" onClick={() => open('share')} data-testid="open-share">
          <Icon.share /> <span className="hide-sm">{t('common:share.button')}</span>
        </button>
        <button className="btn" onClick={() => open('export')} data-testid="open-export">
          <Icon.download /> <span className="hide-sm">{t('export:button')}</span>
        </button>
        <button className={`btn ${aiOpen ? 'active' : ''}`} onClick={() => set({ aiOpen: !aiOpen })} aria-pressed={aiOpen} data-testid="toggle-ai">
          <Icon.ai /> <span className="hide-sm">{t('ai:button')}</span>
        </button>
        <span className="divider" />
        <div className="lang-switch" role="group" aria-label={t('common:settings.language')}>
          {LANGUAGES.map((l) => (
            <button key={l} className={i18n.language === l ? 'active' : ''} onClick={() => setLanguage(l as Lang)} aria-pressed={i18n.language === l} data-testid={`lang-${l}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => open('settings')} title={t('common:settings.title')} aria-label={t('common:settings.title')} data-testid="open-settings">
          <Icon.settings />
        </button>
      </div>
    </header>
  );
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismiss = useEditor((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </button>
      ))}
    </div>
  );
}

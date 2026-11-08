import { useTranslation } from 'react-i18next';
import { useEditor } from '../store/editor';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import { Icon, Logo } from './Icons';

export type DialogName = 'boards' | 'export' | 'share' | 'settings' | null;

/** Section navigation shared by editor, planner and Team Centre. */
export function NavTabs() {
  const { t } = useTranslation();
  const hash = location.hash || '#/';
  const items = [
    { href: '#/', label: t('common:nav.board'), icon: <Icon.board />, active: hash === '#/' || hash === '#' },
    { href: '#/planner', label: t('common:nav.planner'), icon: <Icon.clipboard />, active: hash.startsWith('#/planner') },
    { href: '#/team', label: t('common:nav.team'), icon: <Icon.calendar />, active: hash.startsWith('#/team') },
  ];
  return (
    <nav className="nav-tabs" aria-label={t('common:nav.label')}>
      {items.map((it) => (
        <a key={it.href} href={it.href} className={it.active ? 'active' : ''} aria-current={it.active ? 'page' : undefined} data-testid={`nav-${it.href.slice(2) || 'board'}`}>
          {it.icon} <span className="hide-sm">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}

/** Top bar for the non-editor pages. */
export function PageHeader({ openSettings }: { openSettings: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <header className="app-header">
      <div className="brand">
        <Logo />
        <div>
          <h1>{t('common:appName')}</h1>
          <span className="tagline">{t('common:tagline')}</span>
        </div>
      </div>
      <NavTabs />
      <div className="header-actions">
        <div className="lang-switch" role="group" aria-label={t('common:settings.language')}>
          {LANGUAGES.map((l) => (
            <button key={l} className={i18n.language === l ? 'active' : ''} onClick={() => setLanguage(l as Lang)} aria-pressed={i18n.language === l}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={openSettings} title={t('common:settings.title')} aria-label={t('common:settings.title')}>
          <Icon.settings />
        </button>
      </div>
    </header>
  );
}

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
      <NavTabs />
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

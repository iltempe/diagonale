import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../store/editor';
import { usePlayback } from '../lib/usePlayback';
import { useShortcuts } from '../lib/useShortcuts';
import { Header, Toasts, type DialogName } from '../components/Header';
import { Toolbar } from '../components/Toolbar';
import { PitchView } from '../components/PitchView';
import { Inspector } from '../components/Inspector';
import { PlaybackBar, Timeline } from '../components/Timeline';
import { AIPanel } from '../components/AIPanel';
import { BoardsDialog, ExportDialog, SettingsDialog, ShareDialog } from '../components/Dialogs';

export function Editor() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogName>(null);
  const aiOpen = useEditor((s) => s.aiOpen);
  const tool = useEditor((s) => s.tool);
  const phase = useEditor((s) => s.phase);
  const total = useEditor((s) => s.board.phases.length);
  usePlayback();
  useShortcuts();
  const close = () => setDialog(null);
  return (
    <div className={`app ${aiOpen ? 'with-ai' : ''}`}>
      <Header open={setDialog} />
      <Toolbar />
      <main className="stage-area">
        <div className="stage-meta">
          <span>
            {t('editor:phase.n', { n: phase + 1 })} / {total}
          </span>
          <span className="hint">{t(`editor:toolHints.${tool.startsWith('arrow_') ? 'arrow' : tool}`)}</span>
        </div>
        <PitchView />
        <PlaybackBar />
      </main>
      <Inspector />
      {aiOpen && (
        <aside className="ai-dock" aria-label={t('ai:title')}>
          <AIPanel onOpenSettings={() => setDialog('settings')} />
        </aside>
      )}
      <footer className="timeline-area">
        <Timeline />
      </footer>
      {dialog === 'boards' && <BoardsDialog onClose={close} />}
      {dialog === 'export' && <ExportDialog onClose={close} />}
      {dialog === 'share' && <ShareDialog onClose={close} />}
      {dialog === 'settings' && <SettingsDialog onClose={close} />}
      <Toasts />
    </div>
  );
}

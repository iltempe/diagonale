import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor } from './routes/Editor';
import { Planner } from './routes/Planner';
import { TeamCentre } from './routes/TeamCentre';
import { Present } from './routes/Present';
import { PageHeader, Toasts } from './components/Header';
import { SettingsDialog } from './components/Dialogs';
import { initCloud } from './lib/cloud';
import { startTalkSync } from './lib/talk';
import { desktop } from './lib/platform';
import { parseBoard } from '@diagonale/core';
import { openBoard, saveBoard } from './lib/persistence';
import { SharedPlayer } from './routes/SharedPlayer';
import { restoreLastBoard, startAutosave } from './lib/persistence';
import { useAIConfig } from './lib/aiConfig';
import { getSetting } from './lib/db';
import { setBridgeEnabled } from './lib/bridge';
import { Logo } from './components/Icons';

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

let booted: Promise<void> | null = null;
function boot(): Promise<void> {
  booted ??= (async () => {
    await initCloud().catch((e) => console.warn('[cloud]', e));
    await restoreLastBoard();
    startAutosave();
    startTalkSync();
    desktop?.onOpenBoard(async (json) => {
      try {
        const b = parseBoard(JSON.parse(json));
        await saveBoard(b);
        await openBoard(b.id);
        location.hash = '#/';
      } catch (e) {
        console.error(e);
      }
    });
    await useAIConfig.getState().load();
    if (await getSetting('bridge', false)) setBridgeEnabled(true);
  })();
  return booted;
}

export function App() {
  const { t } = useTranslation();
  const hash = useHashRoute();
  const share = /^#\/d\/(.+)$/.exec(hash);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (share) return;
    void boot().then(() => setReady(true));
  }, [share]);
  if (share) return <SharedPlayer payload={share[1]!} />;
  if (!ready)
    return (
      <div className="splash">
        <Logo size={64} />
        <p>{t('common:loading')}</p>
      </div>
    );
  if (hash.startsWith('#/present')) return <Present />;
  if (hash.startsWith('#/planner') || hash.startsWith('#/team')) return <Page kind={hash.startsWith('#/team') ? 'team' : 'planner'} />;
  return <Editor />;
}

function Page({ kind }: { kind: 'planner' | 'team' }) {
  const [settings, setSettings] = useState(false);
  return (
    <div className="app-page">
      <PageHeader openSettings={() => setSettings(true)} />
      {kind === 'team' ? <TeamCentre /> : <Planner />}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      <Toasts />
    </div>
  );
}

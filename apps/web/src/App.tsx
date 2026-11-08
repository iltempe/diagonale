import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor } from './routes/Editor';
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
    await restoreLastBoard();
    startAutosave();
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
  return <Editor />;
}

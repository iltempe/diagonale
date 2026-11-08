import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeShare, type Board } from '@diagonale/core';
import { saveBoard } from '../lib/persistence';
import { setSetting } from '../lib/db';
import { cloudEnabled, fetchShared, isSlug } from '../lib/cloud';
import { BoardPlayer } from '../components/BoardPlayer';
import { Logo } from '../components/Icons';

/** Shared link player: #/d/<payload> (board in the URL) or #/d/<slug> (Supabase snapshot). */
export function SharedPlayer({ payload }: { payload: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ board?: Board; audioUrl?: string; error?: string }>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (isSlug(payload)) {
          if (!cloudEnabled) throw new Error('cloud disabled');
          const r = await fetchShared(payload);
          if (alive) setState(r);
        } else if (alive) setState({ board: decodeShare(payload) });
      } catch (e) {
        if (alive) setState({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [payload]);

  if (state.error) {
    return (
      <div className="shared error">
        <Logo size={48} />
        <p>{t('common:share.invalid')}</p>
        <small>{state.error}</small>
        <a className="btn primary" href="#/">
          {t('common:share.goEditor')}
        </a>
      </div>
    );
  }
  if (!state.board) {
    return (
      <div className="splash">
        <Logo size={64} />
        <p>{t('common:loading')}</p>
      </div>
    );
  }
  const board = state.board;
  const copyToEditor = async () => {
    const copy = { ...board, id: `${board.id}-${Date.now().toString(36)}` };
    await saveBoard(copy);
    await setSetting('lastBoardId', copy.id);
    location.hash = '#/';
    location.reload();
  };
  return (
    <BoardPlayer
      board={board}
      audioUrl={state.audioUrl}
      actions={
        <button className="btn small" onClick={() => void copyToEditor()}>
          {t('common:share.copyToEditor')}
        </button>
      }
    />
  );
}

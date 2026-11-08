import { useEffect, useMemo } from 'react';
import { useEditor } from '../store/editor';
import { useTalk } from '../lib/talk';
import { BoardPlayer } from '../components/BoardPlayer';

/** Presentation mode: full-screen playback of the current board with its Team Talk. */
export function Present() {
  const board = useEditor((s) => s.board);
  const talk = useTalk((s) => s.talk);
  const url = useMemo(() => (talk?.boardId === board.id ? URL.createObjectURL(talk.blob) : undefined), [talk, board.id]);
  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  const exit = () => {
    location.hash = '#/';
  };
  return <BoardPlayer board={board} audioUrl={url} onExit={exit} />;
}

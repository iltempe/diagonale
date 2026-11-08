import { createEmptyBoard, parseBoard, type Board } from '@diagonale/core';
import { db, getSetting, setSetting } from './db';
import { dispatcher, useEditor } from '../store/editor';
import { buildDemoBoard } from './demo';
import i18n from '../i18n';
import { cloudSaveBoard } from './cloud';

let timer: ReturnType<typeof setTimeout> | undefined;

export async function saveBoard(b: Board) {
  await db.boards.put({ id: b.id, title: b.title, kind: b.kind, updatedAt: b.updatedAt, data: b });
  cloudSaveBoard(b);
}

/** Autosave to IndexedDB (debounced) + remember the last opened board. */
export function startAutosave() {
  dispatcher.subscribe((e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void saveBoard(e.board).catch(() => useEditor.getState().toast(i18n.t('common:errors.saveFailed'), 'error'));
      void setSetting('lastBoardId', e.board.id);
    }, 400);
  });
}

export async function restoreLastBoard(): Promise<void> {
  const id = await getSetting<string | null>('lastBoardId', null);
  if (id) {
    const row = await db.boards.get(id).catch(() => undefined);
    if (row) {
      try {
        useEditor.getState().loadBoard(parseBoard(row.data));
        return;
      } catch {
        /* corrupted: fall through */
      }
    }
  }
  const demo = buildDemoBoard(i18n.language);
  useEditor.getState().loadBoard(demo);
  await saveBoard(demo);
  await setSetting('lastBoardId', demo.id);
}

export async function newBoard(opts: { title: string; kind?: Board['kind'] }) {
  const b = createEmptyBoard({ title: opts.title, kind: opts.kind, homeName: i18n.t('team:defaults.home'), awayName: i18n.t('team:defaults.away') });
  useEditor.getState().loadBoard(b);
  await saveBoard(b);
  await setSetting('lastBoardId', b.id);
}

export async function openBoard(id: string) {
  const row = await db.boards.get(id);
  if (!row) return;
  useEditor.getState().loadBoard(parseBoard(row.data));
  await setSetting('lastBoardId', id);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'board'
  );
}

import { useEffect } from 'react';
import { ARROW_STYLES, BALL_ID, runQuery, type PhaseContent } from '@diagonale/core';
import { useEditor } from '../store/editor';
import i18n from '../i18n';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Editor keyboard shortcuts (spec §9). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 'c') {
        const r = runQuery(s.board, 'copyPhaseContent', { phase: s.phase });
        if (r.ok) {
          s.set({ clipboard: r.result as PhaseContent });
          s.toast(i18n.t('editor:toast.copied'));
        }
      } else if (mod && key === 'v') {
        if (s.clipboard) s.dispatch('pastePhaseContent', { phase: s.phase, content: s.clipboard }, i18n.t('editor:history.paste'));
      } else if (mod) {
        return;
      } else if (key === 'n') {
        const r = s.dispatch('addPhase', { after: s.phase });
        if (r.ok) s.setPhase(s.phase + 1);
      } else if (key === 'delete' || key === 'backspace') {
        if (s.selectedAnnotationId) s.dispatch('removeAnnotation', { phase: s.phase, annotationId: s.selectedAnnotationId });
        else if (s.selection.length) {
          s.transaction(i18n.t('editor:history.delete'), () => {
            for (const id of s.selection) if (id !== BALL_ID) s.dispatch('removePlayer', { playerId: id });
          });
        }
      } else if (key === ' ') {
        e.preventDefault();
        s.togglePlay();
      } else if (key === 'arrowleft') {
        e.preventDefault();
        s.setPhase(s.phase - 1);
      } else if (key === 'arrowright') {
        e.preventDefault();
        s.setPhase(s.phase + 1);
      } else if (/^[1-7]$/.test(key)) {
        s.setTool(`arrow_${ARROW_STYLES[Number(key) - 1]!}`);
      } else if (key === 'escape' || key === 'v') {
        s.set({ tool: 'select', selection: [], selectedAnnotationId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

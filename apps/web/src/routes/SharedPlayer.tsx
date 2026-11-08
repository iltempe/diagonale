import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeShare, evaluate, timeline, type Board } from '@diagonale/core';
import { BoardRenderer } from '@diagonale/render';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import { saveBoard } from '../lib/persistence';
import { setSetting } from '../lib/db';
import { Icon, Logo } from '../components/Icons';

/** Read-only full-screen player for shared links (#/d/<payload>), mobile-first. */
export function SharedPlayer({ payload }: { payload: string }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const board = useMemo<Board | null>(() => {
    try {
      return decodeShare(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [payload]);
  const hostRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [time, setTime] = useState(0);
  const tRef = useRef(0);
  const total = board ? timeline(board).totalMs : 0;

  useEffect(() => {
    if (!board) return;
    const host = hostRef.current!;
    const r = new BoardRenderer(host, host.clientWidth, host.clientHeight);
    const portrait = () => host.clientHeight > host.clientWidth * 1.15;
    const draw = () => {
      const f = evaluate(board, tRef.current);
      const label = board.phases[f.phaseIndex]?.label;
      r.render(board, f, {
        orientation: portrait() ? 'vertical' : board.pitch.orientation,
        caption: `${t('export:phaseN', { n: f.phaseIndex + 1, total: board.phases.length })}${label ? ` — ${label}` : ''}`,
      });
    };
    const ro = new ResizeObserver(() => {
      r.setSize(host.clientWidth, host.clientHeight);
      draw();
    });
    ro.observe(host);
    draw();
    drawRef.current = draw;
    return () => {
      ro.disconnect();
      r.destroy();
    };
  }, [board, t]);

  useEffect(() => {
    if (!board || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let next = tRef.current + (now - last);
      last = now;
      if (next >= total) {
        if (loop) next = 0;
        else {
          next = total;
          setPlaying(false);
        }
      }
      tRef.current = next;
      setTime(next);
      drawRef.current();
      if (next < total || loop) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [board, playing, loop, total]);

  if (!board) {
    return (
      <div className="shared error">
        <Logo size={48} />
        <p>{t('common:share.invalid')}</p>
        <small>{error}</small>
        <a className="btn primary" href="#/">
          {t('common:share.goEditor')}
        </a>
      </div>
    );
  }

  const copyToEditor = async () => {
    const copy = { ...board, id: `${board.id}-${Date.now().toString(36)}` };
    await saveBoard(copy);
    await setSetting('lastBoardId', copy.id);
    location.hash = '#/';
    location.reload();
  };

  return (
    <div className="shared">
      <header>
        <a href="#/" className="brand small">
          <Logo size={24} />
          <span>{t('common:appName')}</span>
        </a>
        <h1>{board.title || t('common:untitled')}</h1>
        <div className="lang-switch">
          {LANGUAGES.map((l) => (
            <button key={l} className={i18n.language === l ? 'active' : ''} onClick={() => setLanguage(l as Lang)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <div className="shared-stage" ref={hostRef} data-testid="shared-stage" onClick={() => setPlaying((p) => !p)} />
      <div className="playback">
        <button className="icon-btn play" onClick={() => {
          if (!playing && tRef.current >= total) tRef.current = 0;
          setPlaying(!playing);
        }} aria-label={playing ? t('editor:playback.pause') : t('editor:playback.play')}>
          {playing ? <Icon.pause /> : <Icon.play />}
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={total}
          step={10}
          value={time}
          aria-label={t('editor:playback.scrub')}
          onChange={(e) => {
            setPlaying(false);
            tRef.current = Number(e.target.value);
            setTime(tRef.current);
            drawRef.current();
          }}
        />
        <button className={`icon-btn ${loop ? 'active' : ''}`} onClick={() => setLoop(!loop)} aria-label={t('editor:playback.loop')} aria-pressed={loop}>
          <Icon.loop />
        </button>
        <button className="btn small" onClick={() => void copyToEditor()}>
          {t('common:share.copyToEditor')}
        </button>
      </div>
    </div>
  );
}

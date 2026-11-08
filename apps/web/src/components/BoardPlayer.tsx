import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, timeline, type Board } from '@diagonale/core';
import { BoardRenderer } from '@diagonale/render';
import { LANGUAGES, setLanguage, type Lang } from '../i18n';
import { Icon, Logo } from './Icons';

/**
 * Read-only full-screen player (shared links and presentation mode), mobile-first.
 * When an audio track (Team Talk) is present it is kept in sync with the timeline.
 */
export function BoardPlayer({ board, audioUrl, actions, onExit }: { board: Board; audioUrl?: string; actions?: React.ReactNode; onExit?: () => void }) {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(!audioUrl);
  const [loop, setLoop] = useState(!audioUrl);
  const [time, setTime] = useState(0);
  const tRef = useRef(0);
  const total = timeline(board).totalMs;

  useEffect(() => {
    audioRef.current = audioUrl ? new Audio(audioUrl) : null;
    return () => audioRef.current?.pause();
  }, [audioUrl]);

  useEffect(() => {
    const host = hostRef.current!;
    const r = new BoardRenderer(host, host.clientWidth, host.clientHeight);
    const portrait = () => host.clientHeight > host.clientWidth * 1.15;
    const draw = () => {
      const f = evaluate(board, tRef.current);
      const label = board.phases[f.phaseIndex]?.label;
      r.render(board, f, {
        orientation: portrait() ? 'vertical' : board.pitch.orientation,
        showPhotos: true,
        caption: `${t('export:phaseN', { n: f.phaseIndex + 1, total: board.phases.length })}${label ? ` — ${label}` : ''}`,
      });
    };
    drawRef.current = draw;
    const ro = new ResizeObserver(() => {
      r.setSize(host.clientWidth, host.clientHeight);
      draw();
    });
    ro.observe(host);
    draw();
    return () => {
      ro.disconnect();
      r.destroy();
    };
  }, [board, t]);

  useEffect(() => {
    const a = audioRef.current;
    if (!playing) {
      a?.pause();
      return;
    }
    if (a) {
      a.currentTime = tRef.current / 1000;
      void a.play().catch(() => {});
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let next = tRef.current + (now - last);
      last = now;
      if (next >= total) {
        if (loop) {
          next = 0;
          if (a) a.currentTime = 0;
        } else {
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

  const toggle = () => {
    if (!playing && tRef.current >= total) tRef.current = 0;
    setPlaying(!playing);
  };

  return (
    <div className="shared">
      <header>
        <a href="#/" className="brand small" onClick={onExit}>
          <Logo size={24} />
          <span>{t('common:appName')}</span>
        </a>
        <h1>{board.title || t('common:untitled')}</h1>
        {audioUrl && (
          <span className="badge" title={t('editor:talk.title')}>
            <Icon.mic /> {t('editor:talk.title')}
          </span>
        )}
        <div className="lang-switch">
          {LANGUAGES.map((l) => (
            <button key={l} className={i18n.language === l ? 'active' : ''} onClick={() => setLanguage(l as Lang)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        {onExit && (
          <button className="icon-btn" onClick={onExit} aria-label={t('common:actions.close')}>
            <Icon.close />
          </button>
        )}
      </header>
      <div className="shared-stage" ref={hostRef} data-testid="shared-stage" onClick={toggle} />
      <div className="playback">
        <button className="icon-btn play" onClick={toggle} aria-label={playing ? t('editor:playback.pause') : t('editor:playback.play')} data-testid="player-play">
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
            if (audioRef.current) audioRef.current.currentTime = tRef.current / 1000;
            drawRef.current();
          }}
        />
        <button className={`icon-btn ${loop ? 'active' : ''}`} onClick={() => setLoop(!loop)} aria-label={t('editor:playback.loop')} aria-pressed={loop}>
          <Icon.loop />
        </button>
        {actions}
      </div>
    </div>
  );
}

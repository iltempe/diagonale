import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BALL_ID, timeline, type Board, type Phase } from '@diagonale/core';
import { displayedBoard, useEditor } from '../store/editor';
import { Icon } from './Icons';

function Thumb({ board, phase }: { board: Board; phase: Phase }) {
  const L = board.pitch.length;
  const W = board.pitch.width;
  const vertical = board.pitch.orientation === 'vertical';
  const colors = new Map<string, string>();
  for (const t of board.teams) for (const p of t.players) colors.set(p.id, p.role === 'GK' ? t.kit.gkPrimary : t.kit.primary);
  const vw = vertical ? W : L;
  const vh = vertical ? L : W;
  const pos = (x: number, y: number) => (vertical ? { cx: y, cy: L - x } : { cx: x, cy: y });
  return (
    <svg viewBox={`-2 -2 ${vw + 4} ${vh + 4}`} className="thumb" aria-hidden="true">
      <rect x={0} y={0} width={vw} height={vh} fill="#3A8A3F" stroke="#F4F1EA" strokeWidth={0.8} />
      {vertical ? <line x1={0} y1={L / 2} x2={W} y2={L / 2} stroke="#F4F1EA" strokeWidth={0.6} /> : <line x1={L / 2} y1={0} x2={L / 2} y2={W} stroke="#F4F1EA" strokeWidth={0.6} />}
      {Object.entries(phase.positions).map(([id, p]) =>
        id === BALL_ID ? null : <circle key={id} {...pos(p.x, p.y)} r={1.8} fill={colors.get(id) ?? '#999'} />,
      )}
      {phase.positions[BALL_ID] && <circle {...pos(phase.positions[BALL_ID].x, phase.positions[BALL_ID].y)} r={1.3} fill="#fff" stroke="#111" strokeWidth={0.4} />}
    </svg>
  );
}

export function Timeline() {
  const { t } = useTranslation();
  const board = useEditor((s) => displayedBoard(s));
  const phase = useEditor((s) => s.phase);
  const setPhase = useEditor((s) => s.setPhase);
  const dispatch = useEditor((s) => s.dispatch);
  const preview = useEditor((s) => !!s.aiPreview);
  const [drag, setDrag] = useState<number | null>(null);

  return (
    <div className="timeline" role="list" aria-label={t('editor:timeline.label')}>
      {board.phases.map((ph, i) => (
        <div
          key={ph.id}
          role="listitem"
          className={`phase-card ${i === phase ? 'active' : ''}`}
          draggable={!preview}
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag != null && drag !== i) {
              dispatch('reorderPhase', { from: drag, to: i });
              setPhase(i);
            }
            setDrag(null);
          }}
          data-testid={`phase-${i}`}
        >
          <button className="phase-select" onClick={() => setPhase(i)} aria-current={i === phase} aria-label={t('editor:phase.n', { n: i + 1 })}>
            <Thumb board={board} phase={ph} />
            <span className="phase-name">
              <b>{i + 1}</b> {ph.label}
            </span>
          </button>
          {i > 0 && (
            <label className="phase-dur" title={t('editor:phase.duration')}>
              <input
                type="range"
                min={200}
                max={5000}
                step={100}
                value={ph.durationMs}
                disabled={preview}
                aria-label={t('editor:phase.duration')}
                onChange={(e) => dispatch('updatePhase', { phase: i, durationMs: Number(e.target.value) })}
              />
              <span>{t('common:units.seconds', { value: (ph.durationMs / 1000).toFixed(1) })}</span>
            </label>
          )}
          {!preview && (
            <div className="phase-actions">
              <button className="icon-btn" title={t('editor:timeline.duplicate')} aria-label={t('editor:timeline.duplicate')} onClick={() => dispatch('addPhase', { after: i, copyAnnotations: true }) && setPhase(i + 1)}>
                <Icon.copy />
              </button>
              {board.phases.length > 1 && (
                <button className="icon-btn" title={t('common:actions.delete')} aria-label={t('common:actions.delete')} onClick={() => dispatch('removePhase', { phase: i })}>
                  <Icon.trash />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {!preview && (
        <button
          className="phase-add"
          onClick={() => {
            const r = dispatch('addPhase', { after: phase });
            if (r.ok) setPhase(phase + 1);
          }}
          title={`${t('editor:timeline.add')} (N)`}
          data-testid="add-phase"
        >
          <Icon.plus />
          <span>{t('editor:timeline.add')}</span>
        </button>
      )}
    </div>
  );
}

function fmt(ms: number) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

export function PlaybackBar() {
  const { t } = useTranslation();
  const board = useEditor((s) => displayedBoard(s));
  const playing = useEditor((s) => s.playing);
  const tNow = useEditor((s) => s.t);
  const speed = useEditor((s) => s.speed);
  const loop = useEditor((s) => s.loop);
  const phase = useEditor((s) => s.phase);
  const { togglePlay, seek, setPhase, set } = useEditor.getState();
  const total = timeline(board).totalMs;
  return (
    <div className="playback">
      <button className="icon-btn" onClick={() => setPhase(phase - 1)} title={`${t('editor:playback.prev')} (←)`} aria-label={t('editor:playback.prev')}>
        <Icon.prev />
      </button>
      <button className="icon-btn play" onClick={togglePlay} title={`${playing ? t('editor:playback.pause') : t('editor:playback.play')} (Space)`} aria-label={playing ? t('editor:playback.pause') : t('editor:playback.play')} data-testid="play">
        {playing ? <Icon.pause /> : <Icon.play />}
      </button>
      <button className="icon-btn" onClick={() => setPhase(phase + 1)} title={`${t('editor:playback.next')} (→)`} aria-label={t('editor:playback.next')}>
        <Icon.next />
      </button>
      <input className="scrub" type="range" min={0} max={Math.max(1, total)} step={10} value={Math.min(tNow, total)} onChange={(e) => seek(Number(e.target.value))} aria-label={t('editor:playback.scrub')} />
      <span className="time">
        {fmt(Math.min(tNow, total))} / {fmt(total)}
      </span>
      <select value={speed} onChange={(e) => set({ speed: Number(e.target.value) })} aria-label={t('editor:playback.speed')}>
        {[0.5, 1, 2].map((v) => (
          <option key={v} value={v}>
            {t('common:units.speed', { value: v })}
          </option>
        ))}
      </select>
      <button className={`icon-btn ${loop ? 'active' : ''}`} onClick={() => set({ loop: !loop })} title={t('editor:playback.loop')} aria-label={t('editor:playback.loop')} aria-pressed={loop}>
        <Icon.loop />
      </button>
    </div>
  );
}

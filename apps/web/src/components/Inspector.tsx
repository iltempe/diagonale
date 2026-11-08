import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ARROW_STYLES,
  BALL_ID,
  BOARD_KINDS,
  EASINGS,
  EQUIPMENT_ITEMS,
  FORMATIONS,
  PITCH_VIEWS,
  ROLES,
  ROUTINES,
  SURFACES,
  allPlayers,
  extractSequence,
  findPlayer,
  newId,
  playerLabel,
  type Annotation,
  type Board,
  type CameraSpec,
  type Team,
} from '@diagonale/core';
import { useEditor } from '../store/editor';
import { db, type SequenceRow } from '../lib/db';
import { useLiveQuery } from '../lib/useLiveQuery';
import { Icon } from './Icons';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Text input that commits on blur / Enter (one undo step per edit). */
function TextInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function NumberInput({ value, onCommit, step = 1, min, max }: { value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number }) {
  const { i18n } = useTranslation();
  return (
    <TextInput
      inputMode="decimal"
      value={String(value)}
      lang={i18n.language}
      onCommit={(s) => {
        const n = Number(s.replace(',', '.'));
        if (Number.isFinite(n)) onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
      }}
      step={step}
    />
  );
}

function SelectionSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const phase = useEditor((s) => s.phase);
  const selection = useEditor((s) => s.selection);
  const annId = useEditor((s) => s.selectedAnnotationId);
  const dispatch = useEditor((s) => s.dispatch);
  const transaction = useEditor((s) => s.transaction);
  const ann = annId ? board.phases[phase]?.annotations.find((a) => a.id === annId) : undefined;

  if (ann) return <AnnotationEditor ann={ann} />;
  if (!selection.length) return <p className="hint">{t('editor:props.noSelection')}</p>;
  if (selection.length > 1) {
    return (
      <div className="stack">
        <p>{t('editor:props.multi', { count: selection.length })}</p>
        <button
          className="btn danger"
          onClick={() => transaction(t('editor:history.delete'), () => selection.forEach((id) => id !== BALL_ID && dispatch('removePlayer', { playerId: id })))}
        >
          <Icon.trash /> {t('common:actions.delete')}
        </button>
      </div>
    );
  }
  const id = selection[0]!;
  if (id === BALL_ID) {
    const pos = board.phases[phase]?.positions[BALL_ID];
    return (
      <div className="stack">
        <strong>{t('editor:tools.ball')}</strong>
        {pos && <PositionFields id={BALL_ID} x={pos.x} y={pos.y} />}
        {phase > 0 && <BallPath />}
      </div>
    );
  }
  const p = findPlayer(board, id);
  if (!p) return null;
  const pos = board.phases[phase]?.positions[id];
  const up = (patch: Record<string, unknown>) => dispatch('updatePlayer', { playerId: id, ...patch });
  return (
    <div className="stack">
      <div className="row2">
        <Field label={t('team:player.number')}>
          <NumberInput value={p.number ?? 0} min={0} max={999} onCommit={(n) => up({ number: n })} />
        </Field>
        <Field label={t('team:player.role')}>
          <select value={p.role ?? ''} onChange={(e) => up({ role: e.target.value || null })}>
            <option value="">—</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`team:roles.${r}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('team:player.name')}>
        <TextInput value={p.name ?? ''} onCommit={(v) => up({ name: v || null })} />
      </Field>
      <Field label={t('team:player.shortName')}>
        <TextInput value={p.shortName ?? ''} maxLength={24} onCommit={(v) => up({ shortName: v || null })} />
      </Field>
      {pos && <PositionFields id={id} x={pos.x} y={pos.y} facing={pos.facing} />}
      <button className="btn danger" onClick={() => dispatch('removePlayer', { playerId: id })}>
        <Icon.trash /> {t('team:player.remove')}
      </button>
    </div>
  );
}

function BallPath() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const phase = useEditor((s) => s.phase);
  const dispatch = useEditor((s) => s.dispatch);
  const path = board.phases[phase]?.paths?.[BALL_ID];
  return (
    <div className="row2">
      <Field label={t('editor:props.ballPath')}>
        <select
          value={path?.type ?? 'auto'}
          onChange={(e) => {
            const v = e.target.value;
            dispatch('setPath', { phase, entityId: BALL_ID, path: v === 'auto' ? null : v === 'lofted' ? { type: 'lofted', peakHeight: 6 } : { type: 'straight' } });
          }}
        >
          <option value="auto">{t('editor:props.pathAuto')}</option>
          <option value="straight">{t('editor:props.pathStraight')}</option>
          <option value="lofted">{t('editor:props.pathLofted')}</option>
        </select>
      </Field>
      {path?.type === 'lofted' && (
        <Field label={t('editor:props.peakHeight')}>
          <NumberInput value={path.peakHeight} min={0} max={40} onCommit={(n) => dispatch('setPath', { phase, entityId: BALL_ID, path: { type: 'lofted', peakHeight: n } })} />
        </Field>
      )}
    </div>
  );
}

function PositionFields({ id, x, y, facing }: { id: string; x: number; y: number; facing?: number }) {
  const { t } = useTranslation();
  const phase = useEditor((s) => s.phase);
  const dispatch = useEditor((s) => s.dispatch);
  const mv = (patch: Partial<{ x: number; y: number; facing: number }>) =>
    dispatch('moveEntity', { phase, entityId: id, x, y, ...(facing !== undefined ? { facing } : {}), ...patch, propagate: true });
  return (
    <div className="row3">
      <Field label={t('editor:props.x')}>
        <NumberInput value={Math.round(x * 10) / 10} step={0.5} onCommit={(n) => mv({ x: n })} />
      </Field>
      <Field label={t('editor:props.y')}>
        <NumberInput value={Math.round(y * 10) / 10} step={0.5} onCommit={(n) => mv({ y: n })} />
      </Field>
      {id !== BALL_ID && (
        <Field label={t('editor:props.facing')}>
          <NumberInput value={facing ?? 0} step={15} onCommit={(n) => mv({ facing: ((n % 360) + 360) % 360 })} />
        </Field>
      )}
    </div>
  );
}

function AnnotationEditor({ ann }: { ann: Annotation }) {
  const { t } = useTranslation();
  const phase = useEditor((s) => s.phase);
  const dispatch = useEditor((s) => s.dispatch);
  const up = (patch: Record<string, unknown>) => dispatch('updateAnnotation', { phase, annotationId: ann.id, patch });
  return (
    <div className="stack">
      <strong>{t(`editor:annotation.${ann.type}`)}</strong>
      {ann.type === 'arrow' && (
        <>
          <Field label={t('editor:props.style')}>
            <select value={ann.style} onChange={(e) => up({ style: e.target.value })}>
              {ARROW_STYLES.map((s) => (
                <option key={s} value={s}>
                  {t(`editor:arrows.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('editor:props.label')}>
            <TextInput value={ann.label ?? ''} maxLength={80} onCommit={(v) => up({ label: v || null })} />
          </Field>
          {ann.control && (
            <button className="btn" onClick={() => up({ control: null })}>
              {t('editor:props.straighten')}
            </button>
          )}
          <p className="hint">{t('editor:props.arrowHint')}</p>
        </>
      )}
      {ann.type === 'zone' && (
        <>
          <div className="row2">
            <Field label={t('editor:props.color')}>
              <input type="color" value={ann.color} onChange={(e) => up({ color: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={t('editor:props.opacity')}>
              <input type="range" min={0.05} max={0.9} step={0.05} value={ann.opacity} onChange={(e) => up({ opacity: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label={t('editor:props.shape')}>
            <select value={ann.shape} onChange={(e) => up({ shape: e.target.value })} disabled={ann.points.length !== 2}>
              <option value="rect">{t('editor:tools.zoneRect')}</option>
              <option value="ellipse">{t('editor:tools.zoneEllipse')}</option>
            </select>
          </Field>
        </>
      )}
      {ann.type === 'line' && (
        <div className="row2">
          <Field label={t('editor:props.color')}>
            <input type="color" value={ann.color} onChange={(e) => up({ color: e.target.value.toUpperCase() })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={!!ann.dashed} onChange={(e) => up({ dashed: e.target.checked })} />
            {t('editor:props.dashed')}
          </label>
        </div>
      )}
      {ann.type === 'text' && (
        <>
          <Field label={t('editor:props.text')}>
            <TextInput value={ann.text} maxLength={500} autoFocus onCommit={(v) => up({ text: v })} />
          </Field>
          <Field label={t('editor:props.size')}>
            <NumberInput value={ann.size} min={0.5} max={20} step={0.5} onCommit={(n) => up({ size: n })} />
          </Field>
        </>
      )}
      {ann.type === 'equipment' && (
        <div className="row2">
          <Field label={t('editor:tools.equipment')}>
            <select value={ann.item} onChange={(e) => up({ item: e.target.value })}>
              {EQUIPMENT_ITEMS.map((it) => (
                <option key={it} value={it}>
                  {t(`editor:equipment.${it}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('editor:props.rotation')}>
            <NumberInput value={ann.rotation ?? 0} step={15} onCommit={(n) => up({ rotation: n })} />
          </Field>
        </div>
      )}
      <button className="btn danger" onClick={() => dispatch('removeAnnotation', { phase, annotationId: ann.id })}>
        <Icon.trash /> {t('common:actions.delete')}
      </button>
    </div>
  );
}

function PhaseSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const phase = useEditor((s) => s.phase);
  const dispatch = useEditor((s) => s.dispatch);
  const ph = board.phases[phase];
  if (!ph) return null;
  const up = (patch: Record<string, unknown>) => dispatch('updatePhase', { phase, ...patch });
  const cam = ph.camera?.mode ?? 'fixed';
  return (
    <div className="stack">
      <Field label={t('editor:phase.label')}>
        <TextInput value={ph.label ?? ''} maxLength={120} placeholder={t('editor:phase.n', { n: phase + 1 })} onCommit={(v) => up({ label: v || null })} />
      </Field>
      <div className="row2">
        <Field label={t('editor:phase.duration')}>
          <NumberInput value={ph.durationMs / 1000} min={0} max={60} step={0.1} onCommit={(n) => up({ durationMs: Math.round(n * 1000) })} />
        </Field>
        <Field label={t('editor:phase.hold')}>
          <NumberInput value={ph.holdMs / 1000} min={0} max={60} step={0.1} onCommit={(n) => up({ holdMs: Math.round(n * 1000) })} />
        </Field>
      </div>
      <div className="row2">
        <Field label={t('editor:phase.easing')}>
          <select value={ph.easing} onChange={(e) => up({ easing: e.target.value })}>
            {EASINGS.map((e) => (
              <option key={e} value={e}>
                {t(`editor:easing.${e}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('editor:phase.camera')}>
          <select
            value={cam}
            onChange={(e) => {
              const v = e.target.value;
              const spec: CameraSpec | null = v === 'follow_ball' ? { mode: 'follow_ball', zoom: 1.8 } : null;
              up({ camera: spec });
            }}
          >
            <option value="fixed">{t('editor:camera.fixed')}</option>
            <option value="follow_ball">{t('editor:camera.follow_ball')}</option>
            {cam === 'rect' && <option value="rect">{t('editor:camera.rect')}</option>}
          </select>
        </Field>
      </div>
      {ph.camera?.mode === 'follow_ball' && (
        <Field label={t('editor:camera.zoom')}>
          <input type="range" min={1} max={4} step={0.1} value={ph.camera.zoom} onChange={(e) => up({ camera: { mode: 'follow_ball', zoom: Number(e.target.value) } })} />
        </Field>
      )}
      <Field label={t('editor:phase.ballCarrier')}>
        <select value={ph.ballCarrierId ?? ''} onChange={(e) => up({ ballCarrierId: e.target.value || null })}>
          <option value="">—</option>
          {allPlayers(board).map((p) => (
            <option key={p.id} value={p.id}>
              {playerLabel(p)} {p.role ? `(${t(`team:roles.${p.role}`)})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('editor:phase.notes')}>
        <NotesInput value={ph.notes ?? ''} onCommit={(v) => up({ notes: v || null })} />
      </Field>
      {phase === 0 && <p className="hint">{t('editor:phase.firstHint')}</p>}
    </div>
  );
}

function NotesInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea rows={3} maxLength={4000} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />;
}

function viewKey(b: Board) {
  return typeof b.pitch.view === 'string' ? b.pitch.view : 'custom';
}

function PitchSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const dispatch = useEditor((s) => s.dispatch);
  const p = board.pitch;
  const up = (patch: Record<string, unknown>) => dispatch('setPitch', patch);
  return (
    <div className="stack">
      <Field label={t('editor:pitch.view')}>
        <select value={viewKey(board)} onChange={(e) => up({ view: e.target.value })}>
          {PITCH_VIEWS.map((v) => (
            <option key={v} value={v}>
              {t(`editor:views.${v}`)}
            </option>
          ))}
          {viewKey(board) === 'custom' && <option value="custom">{t('editor:views.custom')}</option>}
        </select>
      </Field>
      <div className="row2">
        <Field label={t('editor:pitch.surface')}>
          <select value={p.surface} onChange={(e) => up({ surface: e.target.value })}>
            {SURFACES.map((s) => (
              <option key={s} value={s}>
                {t(`editor:surfaces.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('editor:pitch.markings')}>
          <select value={p.markings ?? 'regulation'} onChange={(e) => up({ markings: e.target.value })}>
            <option value="regulation">{t('editor:pitch.regulation')}</option>
            <option value="outline">{t('editor:pitch.outline')}</option>
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label={t('editor:pitch.orientation')}>
          <select value={p.orientation} onChange={(e) => up({ orientation: e.target.value })}>
            <option value="horizontal">{t('editor:pitch.horizontal')}</option>
            <option value="vertical">{t('editor:pitch.vertical')}</option>
          </select>
        </Field>
        <Field label={t('editor:pitch.perspective')}>
          <select value={p.perspective} onChange={(e) => up({ perspective: e.target.value })}>
            <option value="flat">{t('editor:pitch.flat')}</option>
            <option value="broadcast">{t('editor:pitch.broadcast')}</option>
          </select>
        </Field>
      </div>
      <div className="row2">
        <Field label={t('editor:pitch.length')}>
          <NumberInput value={p.length} min={5} max={130} onCommit={(n) => up({ length: n })} />
        </Field>
        <Field label={t('editor:pitch.width')}>
          <NumberInput value={p.width} min={5} max={100} onCommit={(n) => up({ width: n })} />
        </Field>
      </div>
      <div className="row2">
        <label className="check">
          <input type="checkbox" checked={!!p.grid?.visible} onChange={(e) => up({ grid: e.target.checked ? { cellMeters: p.grid?.cellMeters ?? 10, visible: true } : null })} />
          {t('editor:pitch.grid')}
        </label>
        {p.grid?.visible && (
          <Field label={t('editor:pitch.cell')}>
            <NumberInput value={p.grid.cellMeters} min={1} max={50} onCommit={(n) => up({ grid: { cellMeters: n, visible: true } })} />
          </Field>
        )}
      </div>
    </div>
  );
}

function BoardSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const dispatch = useEditor((s) => s.dispatch);
  return (
    <div className="stack">
      <Field label={t('editor:board.title')}>
        <TextInput value={board.title} maxLength={200} placeholder={t('common:untitled')} onCommit={(v) => dispatch('setBoardMeta', { title: v })} />
      </Field>
      <Field label={t('editor:board.kind')}>
        <select value={board.kind} onChange={(e) => dispatch('setBoardMeta', { kind: e.target.value })}>
          {BOARD_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`editor:kinds.${k}`)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function TeamEditor({ team, side }: { team: Team; side: 'home' | 'away' }) {
  const { t, i18n } = useTranslation();
  const phase = useEditor((s) => s.phase);
  const dispatch = useEditor((s) => s.dispatch);
  const [formation, setFormation] = useState('4-3-3');
  const kit = (k: keyof Team['kit']) => (
    <Field label={t(`team:kit.${k}`)}>
      <input type="color" value={team.kit[k]} onChange={(e) => dispatch('setKit', { team: side, [k]: e.target.value.toUpperCase() })} />
    </Field>
  );
  const lang = i18n.language.startsWith('it') ? 'it' : 'en';
  return (
    <div className="stack team-editor">
      <Field label={t(`team:${side}`)}>
        <TextInput value={team.name} maxLength={80} onCommit={(v) => dispatch('setTeam', { team: side, name: v })} />
      </Field>
      <div className="row4">
        {kit('primary')}
        {kit('secondary')}
        {kit('number')}
        {kit('gkPrimary')}
      </div>
      <div className="row-inline">
        <select value={formation} onChange={(e) => setFormation(e.target.value)} aria-label={t('team:formation')}>
          {FORMATIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label[lang]}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => dispatch('applyFormation', { team: side, formationId: formation, phase }, t('team:applyFormation'))} data-testid={`apply-formation-${side}`}>
          {t('team:applyFormation')}
        </button>
      </div>
      <p className="hint">{t('team:playersCount', { count: team.players.length })}</p>
      {side === 'away' && (
        <button className="btn ghost" onClick={() => dispatch('setTeam', { team: 'away', remove: true })}>
          {t('team:removeAway')}
        </button>
      )}
    </div>
  );
}

function TeamsSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const dispatch = useEditor((s) => s.dispatch);
  return (
    <div className="stack">
      <TeamEditor team={board.teams[0]!} side="home" />
      {board.teams[1] ? (
        <TeamEditor team={board.teams[1]} side="away" />
      ) : (
        <button className="btn" onClick={() => dispatch('setTeam', { team: 'away', name: t('team:defaults.away') })}>
          <Icon.plus /> {t('team:addAway')}
        </button>
      )}
    </div>
  );
}

function SetPiecesSection() {
  const { t } = useTranslation();
  const board = useEditor((s) => s.board);
  const dispatch = useEditor((s) => s.dispatch);
  const toast = useEditor((s) => s.toast);
  const [routine, setRoutine] = useState(ROUTINES[0]!.id);
  const sequences = useLiveQuery(() => db.sequences.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const [seqName, setSeqName] = useState('');

  const saveSeq = async () => {
    const name = seqName.trim() || board.title || t('editor:sequences.defaultName');
    const seq = extractSequence(board, { id: newId('seq_'), name });
    const row: SequenceRow = { id: seq.id, name, createdAt: new Date().toISOString(), data: seq };
    await db.sequences.put(row);
    setSeqName('');
    toast(t('editor:sequences.saved'));
  };

  return (
    <div className="stack">
      <Field label={t('editor:routines.label')}>
        <select value={routine} onChange={(e) => setRoutine(e.target.value)}>
          {ROUTINES.map((r) => (
            <option key={r.id} value={r.id}>
              {t(`editor:routines.items.${r.id}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="row-inline">
        <button className="btn" onClick={() => dispatch('applySetPieceRoutine', { routineId: routine, mode: 'replace' }, t('editor:routines.apply'))}>
          {t('editor:routines.apply')}
        </button>
        <button className="btn ghost" onClick={() => dispatch('applySetPieceRoutine', { routineId: routine, mode: 'append' }, t('editor:routines.append'))}>
          {t('editor:routines.append')}
        </button>
      </div>
      <hr />
      <Field label={t('editor:sequences.save')}>
        <div className="row-inline">
          <input value={seqName} placeholder={t('editor:sequences.namePlaceholder')} onChange={(e) => setSeqName(e.target.value)} />
          <button className="btn" onClick={() => void saveSeq()}>
            {t('common:actions.save')}
          </button>
        </div>
      </Field>
      {sequences.length > 0 && (
        <ul className="list">
          {sequences.map((s) => (
            <li key={s.id}>
              <span className="grow">{s.name}</span>
              <button className="btn small" onClick={() => dispatch('applySequence', { sequence: s.data, mode: 'append' }, t('editor:sequences.apply'))}>
                {t('editor:sequences.apply')}
              </button>
              <button className="icon-btn" aria-label={t('common:actions.delete')} onClick={() => void db.sequences.delete(s.id)}>
                <Icon.trash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Inspector() {
  const { t } = useTranslation();
  const preview = useEditor((s) => s.aiPreview);
  return (
    <aside className="inspector" aria-label={t('editor:props.panel')}>
      {preview && <div className="banner">{t('ai:previewInspector')}</div>}
      <fieldset disabled={!!preview}>
        <details open>
          <summary>{t('editor:sections.selection')}</summary>
          <SelectionSection />
        </details>
        <details open>
          <summary>{t('editor:sections.phase')}</summary>
          <PhaseSection />
        </details>
        <details>
          <summary>{t('editor:sections.teams')}</summary>
          <TeamsSection />
        </details>
        <details>
          <summary>{t('editor:sections.pitch')}</summary>
          <PitchSection />
        </details>
        <details>
          <summary>{t('editor:sections.board')}</summary>
          <BoardSection />
        </details>
        <details>
          <summary>{t('editor:sections.setPieces')}</summary>
          <SetPiecesSection />
        </details>
      </fieldset>
    </aside>
  );
}

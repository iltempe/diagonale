import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MATCH_PLAN_SECTIONS, newId, sessionTotalMinutes, type MatchPlan, type Session } from '@diagonale/core';
import { db } from '../lib/db';
import { useLiveQuery } from '../lib/useLiveQuery';
import { exportMatchPlanPdf, exportSessionPdf } from '../lib/plannerPdf';
import { cloudSaveRow } from '../lib/cloud';
import { useEditor } from '../store/editor';
import { Icon } from '../components/Icons';

function useBoards() {
  return useLiveQuery(() => db.boards.orderBy('updatedAt').reverse().toArray(), []) ?? [];
}

function BoardSelect({ value, onChange, exclude = [] }: { value?: string; onChange: (id: string) => void; exclude?: string[] }) {
  const { t } = useTranslation();
  const boards = useBoards();
  return (
    <select value={value ?? ''} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={t('planner:chooseBoard')}>
      <option value="">{t('planner:chooseBoard')}</option>
      {boards
        .filter((b) => !exclude.includes(b.id) || b.id === value)
        .map((b) => (
          <option key={b.id} value={b.id}>
            {b.title || t('common:untitled')} · {t(`editor:kinds.${b.kind}`)}
          </option>
        ))}
    </select>
  );
}

function SessionEditor({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useEditor((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const total = sessionTotalMinutes(session);
  const upDrill = (i: number, patch: Partial<Session['drills'][number]>) =>
    onChange({ ...session, drills: session.drills.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <div className="stack">
      <div className="row3">
        <label className="field">
          <span>{t('planner:title')}</span>
          <input value={session.title} onChange={(e) => onChange({ ...session, title: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('planner:date')}</span>
          <input type="date" value={session.date.slice(0, 10)} onChange={(e) => onChange({ ...session, date: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('planner:duration')}</span>
          <input type="number" min={0} max={600} value={session.durationMin} onChange={(e) => onChange({ ...session, durationMin: Number(e.target.value) || 0 })} />
        </label>
      </div>
      <p className={`hint ${total > session.durationMin ? 'err' : ''}`}>{t('planner:drillsTotal', { n: total })}</p>
      <h3>{t('planner:objectives')}</h3>
      {session.objectives.map((o, i) => (
        <div className="row-inline" key={i}>
          <input value={o} onChange={(e) => onChange({ ...session, objectives: session.objectives.map((x, k) => (k === i ? e.target.value : x)) })} />
          <button className="icon-btn" aria-label={t('common:actions.remove')} onClick={() => onChange({ ...session, objectives: session.objectives.filter((_, k) => k !== i) })}>
            <Icon.trash />
          </button>
        </div>
      ))}
      <button className="btn ghost small" onClick={() => onChange({ ...session, objectives: [...session.objectives, ''] })}>
        <Icon.plus /> {t('planner:addObjective')}
      </button>
      <h3>{t('planner:drills')}</h3>
      {session.drills.map((d, i) => (
        <div className="card stack" key={i}>
          <div className="row-inline">
            <b>{i + 1}.</b>
            <BoardSelect value={d.boardId} onChange={(id) => upDrill(i, { boardId: id })} />
            <input type="number" className="num" min={0} max={300} value={d.durationMin} aria-label={t('planner:duration')} onChange={(e) => upDrill(i, { durationMin: Number(e.target.value) || 0 })} />
            <span className="hint">{t('planner:min')}</span>
            <button className="icon-btn" aria-label={t('common:actions.remove')} onClick={() => onChange({ ...session, drills: session.drills.filter((_, k) => k !== i) })}>
              <Icon.trash />
            </button>
          </div>
          <input placeholder={t('planner:playersPlaceholder')} value={d.players} onChange={(e) => upDrill(i, { players: e.target.value })} aria-label={t('planner:players')} />
          <textarea rows={2} placeholder={t('planner:notes')} value={d.notes} onChange={(e) => upDrill(i, { notes: e.target.value })} aria-label={t('planner:notes')} />
        </div>
      ))}
      <div className="row-inline">
        <BoardSelect onChange={(id) => onChange({ ...session, drills: [...session.drills, { boardId: id, durationMin: 15, notes: '', players: '' }] })} />
        <span className="grow" />
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportSessionPdf(session, i18n.language);
            } catch (e) {
              toast(String(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon.download /> {t('planner:exportPdf')}
        </button>
      </div>
    </div>
  );
}

function MatchPlanEditor({ plan, onChange }: { plan: MatchPlan; onChange: (p: MatchPlan) => void }) {
  const { t, i18n } = useTranslation();
  const boards = useBoards();
  const toast = useEditor((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const title = (id: string) => boards.find((b) => b.id === id)?.data.title || t('planner:missingBoard');
  return (
    <div className="stack">
      <div className="row3">
        <label className="field">
          <span>{t('planner:title')}</span>
          <input value={plan.title} onChange={(e) => onChange({ ...plan, title: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('planner:opponent')}</span>
          <input value={plan.opponent} onChange={(e) => onChange({ ...plan, opponent: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('planner:date')}</span>
          <input type="date" value={plan.date?.slice(0, 10) ?? ''} onChange={(e) => onChange({ ...plan, date: e.target.value || undefined })} />
        </label>
      </div>
      {MATCH_PLAN_SECTIONS.map((s) => {
        const sec = plan.sections[s] ?? { boardIds: [], notes: '' };
        const set = (patch: Partial<typeof sec>) => onChange({ ...plan, sections: { ...plan.sections, [s]: { ...sec, ...patch } } });
        return (
          <details key={s} className="card" open={sec.boardIds.length > 0}>
            <summary>
              {t(`planner:sections.${s}`)} <small className="hint">({sec.boardIds.length})</small>
            </summary>
            <div className="stack">
              {sec.boardIds.map((id) => (
                <div className="row-inline" key={id}>
                  <span className="grow">{title(id)}</span>
                  <button className="icon-btn" aria-label={t('common:actions.remove')} onClick={() => set({ boardIds: sec.boardIds.filter((x) => x !== id) })}>
                    <Icon.trash />
                  </button>
                </div>
              ))}
              <BoardSelect exclude={sec.boardIds} onChange={(id) => set({ boardIds: [...sec.boardIds, id] })} />
              <textarea rows={2} placeholder={t('planner:notes')} value={sec.notes} onChange={(e) => set({ notes: e.target.value })} aria-label={t('planner:notes')} />
            </div>
          </details>
        );
      })}
      <div className="row-inline">
        <span className="grow" />
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportMatchPlanPdf(plan, i18n.language);
            } catch (e) {
              toast(String(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon.download /> {t('planner:exportPdf')}
        </button>
      </div>
    </div>
  );
}

export function Planner() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'sessions' | 'plans'>('sessions');
  const sessions = useLiveQuery(() => db.sessions.orderBy('date').reverse().toArray(), []) ?? [];
  const plans = useLiveQuery(() => db.matchPlans.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [draftS, setDraftS] = useState<Session | null>(null);
  const [draftP, setDraftP] = useState<MatchPlan | null>(null);

  useEffect(() => {
    if (!selected) {
      setDraftS(null);
      setDraftP(null);
      return;
    }
    if (tab === 'sessions') {
      const found = sessions.find((s) => s.id === selected)?.data;
      if (found && draftS?.id !== selected) setDraftS(found);
    } else {
      const found = plans.find((s) => s.id === selected)?.data;
      if (found && draftP?.id !== selected) setDraftP(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tab, sessions.length, plans.length]);

  const saveSession = (s: Session) => {
    setDraftS(s);
    void db.sessions.put({ id: s.id, date: s.date, updatedAt: new Date().toISOString(), data: s });
    cloudSaveRow('sessions', s.id, s);
  };
  const savePlan = (p: MatchPlan) => {
    setDraftP(p);
    void db.matchPlans.put({ id: p.id, date: p.date ?? '', updatedAt: new Date().toISOString(), data: p });
  };
  const today = new Date().toISOString().slice(0, 10);
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="page">
      <aside className="page-list">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'active' : ''} onClick={() => (setTab('sessions'), setSelected(null))}>
            {t('planner:sessions')}
          </button>
          <button role="tab" aria-selected={tab === 'plans'} className={tab === 'plans' ? 'active' : ''} onClick={() => (setTab('plans'), setSelected(null))}>
            {t('planner:matchPlans')}
          </button>
        </div>
        <button
          className="btn primary"
          data-testid="planner-new"
          onClick={() => {
            if (tab === 'sessions') {
              const s: Session = { id: newId('ses_'), title: t('planner:newSession'), date: today, durationMin: 90, objectives: [], drills: [] };
              saveSession(s);
              setSelected(s.id);
            } else {
              const p: MatchPlan = { id: newId('mp_'), title: t('planner:newPlan'), opponent: '', date: today, sections: {} as MatchPlan['sections'] };
              savePlan(p);
              setSelected(p.id);
            }
          }}
        >
          <Icon.plus /> {tab === 'sessions' ? t('planner:newSession') : t('planner:newPlan')}
        </button>
        <ul className="list">
          {(tab === 'sessions' ? sessions : plans).map((r) => (
            <li key={r.id} className={r.id === selected ? 'current' : ''}>
              <button className="grow link-row" onClick={() => setSelected(r.id)}>
                <b>{r.data.title || t('common:untitled')}</b>
                <small>{r.date ? fmt.format(new Date(r.date)) : ''}</small>
              </button>
              <button
                className="icon-btn"
                aria-label={t('common:actions.delete')}
                onClick={() => {
                  if (!confirm(t('common:boards.confirmDelete', { title: r.data.title }))) return;
                  void (tab === 'sessions' ? db.sessions.delete(r.id) : db.matchPlans.delete(r.id));
                  if (selected === r.id) setSelected(null);
                }}
              >
                <Icon.trash />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="page-main">
        {tab === 'sessions' && draftS && draftS.id === selected && <SessionEditor session={draftS} onChange={saveSession} />}
        {tab === 'plans' && draftP && draftP.id === selected && <MatchPlanEditor plan={draftP} onChange={savePlan} />}
        {!selected && (
          <div className="empty-state">
            <Icon.clipboard width={40} height={40} />
            <p>{tab === 'sessions' ? t('planner:emptySessions') : t('planner:emptyPlans')}</p>
          </div>
        )}
      </section>
    </div>
  );
}

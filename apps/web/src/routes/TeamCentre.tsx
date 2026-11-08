import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ROLES,
  createEmptyBoard,
  Dispatcher,
  fixtureOutcome,
  formatName,
  newId,
  parseExternalFixtures,
  seasonStats,
  toICS,
  type Fixture,
  type NamePrivacy,
  type SquadPlayer,
  type TeamCentre as TC,
} from '@diagonale/core';
import { db, getSetting, setSetting } from '../lib/db';
import { useLiveQuery } from '../lib/useLiveQuery';
import { downloadBlob, saveBoard, slugify } from '../lib/persistence';
import { pdfSafe, wrap } from '../lib/export';
import { cloudSaveRow } from '../lib/cloud';
import { useEditor } from '../store/editor';
import { Icon } from '../components/Icons';
import { Modal } from '../components/Modal';
import i18n from '../i18n';

type Tab = 'squad' | 'fixtures' | 'stats' | 'settings';

const FORMATION_BY_SIZE: Record<number, string> = { 5: '5-2-1-1', 7: '7-2-3-1', 9: '9-3-3-2', 11: '4-3-3' };

function emptyTeam(name: string): TC {
  return { id: newId('tc_'), name, season: '', squad: [], fixtures: [] };
}

export function buildReport(tc: TC, f: Fixture, privacy: NamePrivacy, lang: string): string {
  const t = i18n.getFixedT(lang, 'team');
  const name = (id: string) => {
    const p = tc.squad.find((x) => x.id === id);
    return p ? formatName(p, privacy) : '?';
  };
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(f.date));
  const lines: string[] = [];
  const home = f.home ? tc.name : f.opponent;
  const away = f.home ? f.opponent : tc.name;
  const score = f.result ? (f.home ? `${f.result.goalsFor}-${f.result.goalsAgainst}` : `${f.result.goalsAgainst}-${f.result.goalsFor}`) : '';
  lines.push(`${home} ${score || '-'} ${away}`);
  lines.push(`${date}${f.competition ? ` · ${f.competition}` : ''}${f.location ? ` · ${f.location}` : ''}`);
  lines.push('');
  if (f.callup?.starters.length) lines.push(`${t('centre.report.starters')}: ${f.callup.starters.map(name).join(', ')}`);
  if (f.callup?.bench.length) lines.push(`${t('centre.report.bench')}: ${f.callup.bench.map(name).join(', ')}`);
  if (f.callup?.captainId) lines.push(`${t('centre.report.captain')}: ${name(f.callup.captainId)}`);
  if (f.result) {
    const scorers = Object.entries(f.result.players)
      .filter(([, s]) => s.goals > 0)
      .map(([id, s]) => `${name(id)}${s.goals > 1 ? ` (${s.goals})` : ''}`);
    if (scorers.length) lines.push(`${t('centre.report.scorers')}: ${scorers.join(', ')}`);
    const cards = Object.entries(f.result.players)
      .filter(([, s]) => s.yellow || s.red)
      .map(([id, s]) => `${name(id)} ${'🟨'.repeat(s.yellow)}${'🟥'.repeat(s.red)}`);
    if (cards.length) lines.push(`${t('centre.report.cards')}: ${cards.join(', ')}`);
  }
  if (f.notes) lines.push('', f.notes);
  return lines.join('\n');
}

async function reportPdf(text: string, title: string) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 781, width: 595.28, height: 61, color: rgb(15 / 255, 61 / 255, 46 / 255) });
  page.drawText(pdfSafe(title), { x: 32, y: 805, size: 18, font: bold, color: rgb(0.957, 0.945, 0.918) });
  let y = 750;
  for (const [i, line] of text.split('\n').entries()) {
    for (const l of wrap(pdfSafe(line.replace(/🟨/g, '[G]').replace(/🟥/g, '[R]')), 90)) {
      page.drawText(l, { x: 32, y, size: i === 0 ? 16 : 11, font: i === 0 ? bold : font });
      y -= i === 0 ? 24 : 16;
    }
  }
  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), `${slugify(title)}.pdf`);
}

function SquadTab({ tc, save }: { tc: TC; save: (t: TC) => void }) {
  const { t } = useTranslation();
  const up = (id: string, patch: Partial<SquadPlayer>) => save({ ...tc, squad: tc.squad.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  return (
    <div className="stack">
      <table className="table">
        <thead>
          <tr>
            <th>{t('team:player.number')}</th>
            <th>{t('team:centre.firstName')}</th>
            <th>{t('team:centre.lastName')}</th>
            <th>{t('team:player.role')}</th>
            <th>{t('team:centre.birthYear')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tc.squad.map((p) => (
            <tr key={p.id}>
              <td>
                <input className="num" type="number" value={p.number ?? ''} onChange={(e) => up(p.id, { number: e.target.value ? Number(e.target.value) : undefined })} aria-label={t('team:player.number')} />
              </td>
              <td>
                <input value={p.firstName} onChange={(e) => up(p.id, { firstName: e.target.value })} aria-label={t('team:centre.firstName')} />
              </td>
              <td>
                <input value={p.lastName} onChange={(e) => up(p.id, { lastName: e.target.value })} aria-label={t('team:centre.lastName')} />
              </td>
              <td>
                <select value={p.role ?? ''} onChange={(e) => up(p.id, { role: (e.target.value || undefined) as SquadPlayer['role'] })} aria-label={t('team:player.role')}>
                  <option value="">—</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`team:roles.${r}`)}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input className="num" type="number" value={p.birthYear ?? ''} onChange={(e) => up(p.id, { birthYear: e.target.value ? Number(e.target.value) : undefined })} aria-label={t('team:centre.birthYear')} />
              </td>
              <td>
                <button className="icon-btn" aria-label={t('common:actions.remove')} onClick={() => save({ ...tc, squad: tc.squad.filter((x) => x.id !== p.id) })}>
                  <Icon.trash />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn"
        data-testid="add-squad-player"
        onClick={() => {
          const used = new Set(tc.squad.map((p) => p.number));
          let n = 1;
          while (used.has(n)) n++;
          save({ ...tc, squad: [...tc.squad, { id: newId('sp_'), firstName: '', lastName: '', number: n }] });
        }}
      >
        <Icon.plus /> {t('team:centre.addPlayer')}
      </button>
    </div>
  );
}

function FixtureEditor({ tc, fixture, save, onClose }: { tc: TC; fixture: Fixture; save: (f: Fixture) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useEditor((s) => s.toast);
  const loadBoard = useEditor((s) => s.loadBoard);
  const [privacy, setPrivacy] = useState<NamePrivacy>('initials');
  const [report, setReport] = useState<string | null>(null);
  const f = fixture;
  const callup = f.callup ?? { available: [], starters: [], bench: [] };
  const setStatus = (id: string, status: 'out' | 'available' | 'starter' | 'bench') => {
    const rm = (a: string[]) => a.filter((x) => x !== id);
    const c = { ...callup, available: rm(callup.available), starters: rm(callup.starters), bench: rm(callup.bench) };
    if (status !== 'out') c.available.push(id);
    if (status === 'starter') c.starters.push(id);
    if (status === 'bench') c.bench.push(id);
    if (status === 'out' && c.captainId === id) delete c.captainId;
    save({ ...f, callup: c });
  };
  const statusOf = (id: string) => (callup.starters.includes(id) ? 'starter' : callup.bench.includes(id) ? 'bench' : callup.available.includes(id) ? 'available' : 'out');
  const played = [...callup.starters, ...callup.bench];
  const result = f.result ?? { goalsFor: 0, goalsAgainst: 0, players: {} };
  const ps = (id: string) => result.players[id] ?? { minutes: 0, goals: 0, yellow: 0, red: 0 };
  const setPs = (id: string, patch: Partial<ReturnType<typeof ps>>) => save({ ...f, result: { ...result, players: { ...result.players, [id]: { ...ps(id), ...patch } } } });
  const local = f.date ? new Date(new Date(f.date).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  const lineupBoard = async () => {
    const starters = callup.starters.map((id) => tc.squad.find((p) => p.id === id)).filter((p): p is SquadPlayer => !!p);
    if (!starters.length) return toast(t('team:centre.noStarters'), 'error');
    const d = new Dispatcher(createEmptyBoard({ title: `${tc.name} - ${f.opponent}`, homeName: tc.name, awayName: f.opponent }));
    for (const p of starters) {
      d.dispatch('addPlayer', { team: 'home', number: p.number, name: `${p.firstName} ${p.lastName}`.trim(), shortName: (p.lastName || p.firstName).slice(0, 24), ...(p.role ? { role: p.role } : {}) });
    }
    const formation = FORMATION_BY_SIZE[starters.length] ?? '4-4-2';
    d.dispatch('applyFormation', { team: 'home', formationId: formation, createMissing: false, allPhases: true });
    if (callup.captainId) {
      const cap = d.board.teams[0]!.players.find((p) => p.name === `${tc.squad.find((s) => s.id === callup.captainId)?.firstName ?? ''} ${tc.squad.find((s) => s.id === callup.captainId)?.lastName ?? ''}`.trim());
      if (cap) d.dispatch('updatePlayer', { playerId: cap.id, shortName: `${cap.shortName ?? ''} (C)`.slice(0, 24) });
    }
    await saveBoard(d.board);
    await setSetting('lastBoardId', d.board.id);
    loadBoard(d.board);
    location.hash = '#/';
  };

  return (
    <div className="stack">
      <div className="row-inline">
        <h2 className="grow">
          {f.home ? `${tc.name} - ${f.opponent || '?'}` : `${f.opponent || '?'} - ${tc.name}`}
        </h2>
        <button className="icon-btn" onClick={onClose} aria-label={t('common:actions.close')}>
          <Icon.close />
        </button>
      </div>
      <div className="row3">
        <label className="field">
          <span>{t('team:centre.opponent')}</span>
          <input value={f.opponent} onChange={(e) => save({ ...f, opponent: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('team:centre.date')}</span>
          <input type="datetime-local" value={local} onChange={(e) => e.target.value && save({ ...f, date: new Date(e.target.value).toISOString() })} />
        </label>
        <label className="field">
          <span>{t('team:centre.venue')}</span>
          <select value={f.home ? 'home' : 'away'} onChange={(e) => save({ ...f, home: e.target.value === 'home' })}>
            <option value="home">{t('team:centre.home')}</option>
            <option value="away">{t('team:centre.away')}</option>
          </select>
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>{t('team:centre.competition')}</span>
          <input value={f.competition ?? ''} onChange={(e) => save({ ...f, competition: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>{t('team:centre.location')}</span>
          <input value={f.location ?? ''} onChange={(e) => save({ ...f, location: e.target.value || undefined })} />
        </label>
      </div>

      <h3>{t('team:centre.callup')}</h3>
      {tc.squad.length === 0 && <p className="hint">{t('team:centre.emptySquad')}</p>}
      <table className="table compact">
        <tbody>
          {tc.squad.map((p) => (
            <tr key={p.id}>
              <td>{p.number}</td>
              <td className="grow">{formatName(p, 'full') || '—'}</td>
              <td>
                <select value={statusOf(p.id)} onChange={(e) => setStatus(p.id, e.target.value as 'out')} aria-label={t('team:centre.callup')}>
                  <option value="out">{t('team:centre.status.out')}</option>
                  <option value="available">{t('team:centre.status.available')}</option>
                  <option value="starter">{t('team:centre.status.starter')}</option>
                  <option value="bench">{t('team:centre.status.bench')}</option>
                </select>
              </td>
              <td>
                <label className="check small">
                  <input type="radio" name={`cap-${f.id}`} checked={callup.captainId === p.id} disabled={statusOf(p.id) === 'out'} onChange={() => save({ ...f, callup: { ...callup, captainId: p.id } })} />
                  {t('team:centre.captain')}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t('team:centre.callupCount', { starters: callup.starters.length, bench: callup.bench.length })}</p>

      <h3>{t('team:centre.result')}</h3>
      <div className="row-inline">
        <label className="check">
          <input type="checkbox" checked={!!f.result} onChange={(e) => save(e.target.checked ? { ...f, result } : { ...f, result: undefined })} />
          {t('team:centre.played')}
        </label>
        {f.result && (
          <>
            <input className="num" type="number" min={0} value={result.goalsFor} aria-label={t('team:centre.goalsFor')} onChange={(e) => save({ ...f, result: { ...result, goalsFor: Number(e.target.value) || 0 } })} />
            <span>–</span>
            <input className="num" type="number" min={0} value={result.goalsAgainst} aria-label={t('team:centre.goalsAgainst')} onChange={(e) => save({ ...f, result: { ...result, goalsAgainst: Number(e.target.value) || 0 } })} />
          </>
        )}
      </div>
      {f.result && played.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th />
              <th>{t('team:centre.minutes')}</th>
              <th>{t('team:centre.goals')}</th>
              <th>{t('team:centre.yellow')}</th>
              <th>{t('team:centre.red')}</th>
            </tr>
          </thead>
          <tbody>
            {played.map((id) => {
              const p = tc.squad.find((x) => x.id === id);
              if (!p) return null;
              const s = ps(id);
              return (
                <tr key={id}>
                  <td>{formatName(p, 'full')}</td>
                  <td>
                    <input className="num" type="number" min={0} max={150} value={s.minutes} aria-label={t('team:centre.minutes')} onChange={(e) => setPs(id, { minutes: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input className="num" type="number" min={0} max={20} value={s.goals} aria-label={t('team:centre.goals')} onChange={(e) => setPs(id, { goals: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input className="num" type="number" min={0} max={2} value={s.yellow} aria-label={t('team:centre.yellow')} onChange={(e) => setPs(id, { yellow: Math.min(2, Number(e.target.value) || 0) })} />
                  </td>
                  <td>
                    <input className="num" type="number" min={0} max={1} value={s.red} aria-label={t('team:centre.red')} onChange={(e) => setPs(id, { red: Math.min(1, Number(e.target.value) || 0) })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <label className="field">
        <span>{t('team:centre.notes')}</span>
        <textarea rows={2} value={f.notes ?? ''} onChange={(e) => save({ ...f, notes: e.target.value || undefined })} />
      </label>
      <div className="row-inline wrap">
        <button className="btn" onClick={() => void lineupBoard()}>
          <Icon.board /> {t('team:centre.lineupBoard')}
        </button>
        <button className="btn" onClick={() => setReport(buildReport(tc, f, privacy, i18n.language))} data-testid="parent-report">
          <Icon.clipboard /> {t('team:centre.report.button')}
        </button>
      </div>
      {report !== null && (
        <Modal title={t('team:centre.report.title')} onClose={() => setReport(null)}>
          <div className="stack">
            <label className="field">
              <span>{t('team:centre.report.privacy')}</span>
              <select
                value={privacy}
                onChange={(e) => {
                  const pv = e.target.value as NamePrivacy;
                  setPrivacy(pv);
                  setReport(buildReport(tc, f, pv, i18n.language));
                }}
                data-testid="privacy"
              >
                <option value="initials">{t('team:centre.privacy.initials')}</option>
                <option value="first">{t('team:centre.privacy.first')}</option>
                <option value="full">{t('team:centre.privacy.full')}</option>
              </select>
            </label>
            <textarea rows={10} value={report} onChange={(e) => setReport(e.target.value)} data-testid="report-text" />
            <div className="row-inline">
              <button className="btn primary" onClick={() => void navigator.clipboard.writeText(report).then(() => toast(t('common:share.copied')))}>
                {t('common:share.copy')}
              </button>
              <button className="btn" onClick={() => void reportPdf(report, `${tc.name} - ${f.opponent}`)}>
                <Icon.download /> {t('team:centre.report.pdf')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FixturesTab({ tc, save }: { tc: TC; save: (t: TC) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const sorted = [...tc.fixtures].sort((a, b) => a.date.localeCompare(b.date));
  const saveFixture = (f: Fixture) => save({ ...tc, fixtures: tc.fixtures.map((x) => (x.id === f.id ? f : x)) });
  const current = tc.fixtures.find((f) => f.id === open);
  return (
    <div className="split">
      <div className="stack">
        <button
          className="btn primary"
          data-testid="add-fixture"
          onClick={() => {
            const f: Fixture = { id: newId('fx_'), date: new Date(Date.now() + 7 * 864e5).toISOString(), opponent: '', home: true };
            save({ ...tc, fixtures: [...tc.fixtures, f] });
            setOpen(f.id);
          }}
        >
          <Icon.plus /> {t('team:centre.addFixture')}
        </button>
        <ul className="list">
          {sorted.map((f) => {
            const o = fixtureOutcome(f);
            return (
              <li key={f.id} className={f.id === open ? 'current' : ''}>
                <button className="grow link-row" onClick={() => setOpen(f.id)}>
                  <b>
                    {f.home ? t('team:centre.vsHome', { opponent: f.opponent || '?' }) : t('team:centre.vsAway', { opponent: f.opponent || '?' })}
                  </b>
                  <small>
                    {fmt.format(new Date(f.date))}
                    {f.competition ? ` · ${f.competition}` : ''}
                  </small>
                </button>
                {o && (
                  <span className={`result ${o}`}>
                    {f.result!.goalsFor}-{f.result!.goalsAgainst}
                  </span>
                )}
                <button className="icon-btn" aria-label={t('common:actions.delete')} onClick={() => save({ ...tc, fixtures: tc.fixtures.filter((x) => x.id !== f.id) })}>
                  <Icon.trash />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>{current ? <FixtureEditor tc={tc} fixture={current} save={saveFixture} onClose={() => setOpen(null)} /> : <p className="hint">{t('team:centre.pickFixture')}</p>}</div>
    </div>
  );
}

function StatsTab({ tc }: { tc: TC }) {
  const { t } = useTranslation();
  const s = useMemo(() => seasonStats(tc), [tc]);
  const rows = s.players.map((p) => ({ ...p, player: tc.squad.find((x) => x.id === p.playerId)! })).sort((a, b) => b.minutes - a.minutes);
  return (
    <div className="stack">
      <div className="kpis">
        {(['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'] as const).map((k) => (
          <div key={k} className="kpi">
            <b>{s.team[k]}</b>
            <span>{t(`team:centre.kpi.${k}`)}</span>
          </div>
        ))}
      </div>
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>{t('team:centre.kpi.calledUp')}</th>
            <th>{t('team:centre.kpi.appearances')}</th>
            <th>{t('team:centre.kpi.starts')}</th>
            <th>{t('team:centre.minutes')}</th>
            <th>{t('team:centre.goals')}</th>
            <th>{t('team:centre.yellow')}</th>
            <th>{t('team:centre.red')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td>
                {r.player.number != null ? `${r.player.number} · ` : ''}
                {formatName(r.player, 'full')}
              </td>
              <td>{r.calledUp}</td>
              <td>{r.appearances}</td>
              <td>{r.starts}</td>
              <td>{r.minutes}</td>
              <td>{r.goals}</td>
              <td>{r.yellow}</td>
              <td>{r.red}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({ tc, save, remove }: { tc: TC; save: (t: TC) => void; remove: () => void }) {
  const { t } = useTranslation();
  const toast = useEditor((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    void getSetting(`externalSource:${tc.id}`, '').then(setUrl);
  }, [tc.id]);

  const merge = (text: string) => {
    const incoming = parseExternalFixtures(text, tc.name, () => newId('fx_'));
    const byUid = new Map(tc.fixtures.filter((f) => f.uid).map((f) => [f.uid!, f]));
    const fixtures = [...tc.fixtures];
    let added = 0;
    for (const f of incoming) {
      const existing = f.uid ? byUid.get(f.uid) : undefined;
      if (existing) Object.assign(existing, { date: f.date, opponent: f.opponent, home: f.home, location: f.location ?? existing.location });
      else {
        fixtures.push(f);
        added++;
      }
    }
    save({ ...tc, fixtures: [...fixtures] });
    toast(t('team:centre.imported', { count: added, updated: incoming.length - added }));
  };

  return (
    <div className="stack narrow">
      <div className="row2">
        <label className="field">
          <span>{t('team:centre.teamName')}</span>
          <input value={tc.name} onChange={(e) => save({ ...tc, name: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('team:centre.season')}</span>
          <input value={tc.season ?? ''} placeholder="2026/27" onChange={(e) => save({ ...tc, season: e.target.value })} />
        </label>
      </div>
      <h3>{t('team:centre.calendar')}</h3>
      <div className="row-inline wrap">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon.upload /> {t('team:centre.importIcs')}
        </button>
        <input ref={fileRef} type="file" accept=".ics,.json,text/calendar,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            merge(await f.text());
          } catch (err) {
            toast(String(err), 'error');
          }
        }} />
        <button className="btn" onClick={() => downloadBlob(new Blob([toICS(tc)], { type: 'text/calendar' }), `${slugify(tc.name)}.ics`)} data-testid="export-ics">
          <Icon.calendar /> {t('team:centre.exportIcs')}
        </button>
      </div>
      <p className="hint">{t('team:centre.icsHint')}</p>
      <label className="field">
        <span>{t('team:centre.externalSource')}</span>
        <div className="row-inline">
          <input value={url} placeholder="https://…/calendar.ics" onChange={(e) => setUrl(e.target.value)} />
          <button
            className="btn"
            disabled={!url}
            onClick={async () => {
              await setSetting(`externalSource:${tc.id}`, url);
              try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                merge(await res.text());
              } catch (err) {
                toast(`${t('team:centre.fetchError')}: ${err instanceof Error ? err.message : String(err)}`, 'error');
              }
            }}
          >
            {t('team:centre.sync')}
          </button>
        </div>
      </label>
      <p className="hint">{t('team:centre.externalHint')}</p>
      <hr />
      <button className="btn danger" onClick={() => confirm(t('common:boards.confirmDelete', { title: tc.name })) && remove()}>
        <Icon.trash /> {t('team:centre.deleteTeam')}
      </button>
    </div>
  );
}

export function TeamCentre() {
  const { t } = useTranslation();
  const rows = useLiveQuery(() => db.teamCentres.orderBy('updatedAt').reverse().toArray(), []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('squad');
  const [draft, setDraft] = useState<TC | null>(null);

  useEffect(() => {
    if (!rows) return;
    const pick = rows.find((r) => r.id === activeId) ?? rows[0];
    if (pick && pick.id !== draft?.id) {
      setActiveId(pick.id);
      setDraft(pick.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeId]);

  const save = (tc: TC) => {
    setDraft(tc);
    void db.teamCentres.put({ id: tc.id, updatedAt: new Date().toISOString(), data: tc });
    cloudSaveRow('teams', tc.id, tc);
  };

  const create = () => {
    const tc = emptyTeam(t('team:centre.newTeamName'));
    save(tc);
    setActiveId(tc.id);
    setTab('squad');
  };

  if (rows && rows.length === 0 && !draft) {
    return (
      <div className="page single">
        <div className="empty-state">
          <Icon.calendar width={40} height={40} />
          <h2>{t('team:centre.title')}</h2>
          <p>{t('team:centre.intro')}</p>
          <button className="btn primary" onClick={create} data-testid="create-team">
            <Icon.plus /> {t('team:centre.createTeam')}
          </button>
        </div>
      </div>
    );
  }
  if (!draft) return null;
  return (
    <div className="page single">
      <div className="page-head">
        <select value={draft.id} onChange={(e) => (setActiveId(e.target.value), setDraft(rows?.find((r) => r.id === e.target.value)?.data ?? null))} aria-label={t('team:centre.title')}>
          {rows?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.data.name}
            </option>
          ))}
        </select>
        <button className="btn ghost small" onClick={create}>
          <Icon.plus /> {t('team:centre.createTeam')}
        </button>
        <div className="tabs" role="tablist">
          {(['squad', 'fixtures', 'stats', 'settings'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`tc-tab-${k}`}>
              {t(`team:centre.tabs.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="page-body">
        {tab === 'squad' && <SquadTab tc={draft} save={save} />}
        {tab === 'fixtures' && <FixturesTab tc={draft} save={save} />}
        {tab === 'stats' && <StatsTab tc={draft} />}
        {tab === 'settings' && (
          <SettingsTab
            tc={draft}
            save={save}
            remove={() => {
              void db.teamCentres.delete(draft.id);
              setDraft(null);
              setActiveId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

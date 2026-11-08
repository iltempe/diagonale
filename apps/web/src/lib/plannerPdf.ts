import { MATCH_PLAN_SECTIONS, sessionTotalMinutes, type Board, type MatchPlan, type Session } from '@diagonale/core';
import i18n from '../i18n';
import { db } from './db';
import { pdfSafe, renderPhasePng, wrap } from './export';
import { downloadBlob, slugify } from './persistence';

async function boardsById(ids: string[]): Promise<Map<string, Board>> {
  const rows = await db.boards.bulkGet(ids);
  return new Map(rows.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.id, r.data]));
}

async function lib() {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setCreator('Diagonale');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold, rgb, green: rgb(15 / 255, 61 / 255, 46 / 255), chalk: rgb(0.957, 0.945, 0.918), grey: rgb(0.4, 0.4, 0.4) };
}

/** Session planner export: A4 with objectives and drills (image, area in meters, grid, duration, notes). */
export async function exportSessionPdf(session: Session, lang: string) {
  const t = i18n.getFixedT(lang, 'planner');
  const { doc, font, bold, green, chalk, grey } = await lib();
  doc.setTitle(session.title);
  const boards = await boardsById(session.drills.map((d) => d.boardId));
  const W = 595.28;
  const H = 841.89;
  const fmtDate = session.date ? new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(new Date(session.date)) : '';
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: green });
  page.drawText(pdfSafe(session.title || t('untitledSession')), { x: 32, y: H - 38, size: 20, font: bold, color: chalk });
  page.drawText(pdfSafe(`${fmtDate}  ·  ${t('durationMin', { n: session.durationMin })}  ·  ${t('drillsTotal', { n: sessionTotalMinutes(session) })}`), {
    x: 32,
    y: H - 58,
    size: 10,
    font,
    color: chalk,
  });
  let y = H - 96;
  if (session.objectives.length) {
    page.drawText(pdfSafe(t('objectives')), { x: 32, y, size: 12, font: bold, color: green });
    for (const o of session.objectives) {
      for (const line of wrap(pdfSafe(`• ${o}`), 95)) {
        y -= 15;
        page.drawText(line, { x: 40, y, size: 10, font });
      }
    }
    y -= 20;
  }
  for (const [i, d] of session.drills.entries()) {
    const board = boards.get(d.boardId);
    const blockH = 250;
    if (y - blockH < 40) {
      page = doc.addPage([W, H]);
      y = H - 40;
    }
    page.drawLine({ start: { x: 32, y }, end: { x: W - 32, y }, thickness: 0.5, color: grey });
    y -= 20;
    page.drawText(pdfSafe(`${i + 1}. ${board?.title || t('missingBoard')}`), { x: 32, y, size: 13, font: bold, color: green });
    page.drawText(pdfSafe(t('durationMin', { n: d.durationMin })), { x: W - 120, y, size: 11, font: bold });
    y -= 10;
    const imgW = 300;
    const imgH = imgW * (9 / 16);
    if (board) {
      const png = await renderPhasePng(board, 0, { lang, orientation: 'horizontal', resolution: '720p', captions: false });
      const img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
      page.drawImage(img, { x: 32, y: y - imgH, width: imgW, height: imgH });
    }
    let ty = y - 12;
    const tx = 32 + imgW + 16;
    const info = (label: string, value: string) => {
      page.drawText(pdfSafe(label), { x: tx, y: ty, size: 8, font: bold, color: grey });
      ty -= 12;
      for (const line of wrap(pdfSafe(value), 38)) {
        page.drawText(line, { x: tx, y: ty, size: 10, font });
        ty -= 13;
      }
      ty -= 5;
    };
    if (board) {
      info(t('area'), `${board.pitch.length} × ${board.pitch.width} m${board.pitch.grid ? ` · ${t('grid', { n: board.pitch.grid.cellMeters })}` : ''}`);
      info(t('phases'), String(board.phases.length));
    }
    if (d.players) info(t('players'), d.players);
    if (d.notes) info(t('notes'), d.notes.slice(0, 400));
    y = Math.min(y - imgH, ty) - 16;
  }
  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), `${slugify(session.title || 'session')}.pdf`);
}

/** Match plan export: cover + one landscape page per board with up to 4 phases. */
export async function exportMatchPlanPdf(plan: MatchPlan, lang: string) {
  const t = i18n.getFixedT(lang, 'planner');
  const { doc, font, bold, green, chalk, grey } = await lib();
  doc.setTitle(plan.title);
  const allIds = MATCH_PLAN_SECTIONS.flatMap((s) => plan.sections[s]?.boardIds ?? []);
  const boards = await boardsById(allIds);
  const W = 841.89;
  const H = 595.28;
  const cover = doc.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: green });
  cover.drawText(pdfSafe(plan.title || t('untitledPlan')), { x: 48, y: H - 120, size: 32, font: bold, color: chalk });
  const sub = [plan.opponent && `${t('opponent')}: ${plan.opponent}`, plan.date && new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(new Date(plan.date))].filter(Boolean).join('  ·  ');
  cover.drawText(pdfSafe(sub), { x: 48, y: H - 150, size: 14, font, color: chalk });
  let cy = H - 210;
  for (const s of MATCH_PLAN_SECTIONS) {
    const sec = plan.sections[s];
    if (!sec || (!sec.boardIds.length && !sec.notes)) continue;
    cover.drawText(pdfSafe(`${t(`sections.${s}`)} (${sec.boardIds.length})`), { x: 48, y: cy, size: 13, font: bold, color: chalk });
    cy -= 16;
    for (const line of wrap(pdfSafe(sec.notes), 120).slice(0, 3)) {
      cover.drawText(line, { x: 60, y: cy, size: 10, font, color: chalk });
      cy -= 13;
    }
    cy -= 8;
    if (cy < 40) break;
  }
  for (const s of MATCH_PLAN_SECTIONS) {
    const sec = plan.sections[s];
    for (const id of sec?.boardIds ?? []) {
      const board = boards.get(id);
      if (!board) continue;
      const page = doc.addPage([W, H]);
      page.drawRectangle({ x: 0, y: H - 44, width: W, height: 44, color: green });
      page.drawText(pdfSafe(t(`sections.${s}`).toUpperCase()), { x: 28, y: H - 28, size: 12, font: bold, color: chalk });
      page.drawText(pdfSafe(board.title || t('missingBoard')), { x: 28, y: H - 66, size: 16, font: bold, color: green });
      const n = Math.min(4, board.phases.length);
      const pick = n === board.phases.length ? [...Array(n).keys()] : [0, 1, 2, board.phases.length - 1].slice(0, n);
      const cellW = (W - 72) / 2;
      const cellH = cellW * (9 / 16);
      for (const [k, pi] of pick.entries()) {
        const png = await renderPhasePng(board, pi, { lang, orientation: 'horizontal', resolution: '720p' });
        const img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
        const col = k % 2;
        const row = Math.floor(k / 2);
        page.drawImage(img, { x: 28 + col * (cellW + 16), y: H - 84 - (row + 1) * cellH - row * 12, width: cellW, height: cellH });
      }
      if (sec?.notes) {
        let ny = H - 84 - 2 * cellH - 30;
        for (const line of wrap(pdfSafe(sec.notes), 150).slice(0, 2)) {
          page.drawText(line, { x: 28, y: ny, size: 9, font, color: grey });
          ny -= 12;
        }
      }
    }
  }
  downloadBlob(new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), `${slugify(plan.title || 'match-plan')}.pdf`);
}

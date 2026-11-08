import { findPlayer, playerLabel } from './board';
import { timeline } from './animation';
import { viewRect } from './pitch';
import { BALL_ID, type Anchor, type Board } from './schema';

const r1 = (n: number) => Math.round(n * 10) / 10;

function anchorText(board: Board, a: Anchor): string {
  if ('entityId' in a) {
    if (a.entityId === BALL_ID) return 'ball';
    const p = findPlayer(board, a.entityId);
    return p ? `${a.entityId}(${playerLabel(p)})` : a.entityId;
  }
  return `(${r1(a.x)},${r1(a.y)})`;
}

/**
 * Text summary + compact JSON of a board, designed as context for AI models.
 * Coordinates are rounded to 0.1 m.
 */
export function describeBoard(board: Board): { text: string; compact: unknown } {
  const v = viewRect(board.pitch, board.pitch.view);
  const tl = timeline(board);
  const lines: string[] = [];
  lines.push(`Board "${board.title || '(untitled)'}" kind=${board.kind}, id=${board.id}`);
  lines.push(
    `Pitch ${board.pitch.length}x${board.pitch.width} m, view=${typeof board.pitch.view === 'string' ? board.pitch.view : 'custom'} (x ${r1(v.x)}..${r1(v.x + v.w)}, y ${r1(v.y)}..${r1(v.y + v.h)}), surface=${board.pitch.surface}, orientation=${board.pitch.orientation}, perspective=${board.pitch.perspective}${board.pitch.grid ? `, grid ${board.pitch.grid.cellMeters} m` : ''}`,
  );
  lines.push('Coordinates: x along length (0 = home goal line, home attacks +x), y along width (0 = home left touchline).');
  board.teams.forEach((t, i) => {
    lines.push(
      `Team ${i === 0 ? 'home' : 'away'} id=${t.id} "${t.name}" kit ${t.kit.primary}/${t.kit.secondary}, ${t.players.length} players:`,
    );
    for (const p of t.players) {
      lines.push(
        `  - ${p.id}: ${p.number != null ? '#' + p.number + ' ' : ''}${p.role ?? ''}${p.name ? ' ' + p.name : ''}`.trimEnd(),
      );
    }
  });
  lines.push(`${board.phases.length} phases, total ${r1(tl.totalMs / 1000)} s:`);
  board.phases.forEach((ph, i) => {
    lines.push(
      `Phase ${i}${ph.label ? ` "${ph.label}"` : ''}: transition ${ph.durationMs} ms, hold ${ph.holdMs} ms, easing ${ph.easing}${ph.ballCarrierId ? `, ball carrier ${ph.ballCarrierId}` : ''}${ph.camera && ph.camera.mode !== 'fixed' ? `, camera ${ph.camera.mode}` : ''}`,
    );
    const pos = Object.entries(ph.positions)
      .map(([id, p]) => `${id}@${r1(p.x)},${r1(p.y)}`)
      .join(' ');
    lines.push(`  positions: ${pos}`);
    for (const a of ph.annotations) {
      switch (a.type) {
        case 'arrow':
          lines.push(`  arrow ${a.id} ${a.style} ${anchorText(board, a.from)} -> ${anchorText(board, a.to)}${a.label ? ` "${a.label}"` : ''}`);
          break;
        case 'zone':
          lines.push(`  zone ${a.id} ${a.shape} ${a.points.map((p) => `(${r1(p.x)},${r1(p.y)})`).join(' ')}`);
          break;
        case 'line':
          lines.push(`  line ${a.id} ${a.points.map((p) => `(${r1(p.x)},${r1(p.y)})`).join(' ')}`);
          break;
        case 'text':
          lines.push(`  text ${a.id} "${a.text}" at (${r1(a.at.x)},${r1(a.at.y)})`);
          break;
        case 'equipment':
          lines.push(`  equipment ${a.id} ${a.item} at (${r1(a.at.x)},${r1(a.at.y)})`);
          break;
      }
    }
  });

  const compact = {
    id: board.id,
    title: board.title,
    kind: board.kind,
    pitch: board.pitch,
    teams: board.teams.map((t) => ({
      id: t.id,
      name: t.name,
      players: t.players.map((p) => ({ id: p.id, n: p.number, r: p.role, name: p.name })),
    })),
    phases: board.phases.map((ph) => ({
      label: ph.label,
      d: ph.durationMs,
      h: ph.holdMs,
      pos: Object.fromEntries(Object.entries(ph.positions).map(([id, p]) => [id, [r1(p.x), r1(p.y)]])),
      ann: ph.annotations.length,
    })),
  };
  return { text: lines.join('\n'), compact };
}

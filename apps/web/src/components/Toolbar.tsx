import { useTranslation } from 'react-i18next';
import { ARROW_STYLES, EQUIPMENT_ITEMS, type EquipmentItem } from '@diagonale/core';
import { useEditor, type Tool } from '../store/editor';
import { Icon } from './Icons';

const ARROW_ICONS = { pass: Icon.pass, run: Icon.run, carry: Icon.carry, press: Icon.press, lofted: Icon.lofted, block: Icon.block, shot: Icon.shot };

export function Toolbar() {
  const { t } = useTranslation();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const equipmentItem = useEditor((s) => s.equipmentItem);
  const tapToPlace = useEditor((s) => s.tapToPlace);
  const showNames = useEditor((s) => s.showNames);
  const ghosts = useEditor((s) => s.ghosts);
  const zoneColor = useEditor((s) => s.zoneColor);
  const set = useEditor((s) => s.set);

  const btn = (id: Tool, label: string, icon: React.ReactNode, shortcut?: string) => (
    <button
      key={id}
      className={`tool ${tool === id ? 'active' : ''}`}
      onClick={() => setTool(id)}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={tool === id}
      data-testid={`tool-${id}`}
    >
      {icon}
    </button>
  );

  return (
    <nav className="toolbar" aria-label={t('editor:tools.label')}>
      {btn('select', t('editor:tools.select'), <Icon.select />, 'V')}
      {btn('player_home', t('editor:tools.playerHome'), <Icon.playerHome />)}
      {btn('player_away', t('editor:tools.playerAway'), <Icon.playerAway />)}
      {btn('ball', t('editor:tools.ball'), <Icon.ball />)}
      <div className="sep" />
      {ARROW_STYLES.map((s, i) => {
        const I = ARROW_ICONS[s];
        return btn(`arrow_${s}`, t(`editor:arrows.${s}`), <I />, String(i + 1));
      })}
      <div className="sep" />
      {btn('zone_rect', t('editor:tools.zoneRect'), <Icon.zoneRect style={{ color: zoneColor }} />)}
      {btn('zone_ellipse', t('editor:tools.zoneEllipse'), <Icon.zoneEllipse style={{ color: zoneColor }} />)}
      {btn('line', t('editor:tools.line'), <Icon.line />)}
      {btn('text', t('editor:tools.text'), <Icon.text />)}
      {btn('equipment', `${t('editor:tools.equipment')}: ${t(`editor:equipment.${equipmentItem}`)}`, <Icon.cone />)}
      {tool === 'equipment' && (
        <select
          className="tool-select"
          value={equipmentItem}
          aria-label={t('editor:tools.equipment')}
          onChange={(e) => set({ equipmentItem: e.target.value as EquipmentItem })}
        >
          {EQUIPMENT_ITEMS.map((it) => (
            <option key={it} value={it}>
              {t(`editor:equipment.${it}`)}
            </option>
          ))}
        </select>
      )}
      {(tool === 'zone_rect' || tool === 'zone_ellipse') && (
        <input type="color" className="tool-color" value={zoneColor} aria-label={t('editor:props.color')} onChange={(e) => set({ zoneColor: e.target.value.toUpperCase() })} />
      )}
      <div className="sep" />
      <button className={`tool ${tapToPlace ? 'active' : ''}`} onClick={() => set({ tapToPlace: !tapToPlace })} title={t('editor:tools.tapToPlace')} aria-label={t('editor:tools.tapToPlace')} aria-pressed={tapToPlace}>
        <Icon.tap />
      </button>
      <button className={`tool ${showNames ? 'active' : ''}`} onClick={() => set({ showNames: !showNames })} title={t('editor:tools.names')} aria-label={t('editor:tools.names')} aria-pressed={showNames}>
        <Icon.names />
      </button>
      <button className={`tool ${ghosts ? 'active' : ''}`} onClick={() => set({ ghosts: !ghosts })} title={t('editor:tools.ghosts')} aria-label={t('editor:tools.ghosts')} aria-pressed={ghosts}>
        <Icon.ghost />
      </button>
    </nav>
  );
}

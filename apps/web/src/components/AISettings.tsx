import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PROVIDER_PRESETS, type ModelInfo, type ProviderConfig } from '@diagonale/ai';
import { newId } from '@diagonale/core';
import { loadApiKey, providerFor, saveApiKey, useAIConfig } from '../lib/aiConfig';
import { Icon } from './Icons';

function ProviderForm({ cfg, onSave, onCancel }: { cfg: ProviderConfig; onSave: (c: ProviderConfig, key: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const ai = useAIConfig((s) => s.config);
  const [c, setC] = useState(cfg);
  const [key, setKey] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const realKey = async () => key ?? (await loadApiKey(c.apiKeyRef)) ?? '';

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const k = await realKey();
      await saveApiKey(c.apiKeyRef, k);
      const p = await providerFor(c, ai);
      if (p.listModels) {
        const list = await p.listModels();
        setModels(list);
        setStatus({ ok: true, msg: t('ai:settings.testOk', { count: list.length }) });
      } else setStatus({ ok: true, msg: t('ai:settings.testOkSimple') });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack provider-form">
      <label className="field">
        <span>{t('ai:settings.name')}</span>
        <input value={c.label ?? ''} onChange={(e) => setC({ ...c, label: e.target.value })} />
      </label>
      {c.kind !== 'anthropic' && (
        <label className="field">
          <span>{t('ai:settings.baseUrl')}</span>
          <input value={c.baseUrl ?? ''} placeholder="https://…/v1" onChange={(e) => setC({ ...c, baseUrl: e.target.value || undefined })} />
        </label>
      )}
      <label className="field">
        <span>{t('ai:settings.apiKey')}</span>
        <input type="password" autoComplete="off" value={key ?? ''} placeholder={t('ai:settings.apiKeyPlaceholder')} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('ai:settings.model')}</span>
        <input list={`models-${c.id}`} value={c.defaultModel} onChange={(e) => setC({ ...c, defaultModel: e.target.value })} />
        <datalist id={`models-${c.id}`}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
      </label>
      <label className="check">
        <input type="checkbox" checked={c.capabilities?.tools !== false} onChange={(e) => setC({ ...c, capabilities: { ...c.capabilities, tools: e.target.checked } })} />
        {t('ai:settings.tools')}
      </label>
      {status && <p className={status.ok ? 'ok' : 'err'}>{status.msg}</p>}
      <div className="row-inline">
        <button className="btn" disabled={busy} onClick={() => void test()}>
          {t('ai:settings.test')}
        </button>
        <span className="grow" />
        <button className="btn ghost" onClick={onCancel}>
          {t('common:actions.cancel')}
        </button>
        <button
          className="btn primary"
          onClick={async () => onSave(c, await realKey())}
          data-testid="save-provider"
        >
          {t('common:actions.save')}
        </button>
      </div>
    </div>
  );
}

export function AISettings() {
  const { t } = useTranslation();
  const ai = useAIConfig((s) => s.config);
  const save = useAIConfig((s) => s.save);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [preset, setPreset] = useState(PROVIDER_PRESETS[0]!.id);

  const add = () => {
    const p = PROVIDER_PRESETS.find((x) => x.id === preset)!;
    const id = newId('prov_');
    setEditing({ id, kind: p.kind, label: p.label, baseUrl: p.baseUrl, apiKeyRef: id, defaultModel: p.defaultModel });
  };

  const onSave = async (c: ProviderConfig, key: string) => {
    await saveApiKey(c.apiKeyRef, key);
    const exists = ai.providers.some((p) => p.id === c.id);
    const providers = exists ? ai.providers.map((p) => (p.id === c.id ? c : p)) : [...ai.providers, c];
    await save({ ...ai, providers, activeProviderId: ai.activeProviderId || c.id });
    setEditing(null);
  };

  return (
    <div className="stack">
      <p className="hint">{t('ai:settings.byok')}</p>
      {ai.providers.length > 0 && (
        <ul className="list">
          {ai.providers.map((p) => (
            <li key={p.id}>
              <input
                type="radio"
                name="active-provider"
                checked={ai.activeProviderId === p.id}
                onChange={() => void save({ ...ai, activeProviderId: p.id })}
                aria-label={t('ai:settings.active')}
              />
              <span className="grow">
                <b>{p.label ?? p.kind}</b> <small>{p.defaultModel}</small>
              </span>
              <button className="btn small" onClick={() => setEditing(p)}>
                {t('common:actions.edit')}
              </button>
              <button
                className="icon-btn"
                aria-label={t('common:actions.delete')}
                onClick={() => void save({ ...ai, providers: ai.providers.filter((x) => x.id !== p.id), activeProviderId: ai.activeProviderId === p.id ? '' : ai.activeProviderId })}
              >
                <Icon.trash />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ProviderForm cfg={editing} onSave={(c, k) => void onSave(c, k)} onCancel={() => setEditing(null)} />
      ) : (
        <div className="row-inline">
          <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label={t('ai:settings.preset')}>
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={add} data-testid="add-provider">
            <Icon.plus /> {t('ai:settings.add')}
          </button>
        </div>
      )}
      <hr />
      <label className="field">
        <span>{t('ai:settings.transport')}</span>
        <select value={ai.transport} onChange={(e) => void save({ ...ai, transport: e.target.value as 'direct' | 'proxy' })}>
          <option value="direct">{t('ai:settings.direct')}</option>
          <option value="proxy">{t('ai:settings.proxy')}</option>
        </select>
      </label>
      {ai.transport === 'proxy' && (
        <label className="field">
          <span>{t('ai:settings.proxyUrl')}</span>
          <input value={ai.proxyUrl ?? ''} placeholder="https://<project>.supabase.co/functions/v1/ai-proxy" onChange={(e) => void save({ ...ai, proxyUrl: e.target.value })} />
        </label>
      )}
      <p className="hint">{t('ai:settings.localHint')}</p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { citizenAvatars, DEFAULT_AVATAR, avatarFor } from '../map/citizenAvatars.js';
import { MODEL_GROUPS, MODEL_KEYS, modelLabel, EFFORT_KEYS, effortOptions, effortLabel } from '../lib/models.js';
import IsoPerson from './IsoPerson.jsx';
const BLANK = { name: '', job: '', icon: DEFAULT_AVATAR, description: '', defaultModel: 'sonnet', effort: 'auto', opensInVSCode: false, prompt: '' };

// Modal editor/creator for a Person's manifest.json + prompt.md. Reachable from
// the PersonPicker. The People library is SHARED across cities, so an edit (or a
// delete) affects every roster that includes the citizen and every future run —
// hence the warning banner and the confirm-gated actions. `createMode` switches
// to creating a brand-new citizen (with an id field) instead of editing.
export default function PersonEditor({ personId, createMode = false, cityName = null, onClose, onSaved, onCreated, onDeleted }) {
  const [form, setForm] = useState(createMode ? BLANK : null); // null until loaded
  const [newId, setNewId] = useState('');
  const [addToCity, setAddToCity] = useState(!!cityName);
  const [loadError, setLoadError] = useState(null);
  const [mcpsText, setMcpsText] = useState('[]');
  const [confirming, setConfirming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Load the doc when editing an existing citizen (skip in create mode).
  useEffect(() => {
    if (createMode) return undefined;
    let live = true;
    setForm(null);
    setLoadError(null);
    setConfirming(false);
    setConfirmDelete(false);
    setSaveError(null);
    api.getPerson(personId)
      .then((doc) => {
        if (!live) return;
        const m = doc.manifest || {};
        const mdl = MODEL_KEYS.includes(m.defaultModel) ? m.defaultModel : 'sonnet';
        // Clamp a stored effort to what the model supports (mirrors the on-change
        // clamp) so a hand-edited unsupported combo can't be re-saved from the UI.
        const eff = EFFORT_KEYS.includes(m.effort) && effortOptions(mdl).includes(m.effort) ? m.effort : 'auto';
        setForm({
          name: m.name ?? '', job: m.job ?? '', icon: citizenAvatars.some((a) => a.key === m.icon) ? m.icon : DEFAULT_AVATAR,
          description: m.description ?? '', defaultModel: mdl, effort: eff,
          opensInVSCode: !!m.opensInVSCode, prompt: doc.prompt ?? '',
        });
        setMcpsText(JSON.stringify(m.mcps ?? [], null, 2));
      })
      .catch((e) => { if (live) setLoadError(e.message); });
    return () => { live = false; };
  }, [personId, createMode]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Move focus into the dialog, trap Tab, restore focus on close.
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setConfirming(false);
    setConfirmDelete(false);
    setSaveError(null);
  };

  const save = async () => {
    let mcps;
    try {
      mcps = JSON.parse(mcpsText);
      if (!Array.isArray(mcps)) throw new Error('MCPs must be a JSON array');
    } catch (e) {
      setSaveError(`MCPs: ${e.message}`);
      setConfirming(false);
      return;
    }
    const manifest = {
      name: form.name, job: form.job, icon: form.icon, description: form.description,
      defaultModel: form.defaultModel, effort: form.effort, opensInVSCode: form.opensInVSCode, mcps,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (createMode) {
        await api.createPerson({ id: newId.trim(), manifest, prompt: form.prompt });
        onCreated?.(newId.trim(), addToCity && !!cityName);
      } else {
        await api.savePerson(personId, { manifest, prompt: form.prompt });
        onSaved?.();
      }
      onClose();
    } catch (e) {
      setSaveError(e.message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setSaveError(null);
    try {
      await api.deletePerson(personId);
      onDeleted?.(personId);
      onClose();
    } catch (e) {
      setSaveError(e.message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;
  const canCreate = newId.trim() && form?.name.trim() && form?.job.trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal person-editor" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Edit citizen" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span>{createMode ? 'New citizen' : `Edit citizen — ${personId}`}</span>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">✕</button>
        </header>

        <div className="modal-warn">
          {createMode ? (
            <>⚠ New citizens join the <strong>shared</strong> People library — add them to a city's roster (Config) to use them.</>
          ) : (
            <>⚠ This citizen is shared across every city that rosters them. Saving changes <strong>every future run</strong>; deleting removes them from <strong>all rosters</strong>.</>
          )}
        </div>

        {loadError && <div className="error">Failed to load: {loadError}</div>}

        {!form && !loadError && <div className="modal-body">Loading…</div>}

        {form && (
          <div className="modal-body">
            {createMode && (
              <label className="field">
                <span>Citizen id (slug)</span>
                <input value={newId} placeholder="e.g. data-analyst"
                  onChange={(e) => { setNewId(e.target.value); setSaveError(null); }} />
              </label>
            )}
            {createMode && cityName && (
              <label className="field-check">
                <input type="checkbox" checked={addToCity} onChange={(e) => setAddToCity(e.target.checked)} />
                <span>Add to {cityName}&apos;s roster now</span>
              </label>
            )}
            <label className="field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label className="field">
              <span>Job</span>
              <input value={form.job} onChange={(e) => set('job', e.target.value)} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Avatar</span>
                <div className="config-graphic">
                  <span className="avatar-preview"><IsoPerson avatar={avatarFor(form.icon)} scale={0.85} /></span>
                  <select className="config-graphic-select" value={citizenAvatars.some((a) => a.key === form.icon) ? form.icon : DEFAULT_AVATAR} onChange={(e) => set('icon', e.target.value)}>
                    {citizenAvatars.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
              </label>
              <label className="field">
                <span>Default model</span>
                <select
                  value={form.defaultModel}
                  onChange={(e) => {
                    const m = e.target.value;
                    // Reset effort to Auto if the new model doesn't support the current level.
                    setForm((f) => ({ ...f, defaultModel: m, effort: effortOptions(m).includes(f.effort) ? f.effort : 'auto' }));
                  }}
                >
                  <option value="auto">Auto (pick per task)</option>
                  {MODEL_GROUPS.map((g) => (
                    <optgroup key={g.family} label={g.label}>
                      {g.options.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Effort</span>
              <select value={form.effort} onChange={(e) => set('effort', e.target.value)}>
                {effortOptions(form.defaultModel).map((k) => <option key={k} value={k}>{effortLabel(k)}</option>)}
              </select>
              <small className="field-hint">
                {effortOptions(form.defaultModel).length > 1
                  ? 'Higher effort = deeper reasoning + more tokens. Auto uses the model’s default.'
                  : 'This model doesn’t support an effort setting.'}
              </small>
            </label>
            <label className="field">
              <span>Description</span>
              <input value={form.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            <label className="field-check">
              <input type="checkbox" checked={form.opensInVSCode} onChange={(e) => set('opensInVSCode', e.target.checked)} />
              <span>Opens in VS Code</span>
            </label>
            <label className="field">
              <span>MCPs (JSON array)</span>
              <textarea className="mono" rows={3} value={mcpsText}
                onChange={(e) => { setMcpsText(e.target.value); setConfirming(false); setSaveError(null); }} />
            </label>
            <label className="field">
              <span>Prompt (prompt.md)</span>
              <textarea className="mono prompt-area" rows={12} value={form.prompt}
                onChange={(e) => set('prompt', e.target.value)} />
            </label>
          </div>
        )}

        {saveError && <div className="error">{saveError}</div>}

        {form && (
          <footer className="modal-foot">
            {createMode ? (
              <>
                <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="primary" onClick={save} disabled={busy || !canCreate}>{saving ? 'Creating…' : 'Create citizen'}</button>
              </>
            ) : confirming ? (
              <>
                <span className="confirm-msg">Save — changes every future run for {form.name || personId}?</span>
                <button className="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                <button className="primary" onClick={save} disabled={busy}>{saving ? 'Saving…' : 'Confirm save'}</button>
              </>
            ) : confirmDelete ? (
              <>
                <span className="confirm-msg">Delete {form.name || personId} and remove from all rosters?</span>
                <button className="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</button>
                <button className="danger" onClick={doDelete} disabled={busy}>{deleting ? 'Deleting…' : 'Confirm delete'}</button>
              </>
            ) : (
              <>
                <button className="danger del-left" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</button>
                <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
                <button className="primary" onClick={() => setConfirming(true)} disabled={busy}>Save changes</button>
              </>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

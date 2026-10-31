import { useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import { ENTITIES } from '../entityConfig.js';
import { hueOf } from '../colors.js';
import Icon from '../icons.jsx';
import PageHeader from '../components/PageHeader.jsx';

export function DayPicker({ days, value, onChange }) {
  const selected = value ? value.split(',') : [];
  const toggle = (d) => {
    const next = selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d];
    onChange(days.filter((x) => next.includes(x)).join(','));
  };
  return (
    <div className="days">
      {days.map((d) => (
        <label key={d} className={`chip-toggle ${selected.includes(d) ? 'on' : ''}`}>
          <input type="checkbox" checked={selected.includes(d)} onChange={() => toggle(d)} />
          {d.slice(0, 3)}
        </label>
      ))}
    </div>
  );
}

function EntityForm({ resource, cfg, item, days, onClose, onSaved }) {
  const blank = Object.fromEntries(cfg.fields.map((f) => [f.key, f.type === 'select' ? f.options[0] : '']));
  const [form, setForm] = useState({ ...blank, ...(item || {}) });
  const [error, setError] = useState('');
  const setField = (k, v) => setForm({ ...form, [k]: v });

  async function submit(e) {
    e.preventDefault();
    try {
      if (item) await api(`/${resource}/${item.id}`, 'PUT', form);
      else await api(`/${resource}`, 'POST', form);
      onSaved(item ? `${cfg.single} updated and saved to Excel` : `${cfg.single} added and saved to Excel`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal wide-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-badge"><Icon name={cfg.icon} /></div>
        <h2>{item ? 'Edit' : 'Add'} {cfg.single.toLowerCase()}</h2>
        <div className="form-grid">
          {cfg.fields.map((f) => (
            <label key={f.key} className={f.type === 'days' ? 'full' : ''}>
              {f.label}
              {f.type === 'days' ? (
                <DayPicker days={days} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
              ) : f.type === 'select' ? (
                <select value={form[f.key]} onChange={(e) => setField(f.key, e.target.value)}>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  min={f.type === 'number' ? 0 : undefined}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  autoFocus={f.key === 'name'}
                />
              )}
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="btn primary">{item ? 'Save changes' : `Add ${cfg.single.toLowerCase()}`}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

const tone = (c) => (c === 'Lab' ? 'ok' : c === 'Theory' ? 'primary' : /^(Leave|Closed):/.test(c) ? 'warn' : '');

export default function EntityPage({ resource, data, reload }) {
  const cfg = ENTITIES[resource];
  const items = data[resource];
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | {item?}
  const [error, setError] = useState('');

  const totalSlots = data.config.days.length * data.config.periods.length;
  const q = query.trim().toLowerCase();
  const filtered = items.filter((it) => !q || `${it.name} ${cfg.subtitle(it)}`.toLowerCase().includes(q));

  async function remove(it) {
    if (!window.confirm(`Delete "${it.name}"?`)) return;
    try {
      await api(`/${resource}/${it.id}`, 'DELETE');
      setError('');
      toast(`${cfg.single} deleted`, 'ok');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <PageHeader title={cfg.title} subtitle={`${items.length} in total · ${cfg.blurb}`}>
        <div className="search-box"><Icon name="search" size={16} /><input placeholder={`Search ${cfg.title.toLowerCase()}...`} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={16} />Add {cfg.single.toLowerCase()}</button>
      </PageHeader>
      {error && <p className="notice bad"><Icon name="warn" size={16} />{error}</p>}

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <span className="empty-icon"><Icon name={cfg.icon} size={30} /></span>
          <h3>{items.length ? 'No matches' : `No ${cfg.title.toLowerCase()} yet`}</h3>
          <p className="muted">{items.length ? 'Try a different search.' : `Click "Add ${cfg.single.toLowerCase()}" to create the first one.`}</p>
        </div>
      ) : (
        <div className="cards">
          {filtered.map((it, i) => {
            const count = data.slots.filter((s) => s[cfg.slotKey] === it.id).length;
            const bar = cfg.bar ? cfg.bar(it, count, { totalSlots }) : null;
            const pct = bar ? Math.min(100, (bar.value / bar.max) * 100) : 0;
            return (
              <article key={it.id} className="ecard" style={{ '--i': i, '--h': hueOf(it.name) }}>
                <div className="ecard-top">
                  <div className="avatar">{it.name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').slice(0, 2).toUpperCase()}</div>
                  <div><h4>{it.name}</h4><span className="muted small">{cfg.subtitle(it)}</span></div>
                </div>
                <div className="chips">
                  {cfg.chips(it).map((c) => <span key={c} className={`chip ${tone(c)}`}>{c}</span>)}
                  <span className="chip accent">{count} lecture{count === 1 ? '' : 's'}</span>
                </div>
                {bar && (
                  <div className="bar-row">
                    <div className="bar-top"><span>{bar.label}</span></div>
                    <div className="bar"><i className={pct >= 100 ? 'over' : ''} style={{ width: `${Math.max(pct, 3)}%` }} /></div>
                  </div>
                )}
                <div className="ecard-actions">
                  <button className="btn ghost sm" onClick={() => setEditing({ item: it })}><Icon name="edit" size={14} />Edit</button>
                  <button className="btn danger-soft sm" onClick={() => remove(it)}><Icon name="trash" size={14} />Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <EntityForm
          resource={resource} cfg={cfg} item={editing.item} days={data.config.days}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg, 'ok'); reload(); }}
        />
      )}
    </div>
  );
}

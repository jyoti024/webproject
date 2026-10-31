import { useState, useEffect } from 'react';
import { api } from '../api.js';
import Icon from '../icons.jsx';

function Select({ label, value, onChange, items }) {
  return (
    <label>
      {label}
      <select value={value} onChange={onChange} required>
        <option value="">Select...</option>
        {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </label>
  );
}

export default function SlotModal({ data, editing, defaults, onClose, onSaved }) {
  const { day, period, slot } = editing;
  const [form, setForm] = useState({
    classId: slot?.classId || defaults.classId || '',
    subjectId: slot?.subjectId || '',
    teacherId: slot?.teacherId || defaults.teacherId || '',
    roomId: slot?.roomId || defaults.roomId || '',
  });
  const [error, setError] = useState('');
  const [check, setCheck] = useState({ error: null, warnings: [] });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Ask the server for errors / warnings before the admin presses Save.
  useEffect(() => {
    const ready = form.classId && form.subjectId && form.teacherId && form.roomId;
    if (!ready) { setCheck({ error: null, warnings: [] }); return; }
    let cancelled = false;
    api('/slots/check', 'POST', { day, period, ...form, id: slot?.id })
      .then((r) => { if (!cancelled) setCheck(r); })
      .catch((e) => { if (!cancelled) setCheck({ error: e.message, warnings: [] }); });
    return () => { cancelled = true; };
  }, [form, day, period, slot]);

  async function save(e) {
    e.preventDefault();
    try {
      const body = { day, period, ...form };
      if (slot) await api(`/slots/${slot.id}`, 'PUT', body);
      else await api('/slots', 'POST', body);
      onSaved(slot ? 'Lecture updated and saved to Excel' : 'Lecture added and saved to Excel');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    try {
      await api(`/slots/${slot.id}`, 'DELETE');
      onSaved('Lecture removed');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-badge"><Icon name="calendar" /></div>
        <h2>{slot ? 'Edit' : 'Add'} lecture</h2>
        <p className="muted">{day} · Period {period}</p>
        <Select label="Class" value={form.classId} onChange={set('classId')} items={data.classes} />
        <Select label="Subject" value={form.subjectId} onChange={set('subjectId')} items={data.subjects} />
        <Select label="Teacher" value={form.teacherId} onChange={set('teacherId')} items={data.teachers} />
        <Select label="Room" value={form.roomId} onChange={set('roomId')} items={data.rooms} />

        {check.error && <p className="notice bad"><Icon name="warn" size={16} />{check.error}</p>}
        {!check.error && check.warnings.map((w, i) => <p key={i} className="notice warn"><Icon name="warn" size={16} />{w}</p>)}
        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="btn primary" disabled={!!check.error}>Save</button>
          {slot && <button type="button" className="btn danger-soft" onClick={remove}>Delete</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

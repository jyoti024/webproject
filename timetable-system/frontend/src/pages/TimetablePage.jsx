import { useState, useEffect } from 'react';
import SlotModal from '../components/SlotModal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../icons.jsx';
import { toast } from '../toast.js';
import { VIEWS, makeNameOf, cellLines, nowInfo, sameName } from '../timetableUtils.js';
import { subjectHue } from '../colors.js';
import { exportTimetablePdf } from '../exportPdf.js';

export default function TimetablePage({ data, user, reload }) {
  const admin = user.role === 'admin';
  // start on the account's own class / teacher
  const startType = user.linkedType === 'teacher' ? 'teacher' : 'class';
  const [type, setType] = useState(startType);
  const [entityId, setEntityId] = useState('');
  const [editing, setEditing] = useState(null); // {day, period, slot?}

  const view = VIEWS[type];
  const entities = data[view.list];
  const entity = entities.find((e) => e.id === entityId);
  const nameOf = makeNameOf(data);
  const { day: today, periodNo } = nowInfo(data.config);

  useEffect(() => {
    if (!entities.some((e) => e.id === entityId)) {
      const own = user.linkedType === type ? entities.find((e) => sameName(e.name, user.linkedName)) : null;
      setEntityId((own || entities[0])?.id || '');
    }
  }, [type, entities, entityId, user]);

  const slotAt = (day, period) =>
    data.slots.find((s) => s.day === day && s.period === period && s[view.key] === entityId);

  const shown = data.slots.filter((s) => s[view.key] === entityId);
  const legend = [...new Set(shown.map((s) => s.subjectId))];

  const safe = (t) => t.replace(/[^a-z0-9]+/gi, '_');
  const downloadOne = () =>
    entity && exportTimetablePdf(data, type, [entity], `timetable_${type}_${safe(entity.name)}.pdf`);
  const downloadAll = () => exportTimetablePdf(data, type, entities, `timetable_all_${view.list}.pdf`);

  return (
    <div className="page">
      <PageHeader
        title="Timetable"
        subtitle={admin ? 'Click any cell to add, edit or remove a lecture' : 'Weekly schedule by class, teacher or room'}
      >
        <button className="btn ghost" onClick={downloadOne} disabled={!entity}><Icon name="download" size={16} />PDF</button>
        <button className="btn ghost" onClick={downloadAll} disabled={!entities.length}><Icon name="download" size={16} />All {view.list}</button>
        <button className="btn ghost" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>
      </PageHeader>

      <div className="toolbar">
        <div className="seg">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{v.label}-wise</button>
          ))}
        </div>
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          {entities.length === 0 && <option value="">No {view.label.toLowerCase()}s yet</option>}
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {entity && <h2 className="print-title">{view.label} timetable: {entity.name}</h2>}

      <div className="card tt-card">
        <div className="scroll-x">
          <table className="tt">
            <thead>
              <tr>
                <th>Day</th>
                {data.config.periods.map((p) => (
                  <th key={p.no} className={p.no === periodNo ? 'now' : ''}>P{p.no}<small>{p.time}</small></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.config.days.map((day) => (
                <tr key={day} className={day === today ? 'today-row' : ''}>
                  <th>{day}{day === today && <em>today</em>}</th>
                  {data.config.periods.map((p) => {
                    const s = slotAt(day, p.no);
                    const lines = s ? cellLines(s, type, nameOf) : [];
                    const live = day === today && p.no === periodNo;
                    return (
                      <td
                        key={p.no}
                        className={`${s ? 'filled' : 'empty'} ${admin ? 'clickable' : ''} ${live ? 'live' : ''}`}
                        style={s ? { '--h': subjectHue(data, s.subjectId) } : undefined}
                        onClick={() => admin && entityId && setEditing({ day, period: p.no, slot: s })}
                      >
                        {s
                          ? lines.map((l, i) => (i === 0 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>))
                          : admin ? <i><Icon name="plus" size={18} /></i> : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {legend.length > 0 && (
          <div className="legend">
            {legend.map((id) => (
              <span key={id} className="legend-item" style={{ '--h': subjectHue(data, id) }}><i />{nameOf('subjects', id)}</span>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <SlotModal
          data={data}
          editing={editing}
          defaults={{ [view.key]: entityId }}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); toast(msg, 'ok'); reload(); }}
        />
      )}
    </div>
  );
}

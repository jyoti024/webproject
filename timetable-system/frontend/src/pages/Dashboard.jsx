import { useState, useEffect, useMemo } from 'react';
import Icon from '../icons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../api.js';
import { toast } from '../toast.js';
import { nowInfo, makeNameOf, nextSlot, sameName } from '../timetableUtils.js';
import { subjectHue } from '../colors.js';

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Stat({ icon, value, label, of }) {
  return (
    <div className="stat">
      <div className="stat-top"><Icon name={icon} size={24} />{of !== undefined && <small>of {of}</small>}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function WeekBars({ days, counts }) {
  const max = Math.max(4, ...counts);
  const W = 640, H = 190, left = 34, top = 28;
  const bw = (W - left - 10) / counts.length;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i));
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="wbars" role="img" aria-label="Lectures per day">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b6cff" /><stop offset="100%" stopColor="#e8408a" />
        </linearGradient>
      </defs>
      {ticks.map((t) => {
        const y = top + (H - top) * (1 - t / max);
        return (
          <g key={t}>
            <line x1={left} x2={W - 6} y1={y} y2={y} className="grid-line" />
            <text x={left - 8} y={y + 4} textAnchor="end" className="axis">{t}</text>
          </g>
        );
      })}
      {counts.map((c, i) => {
        const h = (H - top) * (c / max);
        const w = bw * 0.55;
        const x = left + i * bw + (bw - w) / 2;
        return (
          <g key={days[i]}>
            <rect x={x} y={H - h} width={w} height={Math.max(h, 0)} rx="9" fill="url(#barGrad)">
              <title>{`${days[i]}: ${c} lecture${c === 1 ? '' : 's'}`}</title>
            </rect>
            {c > 0 && <text x={x + w / 2} y={H - h - 7} textAnchor="middle" className="bar-val">{c}</text>}
            <text x={x + w / 2} y={H + 20} textAnchor="middle" className="axis">{days[i].slice(0, 3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Ring({ pct, label }) {
  const r = 70, c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="ring">
      <svg viewBox="0 0 180 180">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b4cf6" /><stop offset="100%" stopColor="#e8408a" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r={r} className="ring-bg" />
        <circle cx="90" cy="90" r={r} className="ring-fg" stroke="url(#ringGrad)" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 90 90)" />
      </svg>
      <div className="ring-center"><b>{Math.round(p)}%</b><span>{label}</span></div>
    </div>
  );
}

function Bar({ label, text, pct, alt }) {
  return (
    <div className="bar-row">
      <div className="bar-top"><span>{label}</span><b>{text}</b></div>
      <div className="bar"><i className={`${alt ? 'alt' : ''} ${pct >= 100 ? 'over' : ''}`} style={{ width: `${Math.min(100, Math.max(pct, 3))}%` }} /></div>
    </div>
  );
}

export default function Dashboard({ data, user, reload }) {
  const admin = user.role === 'admin';
  const { teachers, rooms, classes, slots, config } = data;
  const now = useNow();
  const { day: today, periodNo } = nowInfo(config, now);
  const nameOf = makeNameOf(data);

  // "viewing as": a class or a teacher (defaults to the account's own link)
  const options = useMemo(
    () => [...classes.map((c) => `class:${c.id}`), ...teachers.map((t) => `teacher:${t.id}`)],
    [classes, teachers]
  );
  const linked = useMemo(() => {
    if (!user.linkedType) return '';
    const list = user.linkedType === 'class' ? classes : teachers;
    const f = list.find((x) => sameName(x.name, user.linkedName));
    return f ? `${user.linkedType}:${f.id}` : '';
  }, [user, classes, teachers]);
  const [scope, setScope] = useState('');
  useEffect(() => {
    if (!scope || !options.includes(scope)) setScope(linked || options[0] || '');
  }, [scope, options, linked]);

  const [scopeType, scopeId] = scope.split(':');
  const key = scopeType === 'teacher' ? 'teacherId' : 'classId';
  const scoped = scope ? slots.filter((s) => s[key] === scopeId) : [];
  const scopeEntity = (scopeType === 'teacher' ? teachers : classes).find((x) => x.id === scopeId);

  const totalSlots = config.days.length * config.periods.length;
  const weekSlots = admin ? slots : scoped;
  const counts = config.days.map((d) => weekSlots.filter((s) => s.day === d).length);

  let fill;
  if (admin) fill = { pct: (slots.length / (totalSlots * Math.max(classes.length, 1))) * 100, caption: 'class slots filled' };
  else if (scopeType === 'teacher') {
    const cap = Number(scopeEntity?.maxPerWeek) || totalSlots;
    fill = { pct: (scoped.length / cap) * 100, caption: Number(scopeEntity?.maxPerWeek) ? 'of weekly limit' : 'of the week' };
  } else fill = { pct: (scoped.length / totalSlots) * 100, caption: 'of the week' };

  const stats = admin
    ? [
        { icon: 'cap', value: classes.length, label: 'Classes' },
        { icon: 'users', value: teachers.length, label: 'Teachers' },
        { icon: 'building', value: rooms.length, label: 'Rooms' },
        { icon: 'calendar', value: slots.length, label: 'Lectures scheduled', of: totalSlots * Math.max(classes.length, 1) },
      ]
    : [
        { icon: 'calendar', value: scoped.length, label: 'Lectures this week' },
        { icon: 'clock', value: today ? scoped.filter((s) => s.day === today).length : 0, label: 'Lectures today' },
        { icon: 'book', value: new Set(scoped.map((s) => s.subjectId)).size, label: 'Subjects' },
        { icon: 'building', value: new Set(scoped.map((s) => s.roomId)).size, label: 'Rooms used' },
      ];

  const nxt = scope ? nextSlot(data, key, scopeId, now) : null;
  const subjectCounts = [...new Set(scoped.map((s) => s.subjectId))]
    .map((id) => ({ id, n: scoped.filter((s) => s.subjectId === id).length }))
    .sort((a, b) => b.n - a.n);

  const heat = config.days.map((d) => config.periods.map((p) => slots.filter((s) => s.day === d && s.period === p.no).length));
  const heatMax = Math.max(1, ...heat.flat());
  const teacherLoad = teachers.map((t) => ({ t, n: slots.filter((s) => s.teacherId === t.id).length })).sort((a, b) => b.n - a.n).slice(0, 6);
  const roomLoad = rooms.map((r) => ({ r, n: slots.filter((s) => s.roomId === r.id).length })).sort((a, b) => b.n - a.n).slice(0, 6);

  const empty = !classes.length && !teachers.length;
  const first = (user.name || '').split(' ')[0];

  async function loadSample() {
    try {
      const out = await api('/storage/sample', 'POST');
      toast(`Sample college loaded (${out.lectures} lectures)${out.demoUsers.length ? '. Demo logins: ' + out.demoUsers.join(', ') : ''}`, 'ok');
      reload();
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div className="page">
      <PageHeader
        title={`Welcome back, ${first}`}
        subtitle={admin ? 'Real-time timetable health, workload and room usage' : 'Your personal timetable at a glance'}
      >
        <a className="link-strong" href="#/timetable">Open timetable <Icon name="arrow" size={18} /></a>
      </PageHeader>

      {!admin && !linked && options.length > 0 && (
        <p className="notice info"><Icon name="sparkle" size={16} />Pick a class or teacher below to see their schedule.</p>
      )}

      <section className="stats">
        {stats.map((s) => <Stat key={s.label} {...s} />)}
      </section>

      {empty && (
        <section className="card onboarding">
          <div>
            <h3>{admin ? "Let's set up your college" : 'Nothing here yet'}</h3>
            {admin ? (
              <ol>
                <li>Add <a href="#/teachers">teachers</a>, <a href="#/subjects">subjects</a>, <a href="#/classes">classes</a> and <a href="#/rooms">rooms</a>.</li>
                <li>Open the <a href="#/timetable">timetable</a> and click a cell to schedule a lecture.</li>
                <li>Everything is saved to your Excel file automatically.</li>
              </ol>
            ) : <p className="muted">The admin has not added any classes yet. Check back soon.</p>}
          </div>
          {admin && <button className="btn primary" onClick={loadSample}><Icon name="sparkle" size={18} />Load sample college</button>}
        </section>
      )}

      <div className="split">
        <section className="card">
          <div className="card-head">
            <div><h3>Weekly load</h3><p className="muted small">{admin ? 'Lectures per day across the college' : `Lectures per day for ${scopeEntity?.name || '...'}`}</p></div>
          </div>
          <WeekBars days={config.days} counts={counts} />
        </section>
        <section className="card center">
          <div className="card-head"><div><h3>{admin ? 'Timetable fill' : 'Workload'}</h3><p className="muted small">{admin ? 'Share of class periods in use' : scopeEntity?.name || ''}</p></div></div>
          <Ring pct={fill.pct} label={fill.caption} />
          <p className="muted small ring-note">{admin ? `${slots.length} lectures across ${classes.length} class${classes.length === 1 ? '' : 'es'}` : `${scoped.length} lecture${scoped.length === 1 ? '' : 's'} this week`}</p>
        </section>
      </div>

      <div className="split even">
        <section className="card">
          <div className="card-head">
            <div><h3>Today's schedule</h3><p className="muted small">{today ? `${today}${periodNo ? ` · period ${periodNo} is running` : ''}` : 'Sunday - no classes'}</p></div>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {options.length === 0 && <option value="">Nothing to show</option>}
              <optgroup label="Classes">{classes.map((c) => <option key={c.id} value={`class:${c.id}`}>{c.name}</option>)}</optgroup>
              <optgroup label="Teachers">{teachers.map((t) => <option key={t.id} value={`teacher:${t.id}`}>{t.name}</option>)}</optgroup>
            </select>
          </div>

          {nxt && (
            <div className="next-card">
              <span className="eyebrow">{nxt.delta === 0 ? 'Happening now' : 'Next lecture'}</span>
              <h4>{nameOf('subjects', nxt.slot.subjectId)}</h4>
              <p>{scopeType === 'teacher' ? nameOf('classes', nxt.slot.classId) : nameOf('teachers', nxt.slot.teacherId)} · {nameOf('rooms', nxt.slot.roomId)}</p>
              <div className="next-meta"><Icon name="clock" size={16} />{nxt.when} · {nxt.time}</div>
            </div>
          )}

          {today ? (
            <ul className="today">
              {config.periods.map((p) => {
                const s = scoped.find((x) => x.day === today && x.period === p.no);
                return (
                  <li key={p.no} className={`${p.no === periodNo ? 'live' : ''} ${s ? '' : 'free'}`}>
                    <div className="t-time"><b>P{p.no}</b><small>{p.time}</small></div>
                    {s ? (
                      <div className="t-body" style={{ '--h': subjectHue(data, s.subjectId) }}>
                        <strong>{nameOf('subjects', s.subjectId)}</strong>
                        <span>{scopeType === 'teacher' ? nameOf('classes', s.classId) : nameOf('teachers', s.teacherId)} · {nameOf('rooms', s.roomId)}</span>
                      </div>
                    ) : <div className="t-body free-body">Free period</div>}
                    {p.no === periodNo && <span className="live-badge">NOW</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="muted">Enjoy your Sunday.</p>}
        </section>

        {admin ? (
          <section className="card">
            <div className="card-head"><div><h3>Campus busy-ness</h3><p className="muted small">Lectures running at the same time</p></div></div>
            <div className="heat" style={{ gridTemplateColumns: `46px repeat(${config.periods.length}, 1fr)` }}>
              <span />
              {config.periods.map((p) => <span key={p.no} className="heat-h">P{p.no}</span>)}
              {config.days.map((d, di) => (
                <HeatRow key={d} day={d} counts={heat[di]} max={heatMax} isToday={d === today} />
              ))}
            </div>
          </section>
        ) : (
          <section className="card">
            <div className="card-head"><div><h3>Subjects this week</h3><p className="muted small">How often each subject meets</p></div></div>
            {subjectCounts.length === 0 && <p className="muted">No lectures scheduled yet.</p>}
            <ul className="subj-list">
              {subjectCounts.map(({ id, n }) => (
                <li key={id} style={{ '--h': subjectHue(data, id) }}>
                  <i /><span>{nameOf('subjects', id)}</span><b>{n}×</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {admin && (
        <div className="split even">
          <section className="card">
            <div className="card-head"><div><h3>Teacher workload</h3><p className="muted small">Lectures per week vs limit</p></div></div>
            {teacherLoad.length === 0 && <p className="muted">No teachers yet.</p>}
            {teacherLoad.map(({ t, n }) => {
              const max = Number(t.maxPerWeek) || Math.max(10, teacherLoad[0].n);
              return <Bar key={t.id} label={t.name} text={`${n}${t.maxPerWeek ? ` / ${t.maxPerWeek}` : ''}`} pct={(n / max) * 100} />;
            })}
          </section>
          <section className="card">
            <div className="card-head"><div><h3>Room usage</h3><p className="muted small">Share of the week each room is booked</p></div></div>
            {roomLoad.length === 0 && <p className="muted">No rooms yet.</p>}
            {roomLoad.map(({ r, n }) => (
              <Bar key={r.id} label={`${r.name}${r.type === 'Lab' ? ' (Lab)' : ''}`} text={`${Math.round((n / totalSlots) * 100)}%`} pct={(n / totalSlots) * 100} alt />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function HeatRow({ day, counts, max, isToday }) {
  return (
    <>
      <span className={`heat-d ${isToday ? 'today' : ''}`}>{day.slice(0, 3)}</span>
      {counts.map((c, i) => (
        <span key={i} className="heat-c" style={{ '--a': c / max }} title={`${day}, P${i + 1}: ${c} lecture${c === 1 ? '' : 's'}`}>{c || ''}</span>
      ))}
    </>
  );
}

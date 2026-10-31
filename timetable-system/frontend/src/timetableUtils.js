export const VIEWS = {
  class: { label: 'Class', list: 'classes', key: 'classId' },
  teacher: { label: 'Teacher', list: 'teachers', key: 'teacherId' },
  room: { label: 'Room', list: 'rooms', key: 'roomId' },
};

export const makeNameOf = (data) => (list, id) => data[list].find((x) => x.id === id)?.name || '?';
export const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// Text lines shown in one timetable cell (first line = subject).
export function cellLines(slot, type, nameOf) {
  const lines = [nameOf('subjects', slot.subjectId)];
  if (type !== 'class') lines.push(nameOf('classes', slot.classId));
  if (type !== 'teacher') lines.push(nameOf('teachers', slot.teacherId));
  if (type !== 'room') lines.push('in ' + nameOf('rooms', slot.roomId));
  return lines;
}

const toMin = (t) => { const [h, m] = t.trim().split(':').map(Number); return h * 60 + m; };
const span = (p) => p.time.split('-').map(toMin);

// Which day / period is it right now? (null when outside college hours or on Sunday)
export function nowInfo(config, date = new Date()) {
  const day = date.getDay() === 0 ? null : config.days[(date.getDay() + 6) % 7] || null;
  const mins = date.getHours() * 60 + date.getMinutes();
  const period = config.periods.find((p) => { const [a, b] = span(p); return mins >= a && mins < b; });
  return { day, periodNo: period ? period.no : null };
}

// The lecture happening now or the next one coming up for a class / teacher / room.
export function nextSlot(data, key, entityId, now = new Date()) {
  const { days, periods } = data.config;
  const mine = data.slots.filter((s) => s[key] === entityId);
  const mins = now.getHours() * 60 + now.getMinutes();
  const todayIdx = now.getDay() === 0 ? -1 : (now.getDay() + 6) % 7;
  let best = null;
  for (const s of mine) {
    const di = days.indexOf(s.day);
    const per = periods.find((p) => p.no === s.period);
    if (di < 0 || !per) continue;
    const [start, end] = span(per);
    let offset = todayIdx < 0 ? di + 1 : di - todayIdx;
    let delta = offset * 1440 + start - mins;
    if (offset === 0 && mins >= start && mins < end) delta = 0;
    else if (delta < 0) { offset += 7; delta += 7 * 1440; }
    if (!best || delta < best.delta) {
      const when = delta === 0 ? 'Now' : offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset >= 7 ? `Next ${s.day}` : s.day;
      best = { slot: s, delta, when, time: per.time };
    }
  }
  return best;
}

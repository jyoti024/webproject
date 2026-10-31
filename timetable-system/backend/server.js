/**
 * CampusClock - College Timetable backend
 * Storage : one Excel workbook (data/timetable.xlsx) - open it in Excel any time.
 * Auth    : two roles, "user" (view) and "admin" (edit). Accounts live in the Users sheet.
 */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { randomUUID } = crypto;

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const ADMIN_USER = (process.env.ADMIN_USER || 'admin').toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'timetable.xlsx');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = [
  { no: 1, time: '09:00 - 09:50' },
  { no: 2, time: '09:50 - 10:40' },
  { no: 3, time: '10:50 - 11:40' },
  { no: 4, time: '11:40 - 12:30' },
  { no: 5, time: '13:30 - 14:20' },
  { no: 6, time: '14:20 - 15:10' },
  { no: 7, time: '15:20 - 16:10' },
  { no: 8, time: '16:10 - 17:00' },
];
const TYPES = ['Theory', 'Lab'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

// ======================================================================
//  In-memory state (mirrors the Excel file)
// ======================================================================
const empty = { teachers: [], rooms: [], classes: [], subjects: [], slots: [], users: [] };
const db = structuredClone(empty);
const replaceDb = (next) => { for (const k of Object.keys(empty)) db[k] = next[k]; };
let lastSaved = null;

// ======================================================================
//  Passwords
// ======================================================================
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(String(pw), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ======================================================================
//  Small helpers
// ======================================================================
const matchDay = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return DAYS.find((d) => s.length >= 3 && d.toLowerCase().startsWith(s.slice(0, 3))) || null;
};
const normalizeDays = (v) => {
  const picked = String(v || '').split(/[,;/]+/).map(matchDay).filter(Boolean);
  return DAYS.filter((d) => picked.includes(d)).join(',');
};
const splitDays = (v) => (v ? String(v).split(',').map((d) => d.trim()).filter(Boolean) : []);
const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const nameOf = (state, list, id) => (state[list].find((x) => x.id === id) || {}).name || '';
const hslToHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((x) => Math.round(255 * x).toString(16).padStart(2, '0')).join('').toUpperCase();
};

// ======================================================================
//  Excel layout
// ======================================================================
const NUMERIC = new Set(['maxPerDay', 'maxPerWeek', 'strength', 'capacity', 'availableFrom', 'availableTo']);
const SHEETS = {
  teachers: {
    sheet: 'Teachers', widths: [26, 18, 28, 14, 14, 22],
    cols: [['name', 'Name'], ['department', 'Department'], ['email', 'Email'], ['maxPerDay', 'Max Per Day'], ['maxPerWeek', 'Max Per Week'], ['unavailableDays', 'Unavailable Days']],
  },
  subjects: {
    sheet: 'Subjects', widths: [28, 14, 12],
    cols: [['name', 'Name'], ['code', 'Code'], ['type', 'Type']],
  },
  classes: {
    sheet: 'Classes', widths: [18, 12, 12],
    cols: [['name', 'Name'], ['semester', 'Semester'], ['strength', 'Strength']],
  },
  rooms: {
    sheet: 'Rooms', widths: [20, 12, 12, 16, 14, 22],
    cols: [['name', 'Name'], ['capacity', 'Capacity'], ['type', 'Type'], ['availableFrom', 'Available From'], ['availableTo', 'Available To'], ['unavailableDays', 'Closed Days']],
  },
};
const TT_COLS = [['day', 'Day'], ['period', 'Period'], ['class', 'Class'], ['subject', 'Subject'], ['teacher', 'Teacher'], ['room', 'Room']];
const USER_COLS = [['username', 'Username'], ['name', 'Name'], ['role', 'Role'], ['linkedType', 'Linked Type'], ['linkedName', 'Linked Name'], ['passwordHash', 'Password Hash'], ['setPassword', 'Set Password']];

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    return '';
  }
  return String(v).trim();
}

// Reads a sheet into [{key: text, __row}] using the header names (column order does not matter).
function readTable(ws, cols) {
  if (!ws) return [];
  const header = {};
  for (let c = 1; c <= 25; c++) {
    const h = cellText(ws.getRow(1).getCell(c).value).toLowerCase();
    if (h) header[h] = c;
  }
  const idx = cols.map(([, label]) => header[label.toLowerCase()] || 0);
  const out = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const item = { __row: r };
    let any = false;
    cols.forEach(([key], i) => {
      let v = idx[i] ? cellText(row.getCell(idx[i]).value) : '';
      if (NUMERIC.has(key) && v !== '' && !Number.isNaN(Number(v))) v = String(Number(v));
      item[key] = v;
      if (v) any = true;
    });
    if (any) out.push(item);
  }
  return out;
}

async function readExcel() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DATA_FILE);
  const next = structuredClone(empty);
  const warnings = [];
  let changed = false;

  for (const [key, def] of Object.entries(SHEETS)) {
    const seen = new Set();
    for (const { __row, ...r } of readTable(wb.getWorksheet(def.sheet), def.cols)) {
      if (!r.name) { warnings.push(`${def.sheet} row ${__row}: no name, skipped`); continue; }
      if (seen.has(r.name.toLowerCase())) { warnings.push(`${def.sheet} row ${__row}: duplicate "${r.name}", skipped`); continue; }
      seen.add(r.name.toLowerCase());
      if ('type' in r) r.type = /^lab/i.test(r.type) ? 'Lab' : 'Theory';
      if ('unavailableDays' in r) r.unavailableDays = normalizeDays(r.unavailableDays);
      next[key].push({ id: randomUUID(), ...r });
    }
  }

  const find = (list, n) => next[list].find((x) => sameName(x.name, n));
  for (const r of readTable(wb.getWorksheet('Timetable'), TT_COLS)) {
    const slot = {
      day: matchDay(r.day), period: Number(r.period),
      classId: (find('classes', r.class) || {}).id, subjectId: (find('subjects', r.subject) || {}).id,
      teacherId: (find('teachers', r.teacher) || {}).id, roomId: (find('rooms', r.room) || {}).id,
    };
    if (!slot.day || !PERIODS.some((p) => p.no === slot.period) || !slot.classId || !slot.subjectId || !slot.teacherId || !slot.roomId) {
      warnings.push(`Timetable row ${r.__row}: unknown day, period or name - skipped`);
      continue;
    }
    const { error } = checkSlot(slot, null, next);
    if (error && /already has a lecture/.test(error)) { warnings.push(`Timetable row ${r.__row}: ${error} - skipped`); continue; }
    if (error) warnings.push(`Timetable row ${r.__row}: ${error} (kept)`);
    next.slots.push({ id: randomUUID(), ...slot });
  }

  const seenUsers = new Set();
  for (const r of readTable(wb.getWorksheet('Users'), USER_COLS)) {
    const username = r.username.toLowerCase();
    if (!username || seenUsers.has(username)) continue;
    seenUsers.add(username);
    let passwordHash = r.passwordHash;
    if (r.setPassword) { passwordHash = hashPw(r.setPassword); changed = true; }
    if (!passwordHash) { warnings.push(`Users row ${r.__row}: "${username}" has no password, skipped`); continue; }
    let linkedType = r.linkedType.toLowerCase();
    let linkedName = r.linkedName;
    const list = linkedType === 'class' ? 'classes' : linkedType === 'teacher' ? 'teachers' : null;
    const found = list && find(list, linkedName);
    if (found) linkedName = found.name; else { linkedType = ''; linkedName = ''; }
    next.users.push({
      username, name: r.name || username, role: /^admin/i.test(r.role) ? 'admin' : 'user',
      passwordHash, linkedType, linkedName,
    });
  }

  if (!next.users.some((u) => u.role === 'admin')) {
    next.users.push({ username: ADMIN_USER, name: 'Administrator', role: 'admin', passwordHash: hashPw(ADMIN_PASS), linkedType: '', linkedName: '' });
    warnings.push(`No admin found - created "${ADMIN_USER}"`);
    changed = true;
  }
  return { next, warnings, changed };
}

async function writeExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CampusClock';
  wb.created = new Date();
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B4CF6' } };
  const HEAD_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

  const addTable = (title, headers, rows, widths) => {
    const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = headers.map((h, i) => ({ header: h, key: 'c' + i, width: widths[i] || 18 }));
    rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = HEAD_FONT;
    head.fill = HEAD_FILL;
    head.height = 22;
    return ws;
  };

  for (const [key, def] of Object.entries(SHEETS)) {
    addTable(def.sheet, def.cols.map((c) => c[1]), db[key].map((it) => def.cols.map(([k]) => {
      const v = it[k] === undefined ? '' : it[k];
      return NUMERIC.has(k) && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
    })), def.widths);
  }

  const dayNo = (d) => DAYS.indexOf(d);
  const ttRows = [...db.slots]
    .sort((a, b) => dayNo(a.day) - dayNo(b.day) || a.period - b.period || nameOf(db, 'classes', a.classId).localeCompare(nameOf(db, 'classes', b.classId)))
    .map((s) => [s.day, s.period, nameOf(db, 'classes', s.classId), nameOf(db, 'subjects', s.subjectId), nameOf(db, 'teachers', s.teacherId), nameOf(db, 'rooms', s.roomId)]);
  addTable('Timetable', TT_COLS.map((c) => c[1]), ttRows, [14, 10, 18, 28, 26, 20]);

  addTable('Users', USER_COLS.map((c) => c[1]), db.users.map((u) => [u.username, u.name, u.role, u.linkedType, u.linkedName, u.passwordHash, '']), [16, 24, 10, 14, 22, 70, 18]);

  // Read-only, human friendly weekly grid for every class (ignored when the file is loaded)
  const grid = wb.addWorksheet('Weekly Grid');
  grid.getColumn(1).width = 14;
  PERIODS.forEach((p, i) => { grid.getColumn(i + 2).width = 26; });
  let r = 1;
  const subjectHue = (id) => ((db.subjects.findIndex((s) => s.id === id) * 137.508) % 360 + 360) % 360;
  for (const cls of db.classes) {
    grid.mergeCells(r, 1, r, PERIODS.length + 1);
    const title = grid.getCell(r, 1);
    title.value = `Class ${cls.name}${cls.semester ? ' - Semester ' + cls.semester : ''}`;
    title.font = { bold: true, size: 14, color: { argb: 'FF6B4CF6' } };
    r++;
    const hd = ['Day', ...PERIODS.map((p) => `P${p.no}\n${p.time}`)];
    hd.forEach((t, i) => {
      const c = grid.getCell(r, i + 1);
      c.value = t; c.font = HEAD_FONT; c.fill = HEAD_FILL;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    grid.getRow(r).height = 32;
    r++;
    for (const day of DAYS) {
      const dc = grid.getCell(r, 1);
      dc.value = day; dc.font = { bold: true }; dc.alignment = { vertical: 'middle' };
      PERIODS.forEach((p, i) => {
        const s = db.slots.find((x) => x.classId === cls.id && x.day === day && x.period === p.no);
        const c = grid.getCell(r, i + 2);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (s) {
          c.value = `${nameOf(db, 'subjects', s.subjectId)}\n${nameOf(db, 'teachers', s.teacherId)}\n${nameOf(db, 'rooms', s.roomId)}`;
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hslToHex(subjectHue(s.subjectId), 80, 90) } };
        }
      });
      grid.getRow(r).height = 62;
      r++;
    }
    r += 2;
  }

  await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await wb.xlsx.writeFile(tmp);
  try {
    await fs.promises.rename(tmp, DATA_FILE);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error(`Could not save ${path.basename(DATA_FILE)}. If it is open in Excel, close it and try again.`);
  }
  lastSaved = new Date();
}

// All writes go through one queue: apply the change, save the file, roll back if saving fails.
let queue = Promise.resolve();
function exclusive(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}
function commit(apply) {
  return exclusive(async () => {
    const snap = structuredClone(db);
    try {
      const out = apply();
      await writeExcel();
      return out;
    } catch (e) {
      replaceDb(snap);
      throw e;
    }
  });
}
const handler = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) res.status(e.status || 500).json({ error: e.message || 'Server error' });
  });

// ======================================================================
//  App + auth
// ======================================================================
const app = express();
app.use(cors());
app.use(express.json());

const publicUser = (u) => ({ username: u.username, name: u.name, role: u.role, linkedType: u.linkedType, linkedName: u.linkedName });

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.username === payload.username);
    if (!user) throw new Error('unknown user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in' });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
const signToken = (u) => jwt.sign({ username: u.username }, JWT_SECRET, { expiresIn: '8h' });

const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/i;
function linkFrom(body) {
  const type = String(body.linkedType || '').toLowerCase();
  const name = String(body.linkedName || '').trim();
  if (!type || !name) return { linkedType: '', linkedName: '' };
  const list = type === 'class' ? 'classes' : type === 'teacher' ? 'teachers' : null;
  if (!list) throw bad('Link must be a class or a teacher');
  const found = db[list].find((x) => sameName(x.name, name));
  if (!found) throw bad(`${type} "${name}" does not exist`);
  return { linkedType: type, linkedName: found.name };
}
function buildUser(body, role, usernameFromName = false) {
  const name = String(body.name || '').trim();
  const username = (usernameFromName ? name : String(body.username || '').trim()).toLowerCase();
  const password = String(body.password || '');
  if (!name) throw bad('Name is required');
  if (!usernameFromName && !USERNAME_RE.test(username)) throw bad('Username must be 3-30 letters, numbers, dot, dash or underscore');
  if (password.length < 6) throw bad('Password must be at least 6 characters');
  if (db.users.some((u) => u.username === username)) {
    throw new HttpError(409, usernameFromName ? 'An account with that full name already exists' : 'That username is already taken');
  }
  return { username, name, role, passwordHash: hashPw(password), ...linkFrom(body) };
}
const adminCount = () => db.users.filter((u) => u.role === 'admin').length;

const fails = new Map();
app.post('/api/login', handler(async (req, res) => {
  const { username = '', password = '', role = '' } = req.body || {};
  const key = String(username).trim().toLowerCase();
  const f = fails.get(key);
  if (f && f.n >= 5 && Date.now() < f.until) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.');
  const user = db.users.find((u) => u.username === key);
  if (!user || !checkPw(password, user.passwordHash)) {
    const n = (f ? f.n : 0) + 1;
    fails.set(key, { n, until: Date.now() + 60000 });
    throw new HttpError(401, 'Invalid username or password');
  }
  fails.delete(key);
  if (role === 'admin' && user.role !== 'admin') throw new HttpError(403, 'This is not an admin account. Use the User tab.');
  if (role === 'user' && user.role === 'admin') throw new HttpError(403, 'This is an admin account. Use the Admin tab.');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/api/public/options', (_req, res) =>
  res.json({ classes: db.classes.map((c) => c.name), teachers: db.teachers.map((t) => t.name) }));

app.post('/api/register', handler(async (req, res) => {
  const user = await commit(() => {
    const u = buildUser(req.body || {}, 'user', true);
    db.users.push(u);
    return u;
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

app.post('/api/me/password', auth, handler(async (req, res) => {
  const { oldPassword = '', newPassword = '' } = req.body || {};
  if (!checkPw(oldPassword, req.user.passwordHash)) throw bad('Current password is incorrect');
  if (String(newPassword).length < 6) throw bad('New password must be at least 6 characters');
  await commit(() => { req.user.passwordHash = hashPw(newPassword); });
  res.json({ ok: true });
}));

app.get('/api/config', auth, (_req, res) => res.json({ days: DAYS, periods: PERIODS }));

// ======================================================================
//  Teachers, rooms, classes, subjects
// ======================================================================
const resources = {
  teachers: { required: ['name'], fields: ['name', 'department', 'email', 'maxPerDay', 'maxPerWeek', 'unavailableDays'], numeric: ['maxPerDay', 'maxPerWeek'], usedIn: 'teacherId', label: 'teacher' },
  rooms: { required: ['name'], fields: ['name', 'capacity', 'type', 'unavailableDays', 'availableFrom', 'availableTo'], numeric: ['capacity', 'availableFrom', 'availableTo'], enums: { type: TYPES }, defaults: { type: 'Theory' }, usedIn: 'roomId', label: 'room' },
  classes: { required: ['name'], fields: ['name', 'semester', 'strength'], numeric: ['strength'], usedIn: 'classId', label: 'class' },
  subjects: { required: ['name'], fields: ['name', 'code', 'type'], enums: { type: TYPES }, defaults: { type: 'Theory' }, usedIn: 'subjectId', label: 'subject' },
};

function cleanInput(body, cfg, creating) {
  const data = {};
  for (const f of cfg.fields) {
    if (body[f] === undefined && !creating) continue;
    data[f] = body[f] === undefined || body[f] === null ? '' : String(body[f]).trim();
  }
  for (const [k, v] of Object.entries(cfg.defaults || {})) {
    if ((creating || k in data) && !data[k]) data[k] = v;
  }
  if (cfg.required.some((f) => (creating ? !data[f] : data[f] === ''))) throw bad(`${cfg.required.join(', ')} required`);
  for (const f of cfg.numeric || []) {
    if (data[f]) {
      const n = Number(data[f]);
      if (!Number.isInteger(n) || n < 0) throw bad(`${f} must be a whole number (0 or more)`);
    }
  }
  for (const [f, allowed] of Object.entries(cfg.enums || {})) {
    if (data[f] && !allowed.includes(data[f])) throw bad(`${f} must be one of: ${allowed.join(', ')}`);
  }
  if ('unavailableDays' in data) data.unavailableDays = normalizeDays(data.unavailableDays);
  for (const f of ['availableFrom', 'availableTo']) {
    if (data[f] && (Number(data[f]) < 1 || Number(data[f]) > PERIODS.length)) throw bad(`${f} must be between 1 and ${PERIODS.length}`);
  }
  if (data.availableFrom && data.availableTo && Number(data.availableFrom) > Number(data.availableTo)) throw bad('availableFrom cannot be after availableTo');
  return data;
}
const assertUnique = (key, name, ignoreId) => {
  if (db[key].some((x) => x.id !== ignoreId && sameName(x.name, name))) {
    throw new HttpError(409, `A ${resources[key].label} named "${name}" already exists`);
  }
};
const linkType = { classes: 'class', teachers: 'teacher' };

Object.entries(resources).forEach(([key, cfg]) => {
  app.get(`/api/${key}`, auth, (_req, res) => res.json(db[key]));

  app.post(`/api/${key}`, auth, adminOnly, handler(async (req, res) => {
    const item = await commit(() => {
      const data = cleanInput(req.body || {}, cfg, true);
      assertUnique(key, data.name);
      const it = { id: randomUUID(), ...data };
      db[key].push(it);
      return it;
    });
    res.status(201).json(item);
  }));

  app.put(`/api/${key}/:id`, auth, adminOnly, handler(async (req, res) => {
    const item = await commit(() => {
      const it = db[key].find((x) => x.id === req.params.id);
      if (!it) throw new HttpError(404, 'Not found');
      const data = cleanInput(req.body || {}, cfg, false);
      if (data.name) assertUnique(key, data.name, it.id);
      const oldName = it.name;
      Object.assign(it, data);
      if (linkType[key] && data.name && data.name !== oldName) {
        db.users.forEach((u) => { if (u.linkedType === linkType[key] && sameName(u.linkedName, oldName)) u.linkedName = it.name; });
      }
      return it;
    });
    res.json(item);
  }));

  app.delete(`/api/${key}/:id`, auth, adminOnly, handler(async (req, res) => {
    await commit(() => {
      const it = db[key].find((x) => x.id === req.params.id);
      if (!it) throw new HttpError(404, 'Not found');
      if (db.slots.some((s) => s[cfg.usedIn] === it.id)) throw new HttpError(409, 'Cannot delete: it is used in the timetable. Remove those lectures first.');
      db[key] = db[key].filter((x) => x.id !== it.id);
      if (linkType[key]) db.users.forEach((u) => { if (u.linkedType === linkType[key] && sameName(u.linkedName, it.name)) { u.linkedType = ''; u.linkedName = ''; } });
    });
    res.json({ ok: true });
  }));
});

// ======================================================================
//  Timetable slots: rules + warnings
// ======================================================================
function checkSlot(slot, ignoreId, state = db) {
  const warnings = [];
  const fail = (error) => ({ error, warnings: [] });
  const { day, period, classId, subjectId, teacherId, roomId } = slot;

  if (!DAYS.includes(day)) return fail('Invalid day');
  if (!PERIODS.some((p) => p.no === period)) return fail('Invalid period');
  const cls = state.classes.find((c) => c.id === classId);
  const subject = state.subjects.find((s) => s.id === subjectId);
  const teacher = state.teachers.find((t) => t.id === teacherId);
  const room = state.rooms.find((r) => r.id === roomId);
  if (!cls) return fail('Select a valid class');
  if (!subject) return fail('Select a valid subject');
  if (!teacher) return fail('Select a valid teacher');
  if (!room) return fail('Select a valid room');

  const others = state.slots.filter((s) => s.id !== ignoreId);
  const same = others.filter((s) => s.day === day && s.period === period);
  if (same.some((s) => s.classId === classId)) return fail('This class already has a lecture in that period');
  if (same.some((s) => s.teacherId === teacherId)) return fail(`${teacher.name} is already teaching another class in that period`);
  if (same.some((s) => s.roomId === roomId)) return fail(`${room.name} is already occupied in that period`);

  if (splitDays(teacher.unavailableDays).includes(day)) return fail(`${teacher.name} is on leave / unavailable on ${day}`);

  const teacherSlots = others.filter((s) => s.teacherId === teacherId);
  const perDay = teacherSlots.filter((s) => s.day === day).length + 1;
  const perWeek = teacherSlots.length + 1;
  const maxDay = Number(teacher.maxPerDay) || 0;
  const maxWeek = Number(teacher.maxPerWeek) || 0;
  if (maxDay && perDay > maxDay) return fail(`${teacher.name} would exceed the daily limit of ${maxDay} lectures on ${day}`);
  if (maxWeek && perWeek > maxWeek) return fail(`${teacher.name} would exceed the weekly limit of ${maxWeek} lectures`);

  const subjectType = subject.type || 'Theory';
  const roomType = room.type || 'Theory';
  if (subjectType !== roomType) return fail(`${subject.name} is a ${subjectType} subject but ${room.name} is a ${roomType} room`);
  const strength = Number(cls.strength) || 0;
  const capacity = Number(room.capacity) || 0;
  if (strength && capacity && strength > capacity) return fail(`${room.name} seats ${capacity} but ${cls.name} has ${strength} students`);
  if (splitDays(room.unavailableDays).includes(day)) return fail(`${room.name} is not available on ${day}`);
  const from = Number(room.availableFrom) || 1;
  const to = Number(room.availableTo) || PERIODS.length;
  if (period < from || period > to) return fail(`${room.name} is only available in periods ${from} to ${to}`);

  if (maxDay && perDay === maxDay) warnings.push(`This is ${teacher.name}'s last allowed lecture on ${day} (limit ${maxDay})`);
  if (maxWeek && perWeek === maxWeek) warnings.push(`This reaches ${teacher.name}'s weekly limit of ${maxWeek} lectures`);
  const taken = new Set(teacherSlots.filter((s) => s.day === day).map((s) => s.period));
  taken.add(period);
  let run = 1;
  for (let p = period - 1; taken.has(p); p--) run++;
  for (let p = period + 1; taken.has(p); p++) run++;
  if (run >= 3) warnings.push(`${teacher.name} will have ${run} lectures in a row on ${day}`);
  return { error: null, warnings };
}

const slotFromBody = (b) => ({
  day: b.day, period: Number(b.period), classId: b.classId, subjectId: b.subjectId, teacherId: b.teacherId, roomId: b.roomId,
});

app.get('/api/slots', auth, (_req, res) => res.json(db.slots));

app.post('/api/slots/check', auth, adminOnly, (req, res) =>
  res.json(checkSlot(slotFromBody(req.body || {}), req.body && req.body.id)));

app.post('/api/slots', auth, adminOnly, handler(async (req, res) => {
  const out = await commit(() => {
    const slot = slotFromBody(req.body || {});
    const { error, warnings } = checkSlot(slot);
    if (error) throw new HttpError(409, error);
    const item = { id: randomUUID(), ...slot };
    db.slots.push(item);
    return { ...item, warnings };
  });
  res.status(201).json(out);
}));

app.put('/api/slots/:id', auth, adminOnly, handler(async (req, res) => {
  const out = await commit(() => {
    const item = db.slots.find((s) => s.id === req.params.id);
    if (!item) throw new HttpError(404, 'Not found');
    const slot = slotFromBody(req.body || {});
    const { error, warnings } = checkSlot(slot, item.id);
    if (error) throw new HttpError(409, error);
    Object.assign(item, slot);
    return { ...item, warnings };
  });
  res.json(out);
}));

app.delete('/api/slots/:id', auth, adminOnly, handler(async (req, res) => {
  await commit(() => {
    const before = db.slots.length;
    db.slots = db.slots.filter((s) => s.id !== req.params.id);
    if (db.slots.length === before) throw new HttpError(404, 'Not found');
  });
  res.json({ ok: true });
}));

// ======================================================================
//  User management (admin)
// ======================================================================
app.get('/api/users', auth, adminOnly, (_req, res) => res.json(db.users.map(publicUser)));

app.post('/api/users', auth, adminOnly, handler(async (req, res) => {
  const role = req.body && req.body.role === 'admin' ? 'admin' : 'user';
  const user = await commit(() => {
    const u = buildUser(req.body || {}, role);
    db.users.push(u);
    return u;
  });
  res.status(201).json(publicUser(user));
}));

app.put('/api/users/:username', auth, adminOnly, handler(async (req, res) => {
  const out = await commit(() => {
    const u = db.users.find((x) => x.username === String(req.params.username).toLowerCase());
    if (!u) throw new HttpError(404, 'User not found');
    const b = req.body || {};
    if (b.name !== undefined) { if (!String(b.name).trim()) throw bad('Name is required'); u.name = String(b.name).trim(); }
    if (b.role !== undefined) {
      const role = b.role === 'admin' ? 'admin' : 'user';
      if (u.role === 'admin' && role !== 'admin' && adminCount() <= 1) throw bad('There must be at least one admin');
      u.role = role;
    }
    if (b.linkedType !== undefined || b.linkedName !== undefined) Object.assign(u, linkFrom(b));
    if (b.password) {
      if (String(b.password).length < 6) throw bad('Password must be at least 6 characters');
      u.passwordHash = hashPw(b.password);
    }
    return publicUser(u);
  });
  res.json(out);
}));

app.delete('/api/users/:username', auth, adminOnly, handler(async (req, res) => {
  await commit(() => {
    const u = db.users.find((x) => x.username === String(req.params.username).toLowerCase());
    if (!u) throw new HttpError(404, 'User not found');
    if (u.username === req.user.username) throw bad('You cannot delete your own account');
    if (u.role === 'admin' && adminCount() <= 1) throw bad('There must be at least one admin');
    db.users = db.users.filter((x) => x !== u);
  });
  res.json({ ok: true });
}));

// ======================================================================
//  Excel storage tools
// ======================================================================
app.get('/api/storage/info', auth, (_req, res) => res.json({
  file: path.basename(DATA_FILE),
  savedAt: lastSaved ? lastSaved.toISOString() : null,
  sheets: 7,
  lectures: db.slots.length,
}));

app.get('/api/storage/download', auth, adminOnly, handler(async (_req, res) => {
  await exclusive(async () => {}); // wait for any save in progress
  res.download(DATA_FILE, path.basename(DATA_FILE));
}));

app.post('/api/storage/reload', auth, adminOnly, handler(async (req, res) => {
  const warnings = await exclusive(async () => {
    const { next, warnings: w, changed } = await readExcel();
    replaceDb(next);
    if (changed) await writeExcel();
    return w;
  });
  res.json({ ok: true, warnings, lectures: db.slots.length });
}));

function sampleData() {
  const T = [
    ['Dr. Anita Rao', 'CSE', 'anita.rao@college.edu', 4, 16, ''],
    ['Prof. Vikram Mehta', 'Mathematics', 'vikram.mehta@college.edu', 4, 16, 'Saturday'],
    ['Ms. Kavya Iyer', 'Physics', 'kavya.iyer@college.edu', 4, 14, ''],
    ['Mr. Arjun Nair', 'CSE', 'arjun.nair@college.edu', 4, 16, ''],
    ['Dr. Sana Khan', 'English', 'sana.khan@college.edu', 3, 12, ''],
  ];
  const S = [['Mathematics', 'MA101', 'Theory'], ['Data Structures', 'CS201', 'Theory'], ['DBMS', 'CS305', 'Theory'], ['Physics', 'PH102', 'Theory'], ['Physics Lab', 'PH103', 'Lab'], ['Programming Lab', 'CS202', 'Lab'], ['Communication Skills', 'EN101', 'Theory']];
  const C = [['CSE-3A', 3, 55], ['CSE-3B', 3, 52], ['CSE-5A', 5, 48]];
  const R = [['Room 101', 70, 'Theory'], ['Room 102', 60, 'Theory'], ['Room 201', 50, 'Theory'], ['Physics Lab', 60, 'Lab'], ['CS Lab', 60, 'Lab']];
  const [rao, mehta, iyer, nair, khan] = T.map((t) => t[0]);
  const L = [
    // class, day, period, subject, teacher, room
    ...[['Monday', 1, 'Mathematics', mehta, 'Room 101'], ['Monday', 2, 'Data Structures', rao, 'Room 101'], ['Monday', 3, 'DBMS', nair, 'Room 101'],
      ['Tuesday', 1, 'DBMS', nair, 'Room 101'], ['Tuesday', 2, 'Mathematics', mehta, 'Room 101'], ['Tuesday', 5, 'Programming Lab', rao, 'CS Lab'], ['Tuesday', 6, 'Programming Lab', rao, 'CS Lab'],
      ['Wednesday', 1, 'Data Structures', rao, 'Room 101'], ['Wednesday', 2, 'Physics', iyer, 'Room 101'], ['Wednesday', 3, 'Communication Skills', khan, 'Room 101'],
      ['Thursday', 1, 'Mathematics', mehta, 'Room 101'], ['Thursday', 2, 'DBMS', nair, 'Room 101'],
      ['Friday', 1, 'Physics', iyer, 'Room 101'], ['Friday', 2, 'Data Structures', rao, 'Room 101'], ['Friday', 5, 'Physics Lab', iyer, 'Physics Lab'], ['Friday', 6, 'Physics Lab', iyer, 'Physics Lab']].map((x) => ['CSE-3A', ...x]),
    ...[['Monday', 1, 'DBMS', nair, 'Room 102'], ['Monday', 2, 'Mathematics', mehta, 'Room 102'], ['Monday', 3, 'Data Structures', rao, 'Room 102'],
      ['Tuesday', 1, 'Data Structures', rao, 'Room 102'], ['Tuesday', 2, 'Physics', iyer, 'Room 102'], ['Tuesday', 3, 'Communication Skills', khan, 'Room 102'],
      ['Wednesday', 1, 'Mathematics', mehta, 'Room 102'], ['Wednesday', 2, 'DBMS', nair, 'Room 102'],
      ['Thursday', 1, 'Data Structures', rao, 'Room 102'], ['Thursday', 2, 'Mathematics', mehta, 'Room 102'],
      ['Friday', 1, 'DBMS', nair, 'Room 102'], ['Friday', 3, 'Programming Lab', rao, 'CS Lab'], ['Friday', 4, 'Programming Lab', rao, 'CS Lab']].map((x) => ['CSE-3B', ...x]),
    ...[['Monday', 1, 'Communication Skills', khan, 'Room 201'], ['Monday', 2, 'DBMS', nair, 'Room 201'], ['Tuesday', 1, 'Mathematics', mehta, 'Room 201'],
      ['Tuesday', 3, 'Data Structures', rao, 'Room 201'], ['Wednesday', 3, 'Physics', iyer, 'Room 201'], ['Thursday', 3, 'DBMS', nair, 'Room 201'],
      ['Friday', 5, 'Programming Lab', nair, 'CS Lab'], ['Friday', 6, 'Programming Lab', nair, 'CS Lab']].map((x) => ['CSE-5A', ...x]),
  ];
  return { T, S, C, R, L };
}

app.post('/api/storage/sample', auth, adminOnly, handler(async (req, res) => {
  const result = await commit(() => {
    if (db.teachers.length || db.subjects.length || db.classes.length || db.rooms.length || db.slots.length) {
      throw new HttpError(409, 'Sample data can only be loaded into an empty timetable');
    }
    const { T, S, C, R, L } = sampleData();
    T.forEach(([name, department, email, maxPerDay, maxPerWeek, unavailableDays]) => db.teachers.push({ id: randomUUID(), name, department, email, maxPerDay: String(maxPerDay), maxPerWeek: String(maxPerWeek), unavailableDays }));
    S.forEach(([name, code, type]) => db.subjects.push({ id: randomUUID(), name, code, type }));
    C.forEach(([name, semester, strength]) => db.classes.push({ id: randomUUID(), name, semester: String(semester), strength: String(strength) }));
    R.forEach(([name, capacity, type]) => db.rooms.push({ id: randomUUID(), name, capacity: String(capacity), type, availableFrom: '1', availableTo: '8', unavailableDays: '' }));
    const idOf = (list, n) => db[list].find((x) => x.name === n).id;
    let skipped = 0;
    L.forEach(([cls, day, period, subject, teacher, room]) => {
      const slot = { day, period, classId: idOf('classes', cls), subjectId: idOf('subjects', subject), teacherId: idOf('teachers', teacher), roomId: idOf('rooms', room) };
      if (checkSlot(slot).error) { skipped++; return; }
      db.slots.push({ id: randomUUID(), ...slot });
    });
    const demo = [
      { name: 'Demo Student', username: 'student', password: 'student123', linkedType: 'class', linkedName: 'CSE-3A' },
      { name: 'Demo Faculty', username: 'faculty', password: 'faculty123', linkedType: 'teacher', linkedName: 'Dr. Anita Rao' },
    ];
    const made = [];
    demo.forEach((d) => {
      if (db.users.some((u) => u.username === d.username)) return;
      db.users.push(buildUser(d, 'user'));
      made.push(`${d.username} / ${d.password}`);
    });
    return { lectures: db.slots.length, skipped, demoUsers: made };
  });
  res.json(result);
}));

// ======================================================================
//  Start
// ======================================================================
// Older versions kept data in data/db.json - bring it across the first time the Excel file is created.
function importOldJson() {
  const OLD = path.join(path.dirname(DATA_FILE), 'db.json');
  if (!fs.existsSync(OLD)) return;
  try {
    const old = JSON.parse(fs.readFileSync(OLD, 'utf8'));
    for (const k of ['teachers', 'rooms', 'classes', 'subjects']) {
      const seen = new Set();
      db[k] = (old[k] || []).filter((x) => {
        const key = String(x.name || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((x) => ({ ...x, id: x.id || randomUUID(), ...('type' in x || k === 'rooms' || k === 'subjects' ? { type: x.type === 'Lab' ? 'Lab' : 'Theory' } : {}) }));
    }
    const has = (list, id) => db[list].some((x) => x.id === id);
    db.slots = (old.slots || []).filter((s) => DAYS.includes(s.day) && has('classes', s.classId) && has('subjects', s.subjectId) && has('teachers', s.teacherId) && has('rooms', s.roomId));
    console.log(`  Imported ${db.slots.length} lectures from the old db.json`);
  } catch (e) {
    console.warn('  Could not import old db.json: ' + e.message);
  }
}

async function init() {
  if (fs.existsSync(DATA_FILE)) {
    const { next, warnings, changed } = await readExcel();
    replaceDb(next);
    warnings.forEach((w) => console.warn('  [excel] ' + w));
    if (changed) await writeExcel();
    else lastSaved = fs.statSync(DATA_FILE).mtime;
  } else {
    importOldJson();
    db.users.push({ username: ADMIN_USER, name: 'Administrator', role: 'admin', passwordHash: hashPw(ADMIN_PASS), linkedType: '', linkedName: '' });
    await writeExcel();
    console.log(`  Created ${DATA_FILE}`);
  }
  app.listen(PORT, () => {
    console.log(`Timetable API running on http://localhost:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
  });
}

const ready = init().catch((e) => {
  console.error('\nCould not start: ' + e.message);
  process.exit(1);
});
module.exports = { ready };

import { useEffect, useState } from 'react';
import { api, setToken } from '../api.js';
import Icon from '../icons.jsx';

// decorative mini-timetable on the brand panel
const PREVIEW = [
  [210, 265, 0, 150, 30], [0, 210, 330, 265, 150], [30, 0, 150, 210, 330],
  [265, 150, 30, 0, 210],
];

export default function AuthPage({ onAuth }) {
  const [role, setRole] = useState('user');        // which tab: user | admin
  const [mode, setMode] = useState('signin');      // signin | register (users only)
  const [opts, setOpts] = useState({ classes: [], teachers: [] });
  const [f, setF] = useState({ name: '', username: '', password: '', kind: 'student', linkedName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/public/options').then(setOpts).catch(() => {}); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const register = mode === 'register' && role === 'user';
  const linkList = f.kind === 'student' ? opts.classes : f.kind === 'faculty' ? opts.teachers : [];

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let out;
      if (register) {
        out = await api('/register', 'POST', {
          name: f.name, password: f.password,
          linkedType: f.kind === 'student' ? 'class' : f.kind === 'faculty' ? 'teacher' : '',
          linkedName: f.kind === 'none' ? '' : f.linkedName,
        });
      } else {
        out = await api('/login', 'POST', { username: f.username, password: f.password, role });
      }
      setToken(out.token);
      onAuth(out.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand">
          <span className="brand-tile light"><Icon name="clock" size={22} /></span>
          <span><b>CampusClock</b><small>College timetable engine</small></span>
        </div>
        <div className="auth-hero">
          <h1>Plan every lecture.<br />Zero clashes.</h1>
          <p>One timetable for the whole college. Teachers, rooms and classes are checked automatically, and everything is saved to an Excel file you own.</p>
          <ul>
            <li><Icon name="check" size={18} />Live clash and workload checks</li>
            <li><Icon name="check" size={18} />Colour-coded class, teacher and room views</li>
            <li><Icon name="check" size={18} />Download PDF timetables in one click</li>
          </ul>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="pv-top"><span /><span /><span /></div>
          {PREVIEW.map((row, ri) => (
            <div key={ri} className="pv-row">
              {row.map((h, ci) => (
                <i key={ci} style={{ '--h': h, opacity: (ri + ci) % 4 === 3 ? 0.25 : 1 }} />
              ))}
            </div>
          ))}
          <div className="pv-chip c1"><Icon name="check" size={14} />No clashes</div>
          <div className="pv-chip c2"><Icon name="sheet" size={14} />Saved to Excel</div>
        </div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">{register ? 'Join as a student or faculty member to see your timetable.' : 'Sign in to view and manage the timetable.'}</p>

          <div className="seg wide">
            <button type="button" className={role === 'user' ? 'active' : ''} onClick={() => { setRole('user'); setError(''); }}><Icon name="user" size={16} />User</button>
            <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => { setRole('admin'); setMode('signin'); setError(''); }}><Icon name="shield" size={16} />Admin</button>
          </div>

          {register && (
            <label>Full name<input value={f.name} onChange={set('name')} autoComplete="name" autoFocus required /></label>
          )}
          {!register && (
            <label>{role === 'admin' ? 'Username' : 'Username or full name'}
              <input value={f.username} onChange={set('username')} autoComplete="username" autoFocus required />
            </label>
          )}
          <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete={register ? 'new-password' : 'current-password'} required /></label>

          {register && (
            <>
              <label>I am a
                <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, linkedName: '' })}>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty member</option>
                  <option value="none">Just viewing</option>
                </select>
              </label>
              {f.kind !== 'none' && (
                <label>{f.kind === 'student' ? 'My class' : 'My name in the faculty list'}
                  <select value={f.linkedName} onChange={set('linkedName')}>
                    <option value="">{linkList.length ? 'Select...' : 'Nothing added yet'}</option>
                    {linkList.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          {error && <p className="notice bad"><Icon name="warn" size={16} />{error}</p>}
          <button type="submit" className="btn primary big" disabled={busy}>
            {busy ? 'Please wait...' : register ? 'Create account' : `Sign in as ${role === 'admin' ? 'admin' : 'user'}`}
          </button>

          {role === 'user' && (
            <p className="switch muted">
              {register ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" className="link" onClick={() => { setMode(register ? 'signin' : 'register'); setError(''); }}>
                {register ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}
          {role === 'admin' && <p className="switch muted">Admin accounts are created by an existing admin.</p>}
        </form>
      </section>
    </div>
  );
}

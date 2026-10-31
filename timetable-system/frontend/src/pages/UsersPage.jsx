import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import Icon from '../icons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PasswordModal from '../components/PasswordModal.jsx';
import { hueOf } from '../colors.js';

function UserForm({ data, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'user', linkedType: '', linkedName: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const list = f.linkedType === 'class' ? data.classes : f.linkedType === 'teacher' ? data.teachers : [];

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/users', 'POST', f);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal wide-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-badge"><Icon name="userPlus" /></div>
        <h2>Add user</h2>
        <div className="form-grid">
          <label>Full name<input value={f.name} onChange={set('name')} autoFocus required /></label>
          <label>Username<input value={f.username} onChange={set('username')} required /></label>
          <label>Password<input type="password" value={f.password} onChange={set('password')} required /></label>
          <label>Role
            <select value={f.role} onChange={set('role')}><option value="user">User (view only)</option><option value="admin">Admin (full access)</option></select>
          </label>
          <label>Linked to
            <select value={f.linkedType} onChange={(e) => setF({ ...f, linkedType: e.target.value, linkedName: '' })}>
              <option value="">Nobody</option><option value="class">A class</option><option value="teacher">A teacher</option>
            </select>
          </label>
          <label>{f.linkedType === 'teacher' ? 'Teacher' : 'Class'}
            <select value={f.linkedName} onChange={set('linkedName')} disabled={!f.linkedType}>
              <option value="">{f.linkedType ? 'Select...' : '-'}</option>
              {list.map((x) => <option key={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="btn primary">Create user</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage({ data, me }) {
  const [users, setUsers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api('/users').then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function remove(u) {
    if (!window.confirm(`Delete the account "${u.username}"?`)) return;
    try {
      await api(`/users/${u.username}`, 'DELETE');
      toast('User deleted', 'ok');
      load();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="page">
      <PageHeader title="Users & Access" subtitle={`${users.length} account${users.length === 1 ? '' : 's'} · stored in the Users sheet of your Excel file`}>
        <button className="btn primary" onClick={() => setAdding(true)}><Icon name="userPlus" size={16} />Add user</button>
      </PageHeader>
      {error && <p className="notice bad"><Icon name="warn" size={16} />{error}</p>}

      <div className="card table-card">
        <div className="scroll-x">
          <table className="list">
            <thead><tr><th>User</th><th>Role</th><th>Linked to</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td>
                    <div className="who-cell">
                      <span className="avatar-sm" style={{ '--h': hueOf(u.username) }}>{u.name.slice(0, 1).toUpperCase()}</span>
                      <div><b>{u.name}</b><small className="muted">@{u.username}{u.username === me.username ? ' (you)' : ''}</small></div>
                    </div>
                  </td>
                  <td><span className={`chip ${u.role === 'admin' ? 'primary' : ''}`}>{u.role === 'admin' ? 'Admin' : 'User'}</span></td>
                  <td>{u.linkedName ? <span className="chip">{u.linkedType === 'class' ? 'Class' : 'Teacher'}: {u.linkedName}</span> : <span className="muted">-</span>}</td>
                  <td>
                    <div className="actions">
                      <button className="btn ghost sm" onClick={() => setResetting(u)}><Icon name="key" size={14} />Reset password</button>
                      {u.username !== me.username && <button className="btn danger-soft sm" onClick={() => remove(u)}><Icon name="trash" size={14} />Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small tip"><Icon name="sheet" size={16} />Tip: you can also add users directly in the Excel file. Type a plain password in the "Set Password" column and click Reload in the sidebar.</p>

      {adding && <UserForm data={data} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('User created', 'ok'); load(); }} />}
      {resetting && (
        <PasswordModal
          title="Reset password" subtitle={`New password for @${resetting.username}`}
          onClose={() => setResetting(null)}
          onSubmit={async ({ password }) => { await api(`/users/${resetting.username}`, 'PUT', { password }); setResetting(null); toast('Password updated', 'ok'); }}
        />
      )}
    </div>
  );
}

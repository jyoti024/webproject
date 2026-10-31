import { useState } from 'react';
import Icon from '../icons.jsx';

// Used for "change my password" (needOld) and for an admin resetting someone's password.
export default function PasswordModal({ title, subtitle, needOld, onSubmit, onClose }) {
  const [oldPassword, setOld] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await onSubmit({ oldPassword, password });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-badge"><Icon name="key" /></div>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {needOld && <label>Current password<input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} autoFocus /></label>}
        <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!needOld} /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy}>Save password</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

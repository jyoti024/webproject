import { useEffect, useState, useCallback } from 'react';
import { api, isLoggedIn, setToken, setUnauthorizedHandler, download } from './api.js';
import { toast } from './toast.js';
import Icon from './icons.jsx';
import AuthPage from './components/AuthPage.jsx';
import PasswordModal from './components/PasswordModal.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TimetablePage from './pages/TimetablePage.jsx';
import EntityPage from './pages/EntityPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import { hueOf } from './colors.js';

const NAV = [
  { id: 'dashboard', icon: 'grid', label: 'Dashboard' },
  { id: 'timetable', icon: 'calendar', label: 'Timetable' },
  { id: 'teachers', icon: 'users', label: 'Teachers', admin: true },
  { id: 'subjects', icon: 'book', label: 'Subjects', admin: true },
  { id: 'classes', icon: 'cap', label: 'Classes', admin: true },
  { id: 'rooms', icon: 'building', label: 'Rooms', admin: true },
  { id: 'users', icon: 'shield', label: 'Users & Access', admin: true },
];
const getRoute = () => window.location.hash.replace('#/', '') || 'dashboard';
const EMPTY = { teachers: [], rooms: [], classes: [], subjects: [], slots: [], config: { days: [], periods: [] }, storage: null };

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(isLoggedIn());
  const [data, setData] = useState(EMPTY);
  const [offline, setOffline] = useState(false);
  const [toastItem, setToastItem] = useState(null);
  const [changingPw, setChangingPw] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // toasts
  useEffect(() => {
    let timer;
    const onToast = (e) => {
      setToastItem({ ...e.detail, id: Math.random() });
      clearTimeout(timer);
      timer = setTimeout(() => setToastItem(null), 4200);
    };
    window.addEventListener('app-toast', onToast);
    return () => { window.removeEventListener('app-toast', onToast); clearTimeout(timer); };
  }, []);

  // session
  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); setData(EMPTY); });
    if (isLoggedIn()) {
      api('/me').then(setUser).catch(() => setToken(null)).finally(() => setBooting(false));
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const [teachers, rooms, classes, subjects, slots, config, storage] = await Promise.all([
        api('/teachers'), api('/rooms'), api('/classes'), api('/subjects'), api('/slots'), api('/config'), api('/storage/info'),
      ]);
      setData({ teachers, rooms, classes, subjects, slots, config, storage });
      setOffline(false);
    } catch (e) {
      if (e.status === 0) setOffline(true);
    }
  }, []);
  useEffect(() => { if (user) reload(); }, [user, reload]);

  function signOut() {
    setToken(null);
    setUser(null);
    setData(EMPTY);
    window.location.hash = '#/dashboard';
  }

  async function downloadExcel() {
    try { await download('/storage/download', data.storage?.file || 'timetable.xlsx'); toast('Excel file downloaded', 'ok'); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function reloadFromExcel() {
    try {
      const out = await api('/storage/reload', 'POST');
      await reload();
      toast(out.warnings.length ? `Reloaded from Excel with ${out.warnings.length} warning(s): ${out.warnings[0]}` : `Reloaded from Excel (${out.lectures} lectures)`, out.warnings.length ? 'info' : 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }

  if (booting) return <div className="splash"><span className="brand-tile"><Icon name="clock" size={26} /></span></div>;
  if (!user) {
    return (
      <>
        <AuthPage onAuth={setUser} />
        {toastItem && <div className={`toast ${toastItem.kind}`}>{toastItem.message}</div>}
      </>
    );
  }

  const admin = user.role === 'admin';
  const nav = NAV.filter((n) => !n.admin || admin);
  const current = nav.some((n) => n.id === route) ? route : 'dashboard';
  const st = data.storage;

  let page;
  if (current === 'timetable') page = <TimetablePage data={data} user={user} reload={reload} />;
  else if (['teachers', 'subjects', 'classes', 'rooms'].includes(current)) page = <EntityPage key={current} resource={current} data={data} reload={reload} />;
  else if (current === 'users') page = <UsersPage data={data} me={user} />;
  else page = <Dashboard data={data} user={user} reload={reload} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/dashboard">
          <span className="brand-tile"><Icon name="clock" size={22} /></span>
          <span><b>CampusClock</b><small>College timetable</small></span>
        </a>
        <nav>
          {nav.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={current === n.id ? 'active' : ''}>
              <Icon name={n.icon} size={20} />{n.label}
            </a>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="storage-card">
            <div className="sc-head"><Icon name="sheet" size={16} />Data Storage</div>
            <div className="sc-line"><i className={`dot ${offline ? 'off' : ''}`} />{offline ? 'Server offline' : 'Excel workbook · Live'}</div>
            {st && <div className="sc-line sub"><Icon name="calendar" size={14} />{st.file} · {st.lectures} lectures</div>}
            {st && st.savedAt && <div className="sc-line sub"><Icon name="clock" size={14} />Saved {new Date(st.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
            {admin && (
              <div className="sc-actions">
                <button onClick={downloadExcel}><Icon name="download" size={14} />Download</button>
                <button onClick={reloadFromExcel}><Icon name="refresh" size={14} />Reload</button>
              </div>
            )}
          </div>

          <div className="user-row">
            <span className="avatar-sm" style={{ '--h': hueOf(user.username) }}>{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="who"><b>{user.name}</b><small>{user.role}</small></div>
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
            <button className="icon-btn" onClick={() => setChangingPw(true)} title="Change password"><Icon name="key" size={17} /></button>
            <button className="icon-btn" onClick={signOut} title="Sign out"><Icon name="logout" size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="content">
        {offline && (
          <div className="banner">
            <Icon name="warn" size={16} />Cannot reach the server. Start the backend (<code>npm start</code> in the backend folder), then{' '}
            <button className="link" onClick={reload}>retry</button>.
          </div>
        )}
        <main>{page}</main>
      </div>

      {changingPw && (
        <PasswordModal
          title="Change password" needOld onClose={() => setChangingPw(false)}
          onSubmit={async ({ oldPassword, password }) => {
            await api('/me/password', 'POST', { oldPassword, newPassword: password });
            setChangingPw(false);
            toast('Password changed', 'ok');
          }}
        />
      )}
      {toastItem && <div className={`toast ${toastItem.kind}`} key={toastItem.id}>{toastItem.message}</div>}
    </div>
  );
}

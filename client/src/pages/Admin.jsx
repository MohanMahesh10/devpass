import React, { useEffect, useMemo, useState, useCallback } from 'react';

import { apiGet, apiPost } from '../api';
import { useToast } from '../components/Toast';
import StatusPill from '../components/StatusPill';
import { LinkedInIcon, GitHubIcon, ExternalLinkIcon } from '../components/Icons';

const TOKEN_KEY = 'devpass.adminToken';
const FILTERS = ['all', 'pending', 'approved', 'rejected'];

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      + ' · '
      + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function Admin() {
  const toast = useToast();
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  });

  if (!token) {
    return <Login onLogin={(t) => {
      try { localStorage.setItem(TOKEN_KEY, t); } catch {}
      setToken(t);
    }} />;
  }

  return <Dashboard token={token} onLogout={() => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    setToken('');
    toast.info('Signed out');
  }} />;
}

/* ---------------- Login ---------------- */

function Login({ onLogin }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    try {
      const { token } = await apiPost('/api/admin/login', { password });
      onLogin(token);
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-narrow">
      <div className="card login-card">
        <div className="section-title">Admin</div>
        <h2 style={{ marginBottom: 6 }}>Sign in</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 18 }}>
          Enter the admin password to manage registrations.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="password">Password</label>
          <input
            id="password" type="password" autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting || !password}>
              {submitting ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ token, onLogout }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, checkedIn: 0 });
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const [{ registrations }, s] = await Promise.all([
        apiGet('/api/admin/registrations', token),
        apiGet('/api/admin/stats', token)
      ]);
      setRows(registrations);
      setStats(s);
    } catch (err) {
      if (err.status === 401) {
        toast.error('Session expired — signing out');
        onLogout();
      } else {
        toast.error(err.message || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [token, toast, onLogout]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.company || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  async function approve(r) {
    setBusyId(r.id);
    try {
      await apiPost(`/api/admin/approve/${r.id}`, {}, token);
      toast.success(`Approved — email sent to ${r.name}`);
      await load(true);
    } catch (err) {
      toast.error(err.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r) {
    setBusyId(r.id);
    try {
      await apiPost(`/api/admin/reject/${r.id}`, {}, token);
      toast.info(`Rejection email sent to ${r.name}`);
      await load(true);
    } catch (err) {
      toast.error(err.message || 'Reject failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page">
      <header className="row-wrap" style={{ marginBottom: 18 }}>
        <div>
          <div className="section-title">Admin</div>
          <h1 style={{ marginBottom: 4 }}>Registrations</h1>
          <p className="muted" style={{ fontSize: 12 }}>Review, approve and issue passes.</p>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={() => load()} disabled={loading}>
          {loading ? <><span className="spinner" /> Refreshing…</> : 'Refresh'}
        </button>
        <button className="btn btn-ghost" onClick={onLogout}>Sign out</button>
      </header>

      {/* Stats */}
      <section className="stat-row" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="stat-num pending">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat">
          <div className="stat-num approved">{stats.approved}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat">
          <div className="stat-num rejected">{stats.rejected}</div>
          <div className="stat-label">Rejected</div>
        </div>
        <div className="stat">
          <div className="stat-num checked">{stats.checkedIn}</div>
          <div className="stat-label">Checked in</div>
        </div>
      </section>

      {/* Controls */}
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row-wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div className="tabs">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
                type="button"
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="search-bar" style={{ minWidth: 240, flex: '1 1 260px', maxWidth: 380 }}>
            <input
              type="text"
              placeholder="Search name, email or company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="card"><span className="loading"><span className="spinner" /> Loading registrations…</span></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36 }}>
          <p className="muted" style={{ fontSize: 13 }}>No registrations match this view.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Company</th>
                <th>LinkedIn</th>
                <th>GitHub</th>
                <th>Registered</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    {r.checkedIn && (
                      <div style={{ color: 'var(--dp-lime)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Checked in</div>
                    )}
                  </td>
                  <td style={{ color: 'var(--dp-muted)' }}>{r.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.role || '—'}</td>
                  <td style={{ color: 'var(--dp-muted)' }}>{r.company || <span className="dash">—</span>}</td>
                  <td>
                    {r.linkedinUrl ? (
                      <a className="social-icon-link" href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" title={r.linkedinUrl}>
                        <LinkedInIcon />
                      </a>
                    ) : <span className="dash">—</span>}
                  </td>
                  <td>
                    {r.githubUrl ? (
                      <a className="social-icon-link" href={r.githubUrl} target="_blank" rel="noopener noreferrer" title={r.githubUrl}>
                        <GitHubIcon />
                      </a>
                    ) : <span className="dash">—</span>}
                  </td>
                  <td style={{ color: 'var(--dp-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.registeredAt)}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' ? (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn-approve"
                          onClick={() => approve(r)}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? '…' : 'Approve'}
                        </button>
                        <button
                          className="btn-reject"
                          onClick={() => reject(r)}
                          disabled={busyId === r.id}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {fmtDate(r.decidedAt)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 14, textAlign: 'right' }}>
        Volunteers: open <a href="/scan" style={{ color: 'var(--dp-lime)' }}>/scan <ExternalLinkIcon /></a> on event day.
      </p>
    </main>
  );
}

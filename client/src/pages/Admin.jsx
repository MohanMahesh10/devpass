import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { apiGet, apiPost, apiPatch } from '../api';
import { useToast } from '../components/Toast';
import StatusPill from '../components/StatusPill';
import {
  LinkedInIcon,
  GitHubIcon,
  ExternalLinkIcon,
  SparkleIcon,
  FlagIcon
} from '../components/Icons';
import AIShortlistPanel from '../components/AIShortlistPanel';
import DraftEmailModal from '../components/DraftEmailModal';

const TOKEN_KEY = 'devpass.adminToken';
const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'flagged'];
const TABS = ['attendees', 'settings'];

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

function profileGroupClass(group = '') {
  const g = group.toLowerCase();
  if (g.includes('senior') || g.includes('tech lead') || g.includes('architect')) return 'pg-pill pg-blue';
  if (g.includes('student') || g.includes('junior')) return 'pg-pill pg-purple';
  if (g.includes('founder')) return 'pg-pill pg-orange';
  if (g.includes('devops') || g.includes('sre')) return 'pg-pill pg-gray';
  if (g.includes('designer') || g.includes('ux')) return 'pg-pill pg-pink';
  if (g.includes('product')) return 'pg-pill pg-teal';
  if (g.includes('community')) return 'pg-pill pg-lime';
  return 'pg-pill pg-muted';
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
  const [tab, setTab] = useState('attendees');

  // attendee state
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({
    pending: 0, approved: 0, rejected: 0, checkedIn: 0,
    shortlisted: 0, autoApproved: 0, flagged: 0,
    profileBreakdown: {}
  });
  const [filter, setFilter] = useState('pending');
  const [profileFilter, setProfileFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // agent state
  const [agentStatus, setAgentStatus] = useState({ lastScreenedAt: '', pendingScreenings: 0, lastError: null, activeNow: 0 });
  const [rescreening, setRescreening] = useState(false);

  // draft modal state
  const [modalReg, setModalReg] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);

  const rowRefs = useRef(new Map());

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const [{ registrations }, s] = await Promise.all([
        apiGet('/api/admin/registrations', token),
        apiGet('/api/admin/stats', token)
      ]);
      // Join screening flags from /shortlist + /flagged so cards have full summaries.
      let screeningById = new Map();
      try {
        const sl = await apiGet('/api/admin/shortlist', token);
        for (const r of (sl.shortlist || [])) screeningById.set(r.id, r.screening);
      } catch (_) {}
      try {
        const fl = await apiGet('/api/admin/flagged', token);
        for (const r of (fl.flagged || [])) screeningById.set(r.id, r.screening);
      } catch (_) {}
      const enriched = registrations.map((r) => ({ ...r, screening: screeningById.get(r.id) || null }));
      setRows(enriched);
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

  // Poll agent status (paused while tab hidden)
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    async function tick() {
      if (document.hidden) {
        timer = setTimeout(tick, 10000);
        return;
      }
      try {
        const s = await apiGet('/api/admin/agent-status', token);
        if (!cancelled) setAgentStatus(s);
      } catch (_) { /* swallow */ }
      if (!cancelled) timer = setTimeout(tick, 10000);
    }
    tick();
    function onVis() {
      if (!document.hidden && !cancelled) {
        clearTimeout(timer);
        tick();
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh table when an agent screening finishes (active count drops)
  const prevActiveRef = useRef(agentStatus.activeNow);
  useEffect(() => {
    if (prevActiveRef.current > 0 && agentStatus.activeNow === 0) {
      load(true);
    }
    prevActiveRef.current = agentStatus.activeNow;
  }, [agentStatus.activeNow, load]);

  const shortlist = useMemo(
    () => rows.filter((r) => r.isShortlisted || r.isDuplicate || r.isSpam || r.isBot),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'flagged') {
        if (!(r.isDuplicate || r.isSpam || r.isBot)) return false;
      } else if (filter !== 'all') {
        if (r.status !== filter) return false;
      }
      if (profileFilter !== 'all' && (r.profileGroup || '') !== profileFilter) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.company || '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter, profileFilter, search]);

  const profileCounts = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const g = r.profileGroup || '';
      if (g) counts[g] = (counts[g] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const profileGroupOptions = useMemo(() => {
    return Object.keys(profileCounts).sort();
  }, [profileCounts]);

  async function approve(r, customEmailBody) {
    setBusyId(r.id);
    try {
      const body = customEmailBody ? { customEmailBody } : {};
      await apiPost(`/api/admin/approve/${r.id}`, body, token);
      toast.success(`Approved — email sent to ${r.name}`);
      await load(true);
    } catch (err) {
      toast.error(err.message || 'Approve failed');
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r, customEmailBody) {
    setBusyId(r.id);
    try {
      const body = customEmailBody ? { customEmailBody } : {};
      await apiPost(`/api/admin/reject/${r.id}`, body, token);
      toast.info(`Rejection email sent to ${r.name}`);
      await load(true);
    } catch (err) {
      toast.error(err.message || 'Reject failed');
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  async function rescreenAll() {
    setRescreening(true);
    try {
      const result = await apiPost('/api/admin/rescreen', { registrationIds: [] }, token);
      toast.success(`Re-screened ${result.rescreened || 0} registrations${result.errors ? ` (${result.errors} errors)` : ''}`);
      await load(true);
    } catch (err) {
      toast.error(err.message || 'Re-screen failed');
    } finally {
      setRescreening(false);
    }
  }

  function scrollToRow(id) {
    setFilter('all');
    setProfileFilter('all');
    setTimeout(() => {
      const el = rowRefs.current.get(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('row-flash');
        setTimeout(() => el.classList.remove('row-flash'), 1500);
      }
    }, 30);
  }

  async function handleModalSend({ kind, body }) {
    if (!modalReg) return;
    setModalBusy(true);
    try {
      if (kind === 'approve') await approve(modalReg, body);
      else await reject(modalReg, body);
      setModalReg(null);
    } catch (_) { /* toast handled */ }
    finally {
      setModalBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="row-wrap" style={{ marginBottom: 14 }}>
        <div>
          <div className="section-title">Admin</div>
          <h1 style={{ marginBottom: 4 }}>Registrations</h1>
          <AgentStatusLine status={agentStatus} active={agentStatus.activeNow > 0} onRescreen={rescreenAll} rescreening={rescreening} />
        </div>
        <span className="spacer" />
        <button className="btn-ghost" onClick={() => load()} disabled={loading}>
          {loading ? <><span className="spinner" /> Refreshing…</> : 'Refresh'}
        </button>
        <button className="btn-ghost" onClick={onLogout}>Sign out</button>
      </header>

      {/* Top tabs: Attendees / Settings */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            type="button"
          >
            {t === 'attendees' ? 'Attendees' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <SettingsTab token={token} toast={toast} />
      ) : (
        <>
          {/* Stats */}
          <section className="stat-row stat-row-7" style={{ marginBottom: 14 }}>
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
            <div className="stat">
              <div className="stat-num approved">{stats.shortlisted}</div>
              <div className="stat-label">Shortlisted</div>
            </div>
            <div className="stat">
              <div className="stat-num approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                <SparkleIcon size={14} /> {stats.autoApproved}
              </div>
              <div className="stat-label">Auto-approved</div>
            </div>
            <div className="stat">
              <div className="stat-num rejected">{stats.flagged}</div>
              <div className="stat-label">Flagged</div>
            </div>
          </section>

          <ProfileBreakdownBar breakdown={stats.profileBreakdown} total={rows.length} />

          {/* AI Shortlist panel */}
          <AIShortlistPanel
            shortlist={shortlist}
            loading={loading}
            busyId={busyId}
            onApprove={(r) => approve(r)}
            onSeeDraft={(r) => setModalReg(r)}
            onView={(r) => scrollToRow(r.id)}
          />

          {/* Filters */}
          <section className="card" style={{ marginBottom: 14, marginTop: 14 }}>
            <div className="row-wrap" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div className="tabs">
                {STATUS_FILTERS.map((f) => {
                  const count = f === 'flagged' ? stats.flagged
                    : f === 'all' ? rows.length
                    : (stats[f] || 0);
                  return (
                    <button
                      key={f}
                      className={`tab ${filter === f ? 'active' : ''}`}
                      onClick={() => setFilter(f)}
                      type="button"
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
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

            {profileGroupOptions.length > 0 && (
              <div className="tabs profile-tabs" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={`tab ${profileFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setProfileFilter('all')}
                >
                  All profiles
                </button>
                {profileGroupOptions.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`tab ${profileFilter === g ? 'active' : ''}`}
                    onClick={() => setProfileFilter(g)}
                  >
                    {g} ({profileCounts[g]})
                  </button>
                ))}
              </div>
            )}
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
                    <th>AI</th>
                    <th>Profile</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Company</th>
                    <th>Links</th>
                    <th>Registered</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const flagged = r.isDuplicate || r.isSpam || r.isBot;
                    return (
                      <tr
                        key={r.id}
                        ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
                        className={flagged ? 'row-flagged' : ''}
                        style={flagged ? { opacity: 0.6 } : undefined}
                      >
                        <td>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{r.name}</span>
                            {r.isDuplicate && <span className="badge-dup" title={r.screening?.duplicateOf ? `Similar to ${r.screening.duplicateOf}` : ''}>⚠ Duplicate</span>}
                            {r.isSpam && <span className="badge-spam">⚠ Spam</span>}
                            {r.isBot && <span className="badge-bot">🤖 Bot</span>}
                            {r.decidedBy === 'ai_agent' && r.status === 'approved' && (
                              <span className="badge-auto"><SparkleIcon size={10} /> Auto</span>
                            )}
                          </div>
                          {r.checkedIn && (
                            <div style={{ color: 'var(--dp-lime)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Checked in</div>
                          )}
                        </td>
                        <td>
                          {r.aiScore > 0 ? (
                            <span className={`score-pill ${r.aiScore >= 9 ? 'score-high' : r.aiScore >= 7 ? 'score-good' : 'score-mid'}`}>
                              {r.aiScore}
                            </span>
                          ) : (
                            <span className="dash">—</span>
                          )}
                        </td>
                        <td>
                          {r.profileGroup
                            ? <span className={profileGroupClass(r.profileGroup)}>{r.profileGroup}</span>
                            : <span className="dash">—</span>}
                        </td>
                        <td style={{ color: 'var(--dp-muted)' }}>{r.email}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.role || '—'}</td>
                        <td style={{ color: 'var(--dp-muted)' }}>{r.company || <span className="dash">—</span>}</td>
                        <td>
                          <div className="social-icons">
                            {r.linkedinUrl ? (
                              <a className="social-icon-link" href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" title={r.linkedinUrl}>
                                <LinkedInIcon />
                              </a>
                            ) : null}
                            {r.githubUrl ? (
                              <a className="social-icon-link" href={r.githubUrl} target="_blank" rel="noopener noreferrer" title={r.githubUrl}>
                                <GitHubIcon />
                              </a>
                            ) : null}
                            {!r.linkedinUrl && !r.githubUrl && <span className="dash">—</span>}
                          </div>
                        </td>
                        <td style={{ color: 'var(--dp-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.registeredAt)}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.status === 'pending' ? (
                            <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                              <button
                                className="btn-draft btn-draft-sm"
                                onClick={() => setModalReg(r)}
                                disabled={busyId === r.id}
                                title="Open AI draft email"
                              >
                                <SparkleIcon size={10} /> Draft
                              </button>
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 11 }}>
                              {fmtDate(r.decidedAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted" style={{ fontSize: 11, marginTop: 14, textAlign: 'right' }}>
            Volunteers: open <a href="/scan" style={{ color: 'var(--dp-lime)' }}>/scan <ExternalLinkIcon /></a> on event day.
          </p>
        </>
      )}

      <DraftEmailModal
        open={!!modalReg}
        onClose={() => !modalBusy && setModalReg(null)}
        registration={modalReg}
        busy={modalBusy}
        onSend={handleModalSend}
      />
    </main>
  );
}

/* ---------------- Subcomponents ---------------- */

function AgentStatusLine({ status, active, onRescreen, rescreening }) {
  let dotClass = 'agent-dot';
  let label = '✦ AI agent active — screens every registration automatically';
  if (active) {
    dotClass = 'agent-dot agent-dot-pulse';
    label = 'Agent screening…';
  } else if (status?.lastError) {
    dotClass = 'agent-dot agent-dot-error';
    label = 'Last screening had errors. Re-screen to retry.';
  }
  return (
    <div className="agent-status-line">
      <span className={dotClass} aria-hidden="true" />
      <span className="muted" style={{ fontSize: 12, letterSpacing: '0.02em' }}>
        {label}
        {status?.pendingScreenings > 0 && !active ? ` · ${status.pendingScreenings} pending` : ''}
      </span>
      <button className="btn-link" type="button" onClick={onRescreen} disabled={rescreening}>
        {rescreening ? 'Re-screening…' : 'Re-screen all pending'}
      </button>
    </div>
  );
}

const PROFILE_COLORS = {
  'Senior Developer': '#7aa6ff',
  'Tech Lead / Architect': '#5e9bff',
  'Junior Developer': '#b78bff',
  'Student': '#a874ff',
  'Startup Founder': '#f97316',
  'DevOps / SRE': '#9aa0a6',
  'Designer / UX': '#ff85b3',
  'Product Manager': '#5ad6c4',
  'Community Builder': '#c8e649',
  'Other': '#666'
};

function ProfileBreakdownBar({ breakdown, total }) {
  const groups = Object.entries(breakdown || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!groups.length || !total) return null;
  return (
    <div className="profile-breakdown">
      <div className="muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Profile breakdown
      </div>
      <div className="profile-bar">
        {groups.map(([g, n]) => {
          const pct = (n / total) * 100;
          return (
            <span
              key={g}
              className="profile-bar-seg"
              style={{ width: `${pct}%`, background: PROFILE_COLORS[g] || '#666' }}
              title={`${g}: ${n} (${pct.toFixed(0)}%)`}
            >
              {pct >= 8 ? `${g} ${pct.toFixed(0)}%` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab({ token, toast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(8);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiGet('/api/admin/settings', token);
        if (cancelled) return;
        setEnabled(!!s.autoApproveEnabled);
        setThreshold(Number(s.autoApproveThreshold) || 8);
      } catch (err) {
        toast.error(err.message || 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, toast]);

  async function save(next) {
    setSaving(true);
    try {
      const data = await apiPatch('/api/admin/settings', next, token);
      setEnabled(!!data.autoApproveEnabled);
      setThreshold(Number(data.autoApproveThreshold) || 8);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card"><span className="loading"><span className="spinner" /> Loading settings…</span></div>;
  }

  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <div className="section-title"><SparkleIcon size={11} /> AI Auto-approve</div>
      <h3 style={{ marginBottom: 6 }}>Hands-off approval for high-scoring applicants</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
        When the AI agent is highly confident in a registration AND it passes all spam, bot and duplicate checks, DevPass will approve it for you and email the QR pass automatically.
      </p>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => save({ autoApproveEnabled: e.target.checked, autoApproveThreshold: threshold })}
          disabled={saving}
        />
        <span>Enable auto-approve</span>
      </label>

      {enabled && (
        <div style={{ marginTop: 18 }}>
          <label htmlFor="threshold-slider" style={{ marginBottom: 4 }}>Score threshold</label>
          <div className="threshold-row">
            {[7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                className={`threshold-pill ${threshold === n ? 'active' : ''}`}
                onClick={() => save({ autoApproveEnabled: true, autoApproveThreshold: n })}
                disabled={saving}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Attendees scored <strong style={{ color: 'var(--dp-lime)' }}>{threshold}</strong> or above will be automatically approved if they pass all spam and duplicate checks.
          </p>

          <div className="warn-banner">
            <FlagIcon size={12} /> Auto-approved attendees receive their QR pass immediately. Review the AI Shortlist panel to monitor this.
          </div>
        </div>
      )}
    </section>
  );
}

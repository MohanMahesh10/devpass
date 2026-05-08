import React, { useMemo, useState } from 'react';

import ShortlistCard from './ShortlistCard';
import {
  SparkleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RobotIcon
} from './Icons';

const FILTERS = [
  { id: 'all', label: 'All', dot: '' },
  { id: 'auto', label: 'Auto-approved', dot: '🟢' },
  { id: 'pending', label: 'Pending review', dot: '🟡' },
  { id: 'flagged', label: 'Flagged', dot: '🔴' }
];

export default function AIShortlistPanel({
  shortlist = [],
  loading = false,
  onApprove,
  onSeeDraft,
  onView,
  busyId
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...shortlist];
    if (filter === 'auto') list = list.filter((r) => r.status === 'approved' && r.decidedBy === 'ai_agent');
    else if (filter === 'pending') list = list.filter((r) => r.status === 'pending' && !(r.isDuplicate || r.isSpam || r.isBot));
    else if (filter === 'flagged') list = list.filter((r) => r.isDuplicate || r.isSpam || r.isBot);
    list.sort((a, b) => {
      const flaggedDelta = Number(!!(b.isDuplicate || b.isSpam || b.isBot)) - Number(!!(a.isDuplicate || a.isSpam || a.isBot));
      if (flaggedDelta !== 0) return -flaggedDelta;
      return (b.aiScore || 0) - (a.aiScore || 0);
    });
    return list;
  }, [shortlist, filter]);

  const count = shortlist.length;
  const allApproved = count > 0 && shortlist.every((r) => r.status === 'approved');

  return (
    <section className="shortlist-panel">
      <header className="shortlist-header" onClick={() => setExpanded((e) => !e)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((x) => !x); } }}>
        <div className="shortlist-title">
          <SparkleIcon size={14} />
          <span className="shortlist-title-text">AI Shortlist</span>
          <span className="shortlist-count">
            {loading ? 'screening…' : `${count} genuine ${count === 1 ? 'attendee' : 'attendees'}`}
          </span>
        </div>
        <button
          className="btn-ghost shortlist-toggle"
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          aria-label={expanded ? 'Collapse shortlist' : 'Expand shortlist'}
        >
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
      </header>

      {expanded && (
        <div className="shortlist-body">
          <div className="shortlist-filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`tab ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.dot && <span style={{ marginRight: 6 }}>{f.dot}</span>}{f.label}
              </button>
            ))}
          </div>

          {loading && shortlist.length === 0 ? (
            <div className="shortlist-grid">
              {[0, 1, 2].map((i) => (
                <div key={i} className="shortlist-card shimmer" aria-hidden="true">
                  <div className="shimmer-line w-30" />
                  <div className="shimmer-line w-70" />
                  <div className="shimmer-line w-50" />
                  <div className="shimmer-line w-60" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            count === 0 ? (
              <div className="shortlist-empty">
                <RobotIcon size={32} />
                <div>
                  <p style={{ marginBottom: 4 }}>No shortlisted applicants yet.</p>
                  <p className="muted" style={{ fontSize: 12 }}>
                    New registrations are screened automatically by the AI agent.
                  </p>
                </div>
              </div>
            ) : allApproved ? (
              <div className="shortlist-empty">
                <SparkleIcon size={20} />
                <p style={{ color: 'var(--dp-lime)' }}>All shortlisted attendees have been approved.</p>
              </div>
            ) : (
              <div className="shortlist-empty">
                <p className="muted" style={{ fontSize: 12 }}>No attendees match this filter.</p>
              </div>
            )
          ) : (
            <div className="shortlist-grid">
              {filtered.map((r) => (
                <ShortlistCard
                  key={r.id}
                  registration={r}
                  onApprove={onApprove}
                  onSeeDraft={onSeeDraft}
                  onView={onView}
                  busy={busyId === r.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

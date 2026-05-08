import React from 'react';

import { LinkedInIcon, GitHubIcon, SparkleIcon, FlagIcon } from './Icons';

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

function scoreClass(score = 0) {
  if (score >= 9) return 'score-badge score-high';
  if (score >= 7) return 'score-badge score-good';
  return 'score-badge score-mid';
}

export default function ShortlistCard({
  registration,
  onApprove,
  onSeeDraft,
  onView,
  busy
}) {
  const r = registration;
  const flagged = r.isDuplicate || r.isSpam || r.isBot;
  const flags = (r.screening && r.screening.flags) || [];
  const summary = (r.screening && r.screening.summary) || '';

  return (
    <div className={`shortlist-card ${flagged ? 'shortlist-card-flagged' : ''} ${r.status === 'approved' ? 'shortlist-card-approved' : ''}`}>
      {r.isDuplicate && (
        <div className="shortlist-banner banner-orange">
          ⚠ Possible duplicate{r.screening?.duplicateOf ? ` of ${String(r.screening.duplicateOf).slice(0, 8)}…` : ''}
        </div>
      )}
      {(r.isBot || r.isSpam) && (
        <div className="shortlist-banner banner-red">
          ⚠ Flagged — {[r.isBot && 'bot', r.isSpam && 'spam'].filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="shortlist-row top">
        <div className={scoreClass(r.aiScore)}>
          <span className="score-num">{r.aiScore || '—'}</span>
          <span className="score-of">/10</span>
        </div>
        <div className="shortlist-name">
          <div className="shortlist-name-text">{r.name}</div>
          <div className="shortlist-sub">
            {r.role && <span style={{ textTransform: 'capitalize' }}>{r.role}</span>}
            {r.role && r.company ? ' · ' : ''}
            {r.company || ''}
          </div>
        </div>
        {r.profileGroup && <span className={profileGroupClass(r.profileGroup)}>{r.profileGroup}</span>}
      </div>

      <div className="shortlist-row links">
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
        <span className="muted" style={{ fontSize: 11 }}>{r.email}</span>
      </div>

      {summary && (
        <div className="shortlist-summary">
          <SparkleIcon size={11} /> <span>{summary}</span>
        </div>
      )}

      {flags.length > 0 && (
        <div className="shortlist-flags">
          {flags.map((f, i) => (
            <span key={`${f}-${i}`} className="flag-pill">
              <FlagIcon size={10} /> {f.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      <div className="shortlist-actions">
        {r.status === 'approved' ? (
          <span className="approved-marker"><SparkleIcon size={11} /> Approved</span>
        ) : (
          <button
            className="btn-approve"
            onClick={() => onApprove && onApprove(r)}
            disabled={busy}
          >
            {busy ? '…' : 'Approve'}
          </button>
        )}
        <button
          className="btn-draft"
          onClick={() => onSeeDraft && onSeeDraft(r)}
          disabled={busy}
        >
          See draft email
        </button>
        <button
          className="btn-link"
          onClick={() => onView && onView(r)}
          type="button"
        >
          View full profile
        </button>
      </div>
    </div>
  );
}

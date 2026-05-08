import React, { useEffect, useMemo, useState } from 'react';

import { CloseIcon, CopyIcon, SparkleIcon } from './Icons';
import { useToast } from './Toast';

/**
 * AI draft email modal.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   registration: { id, name, agentDraftApprovalEmail, agentDraftRejectionEmail, status }
 *   onSend: ({ kind: 'approve'|'reject', body: string }) => Promise<void>
 *   busy: boolean
 */
export default function DraftEmailModal({ open, onClose, registration, onSend, busy }) {
  const toast = useToast();
  const [tab, setTab] = useState('approve');
  const [body, setBody] = useState('');

  const initialBodies = useMemo(() => ({
    approve: (registration && registration.agentDraftApprovalEmail) || '',
    reject: (registration && registration.agentDraftRejectionEmail) || ''
  }), [registration]);

  useEffect(() => {
    if (open && registration) {
      setBody(initialBodies[tab] || '');
    }
  }, [open, registration, tab, initialBodies]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose && onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !registration) return null;

  function setTabAndReset(next) {
    setTab(next);
    setBody(initialBodies[next] || '');
  }

  async function handleSend() {
    if (!onSend) return;
    if (!body.trim()) return toast.error('Email body is empty');
    try {
      await onSend({ kind: tab, body });
    } catch (err) {
      toast.error(err.message || 'Send failed');
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success('Copied to clipboard');
    } catch (_) {
      toast.error('Copy failed');
    }
  }

  const charCount = body.length;
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="draft-email-title">
        <header className="modal-header">
          <div>
            <div className="section-title" style={{ marginBottom: 4 }}>
              <SparkleIcon size={11} /> AI Draft
            </div>
            <h3 id="draft-email-title" style={{ margin: 0 }}>{registration.name}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="modal-tabs">
          <button
            type="button"
            className={`tab ${tab === 'approve' ? 'active' : ''}`}
            onClick={() => setTabAndReset('approve')}
          >Approval email</button>
          <button
            type="button"
            className={`tab ${tab === 'reject' ? 'active' : ''}`}
            onClick={() => setTabAndReset('reject')}
          >Rejection email</button>
        </div>

        <div className="modal-body">
          <textarea
            className="modal-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`AI draft for ${tab === 'approve' ? 'approval' : 'rejection'} will appear here.`}
            rows={12}
          />
          <div className="modal-meta">
            <span className="muted" style={{ fontSize: 11 }}>{wordCount} words · {charCount} chars</span>
            <span className="muted" style={{ fontSize: 11 }}>
              <SparkleIcon size={10} /> AI-drafted based on this applicant's profile. Review before sending.
            </span>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn-ghost" type="button" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn-ghost" type="button" onClick={handleCopy} disabled={busy}>
            <CopyIcon size={12} /> Copy
          </button>
          <button
            className={tab === 'approve' ? 'btn-approve btn-lg' : 'btn-reject btn-lg'}
            type="button"
            onClick={handleSend}
            disabled={busy}
          >
            {busy ? 'Sending…' : `Send as-is (${tab === 'approve' ? 'Approve' : 'Reject'})`}
          </button>
        </footer>
      </div>
    </div>
  );
}

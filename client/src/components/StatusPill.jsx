import React from 'react';

export default function StatusPill({ status }) {
  const cls = status === 'approved' ? 'pill-approved'
    : status === 'rejected' ? 'pill-rejected'
    : 'pill-pending';
  return <span className={`pill ${cls}`}>{status}</span>;
}

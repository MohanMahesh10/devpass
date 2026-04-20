import React, { useEffect, useState } from 'react';
import { apiGet } from '../api';
import { CheckCircleIcon } from '../components/Icons';

export default function Confirmed() {
  const [event, setEvent] = useState({ name: 'our event' });

  useEffect(() => {
    apiGet('/api/event').then(setEvent).catch(() => {});
  }, []);

  return (
    <main className="page-narrow">
      <div className="card confirmed-card">
        <div className="confirmed-icon" aria-hidden="true">
          <CheckCircleIcon size={34} />
        </div>
        <h1 style={{ marginBottom: 8 }}>You're on the list!</h1>
        <p style={{ color: 'var(--dp-text)', marginBottom: 10 }}>
          Thanks for registering for <strong>{event.name || 'our event'}</strong>. We'll review your application and
          send your DevPass by email if approved.
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          Keep an eye on your inbox — including spam.
        </p>
      </div>
    </main>
  );
}

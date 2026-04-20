import React, { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, kind = 'success', ttl = 3500) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    if (ttl > 0) {
      setTimeout(() => remove(id), ttl);
    }
    return id;
  }, [remove]);

  const api = {
    success: (m, ttl) => push(m, 'success', ttl),
    info: (m, ttl) => push(m, 'info', ttl),
    error: (m, ttl) => push(m, 'error', ttl)
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role="status" onClick={() => remove(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Fallback no-op if provider missing, prevents crashes in isolated renders
    return { success: () => {}, info: () => {}, error: () => {} };
  }
  return ctx;
}

// Small standalone Toast component kept for completeness (not required since ToastProvider owns rendering)
export default function Toast({ message, kind = 'success' }) {
  useEffect(() => {}, []);
  return <div className={`toast ${kind}`}>{message}</div>;
}

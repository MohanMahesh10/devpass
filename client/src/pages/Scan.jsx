import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

import { apiPost } from '../api';
import { CheckCircleIcon, AlertIcon, XCircleIcon } from '../components/Icons';

const RESET_MS = 3000;

export default function Scan() {
  const scannerRef = useRef(null);
  const containerId = 'qr-reader';
  const [state, setState] = useState({ kind: 'scanning' });
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const cooldownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const html5 = new Html5Qrcode(containerId, { verbose: false });
    scannerRef.current = html5;

    async function start() {
      try {
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          handleScan,
          () => { /* scan-frame failure — ignore */ }
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        console.error('[scan] camera start failed', err);
        if (!cancelled) {
          setCameraError(err?.message || 'Unable to access camera. Please allow camera permissions and reload.');
          setStarting(false);
        }
      }
    }
    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        try {
          const state = s.getState && s.getState();
          // 2 = SCANNING in html5-qrcode
          if (state === 2) s.stop().then(() => s.clear()).catch(() => {});
          else s.clear && s.clear();
        } catch (_) { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScan(decodedText) {
    if (cooldownRef.current) return;
    cooldownRef.current = true;

    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch (_) {
      setState({ kind: 'invalid', message: 'Unrecognised pass' });
      scheduleReset();
      return;
    }

    try {
      const result = await apiPost('/api/checkin', payload);
      if (result.status === 'success') {
        setState({ kind: 'success', name: result.name, message: result.message });
      } else if (result.status === 'duplicate') {
        setState({ kind: 'duplicate', name: result.name, message: result.message });
      } else {
        setState({ kind: 'invalid', message: result.message || 'Unrecognised pass' });
      }
    } catch (err) {
      if (err.data && err.data.status === 'duplicate') {
        setState({ kind: 'duplicate', name: err.data.name, message: err.data.message });
      } else {
        setState({ kind: 'invalid', message: (err.data && err.data.error) || err.message || 'Invalid or unrecognised pass' });
      }
    }
    scheduleReset();
  }

  function scheduleReset() {
    setTimeout(() => {
      setState({ kind: 'scanning' });
      cooldownRef.current = false;
    }, RESET_MS);
  }

  return (
    <main className="scan-wrap">
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Check-in</div>
        <h2 style={{ fontSize: 18 }}>Scan DevPass QR</h2>
      </div>

      <div className="scan-frame-outer">
        <div id={containerId} />
        <div className="scan-corners" aria-hidden="true"><span /></div>
      </div>

      {starting && !cameraError && (
        <div className="scan-status"><span className="loading"><span className="spinner" /> Starting camera…</span></div>
      )}
      {cameraError && (
        <div className="scan-result invalid" role="alert">
          <div className="scan-icon"><XCircleIcon size={30} /></div>
          <div className="scan-name">Camera blocked</div>
          <div className="scan-sub">{cameraError}</div>
        </div>
      )}
      {!starting && !cameraError && state.kind === 'scanning' && (
        <div className="scan-status">Point camera at QR pass</div>
      )}

      {state.kind === 'success' && (
        <div className="scan-result success" role="status">
          <div className="scan-icon"><CheckCircleIcon size={34} /></div>
          <div className="scan-name">Welcome, {state.name}!</div>
          <div className="scan-sub">Entry confirmed.</div>
        </div>
      )}
      {state.kind === 'duplicate' && (
        <div className="scan-result duplicate" role="status">
          <div className="scan-icon"><AlertIcon size={30} /></div>
          <div className="scan-name">Already checked in</div>
          <div className="scan-sub">{state.name ? `${state.name} has already entered.` : 'This pass was already used.'}</div>
        </div>
      )}
      {state.kind === 'invalid' && (
        <div className="scan-result invalid" role="alert">
          <div className="scan-icon"><XCircleIcon size={30} /></div>
          <div className="scan-name">Invalid pass</div>
          <div className="scan-sub">{state.message || 'This QR was not recognised.'}</div>
        </div>
      )}
    </main>
  );
}

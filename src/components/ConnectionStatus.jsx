import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_HOST = process.env.REACT_APP_API_URL || `http://${window.location.hostname}:8080`;

const StatusPill = ({ healthy, label, sub }) => (
  <div className="flex items-center justify-between py-1.5">
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${healthy === null ? 'bg-yellow-400' : healthy ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{label}</span>
    </div>
    <span className={`text-xs flex-shrink-0 ml-2 ${healthy === null ? 'text-yellow-500' : healthy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
      {sub}
    </span>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div className="flex justify-between items-start gap-2 py-0.5">
    <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
    <span className="text-[11px] text-gray-700 dark:text-gray-300 text-right break-all max-w-[60%]">{value}</span>
  </div>
);

export default function ConnectionStatus() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({
    backend: null,
    asterisk: null,
    config: null,
    apiUrl: API_HOST,
    wsUrl: API_HOST.replace(/^http/, 'ws') + '/ws',
    checking: false,
    error: null,
    lastCheck: null,
  });
  const intervalRef = useRef(null);

  const check = async () => {
    setState(prev => ({ ...prev, checking: true, error: null }));
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);

      const healthResp = await fetch(`${API_HOST}/health`, { signal: ctrl.signal });
      clearTimeout(timeout);
      const healthOk = healthResp.ok;

      let asteriskHealthy = null;
      let asteriskMsg = 'Unknown';
      let configData = null;
      let apiUrl = API_HOST;
      let wsUrl = API_HOST.replace(/^http/, 'ws') + '/ws';

      if (healthOk) {
        try {
          const configResp = await fetch(`${API_HOST}/config`, { signal: AbortSignal.timeout(3000) });
          if (configResp.ok) {
            const cfg = await configResp.json();
            if (cfg.success && cfg.config) {
              configData = cfg.config;
              apiUrl = cfg.config.api_url || apiUrl;
              wsUrl = cfg.config.ws_url || wsUrl;
            }
          }
        } catch (e) {}

        try {
          const astResp = await fetch(`${API_HOST}/protected/test-asterisk`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            signal: AbortSignal.timeout(3000),
          });
          if (astResp.ok) {
            const ast = await astResp.json();
            asteriskHealthy = ast.success || ast.connected || false;
            asteriskMsg = asteriskHealthy ? 'Connected' : (ast.error || 'Not available');
          } else {
            asteriskHealthy = false;
            asteriskMsg = 'Not accessible';
          }
        } catch (e) {
          asteriskHealthy = null;
          asteriskMsg = 'Not checked';
        }
      }

      setState({
        backend: healthOk,
        asterisk: asteriskHealthy,
        config: configData,
        apiUrl,
        wsUrl,
        checking: false,
        error: healthOk ? null : 'Backend unreachable',
        lastCheck: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        backend: false,
        asterisk: null,
        checking: false,
        error: err.name === 'AbortError' ? 'Request timed out' : err.message,
        lastCheck: new Date().toLocaleTimeString(),
      }));
    }
  };

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, 15000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const overall = state.backend !== false;
  const badgeColor = state.backend === null
    ? 'bg-yellow-500'
    : state.backend
      ? 'bg-green-500'
      : 'bg-red-500';
  const badgeLabel = state.backend === null
    ? 'Checking...'
    : state.backend
      ? 'All Systems OK'
      : 'Disconnected';

  return (
    <>
      {/* Floating pill */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow"
      >
        <div className={`w-2.5 h-2.5 rounded-full ${badgeColor} ${state.backend === null ? 'animate-pulse' : ''}`} />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{badgeLabel}</span>
      </button>

      {/* Detail Panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Connection Status</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">&times;</button>
          </div>

          <div className="px-4 py-3 space-y-1">
            <StatusPill healthy={state.backend} label="Backend" sub={state.backend === null ? 'Checking...' : state.backend ? 'Connected' : 'Disconnected'} />
            <StatusPill healthy={state.asterisk} label="Asterisk" sub={state.asterisk === null ? 'Checking...' : state.asterisk ? 'Connected' : 'Not available'} />
            <StatusPill healthy={state.config ? true : state.backend === false ? false : null} label="Configuration" sub={state.config ? 'Loaded' : state.backend === false ? 'Unavailable' : 'Loading...'} />
            <StatusPill healthy={state.backend ? true : null} label="WebSocket" sub={state.backend ? 'Ready' : 'N/A'} />
          </div>

          {/* Config Details */}
          {state.config && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Configuration</p>
              <DetailRow label="API URL" value={state.apiUrl} />
              <DetailRow label="WS URL" value={state.wsUrl} />
              {state.config.asterisk && (
                <DetailRow label="Asterisk Host" value={state.config.asterisk.host || '-'} />
              )}
              <DetailRow label="Status" value={state.config.environment || '-'} />
            </div>
          )}

          {/* Error */}
          {state.error && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-red-500">{state.error}</p>
            </div>
          )}

          {/* Time */}
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            {state.lastCheck && <span className="text-[10px] text-gray-400">Last check: {state.lastCheck}</span>}
            <div className="flex gap-1">
              <button onClick={check} className="text-[11px] px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">Refresh</button>
              <button onClick={() => navigate('/ip-config')} className="text-[11px] px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">IP Config</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
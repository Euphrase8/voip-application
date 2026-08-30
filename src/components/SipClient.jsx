import { useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connectWebSocket, getConnectionStatus } from '../services/websocketservice';
import sipManager from '../services/sipManager';

const SipClient = ({ extension, sipPassword }) => {
  const uaRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 15000; // 15 seconds base delay

  // Reconnect with exponential backoff capped at MAX_RECONNECT_ATTEMPTS
  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[SipClient] Max reconnect attempts reached for extension:', extension);
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = BASE_RECONNECT_DELAY * 2 ** (reconnectAttemptsRef.current - 1);
    console.warn(`[SipClient] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      // Only try to initialize if uaRef is not connected or null
      if (!uaRef.current || !uaRef.current.isConnected()) {
        initializeSip();
      }
    }, delay);
  }, [extension]);

  const initializeSip = useCallback(async () => {
    if (!extension || !/^\d{4,6}$/.test(extension)) {
      console.error('[SipClient] Invalid extension:', extension);
      window.dispatchEvent(new CustomEvent('registrationStatus', {
        detail: { extension, registered: false, cause: 'Invalid extension' },
      }));
      return;
    }

    // Reuse singleton sipManager to avoid duplicate SIP sessions for same extension
    if (sipManager.ua) {
      uaRef.current = sipManager.ua;
      console.log('[SipClient] Reusing singleton SIP UA for', extension);
      window.dispatchEvent(new CustomEvent('registrationStatus', {
        detail: { extension, registered: sipManager.isRegistered },
      }));
      return;
    }

    try {
      // Ensure shared backend WebSocket is up (no duplicate)
      const { isConnected, extension: activeExt } = getConnectionStatus();
      if (!isConnected || activeExt !== extension) {
        connectWebSocket(extension);
      }

      await sipManager.initialize(extension, sipPassword);
      uaRef.current = sipManager.ua;

      sipManager.on('registered', () => {
        window.dispatchEvent(new CustomEvent('registrationStatus', { detail: { extension, registered: true } }));
        localStorage.setItem(`sipRegistered_${extension}`, 'true');
      });
      sipManager.on('unregistered', () => {
        window.dispatchEvent(new CustomEvent('registrationStatus', { detail: { extension, registered: false } }));
        localStorage.removeItem(`sipRegistered_${extension}`);
      });
      sipManager.on('registrationFailed', (cause) => {
        window.dispatchEvent(new CustomEvent('registrationStatus', { detail: { extension, registered: false, cause } }));
        localStorage.removeItem(`sipRegistered_${extension}`);
      });

      // Bridge sipManager incoming calls to window events for legacy listeners (generic for any extension)
      sipManager.on('incomingCall', (data) => {
        window.dispatchEvent(new CustomEvent('incomingCall', {
          detail: { from: data.from, channel: `${data.from}@${sipManager.extension}`, session: data.session },
        }));
      });

      console.log('[SipClient] SIP UA initialized via singleton for', extension);
    } catch (err) {
      console.error('[SipClient] SIP init error:', err.message);
      window.dispatchEvent(new CustomEvent('registrationStatus', {
        detail: { extension, registered: false, cause: err.message },
      }));
      attemptReconnect();
    }
  }, [extension, sipPassword, attemptReconnect]);

  useEffect(() => {
    if (extension && sipPassword) {
      initializeSip();
    }
    return () => {
      // Do not stop singleton UA here — it is shared across components (no duplicate sessions, but single owner is Dashboard/App)
      if (uaRef.current && uaRef.current !== sipManager.ua) {
        console.log('[SipClient] Stopping SIP UA...');
        uaRef.current.stop();
      }
      uaRef.current = null;
    };
  }, [extension, sipPassword, initializeSip]);

  return null;
};

SipClient.propTypes = {
  extension: PropTypes.string.isRequired,
  sipPassword: PropTypes.string.isRequired,
};

export default SipClient;

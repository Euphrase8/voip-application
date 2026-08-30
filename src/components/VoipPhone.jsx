import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, TextField, Tooltip } from '@mui/material';
import { Call, CallEnd } from '@mui/icons-material';
import { hangup } from '../services/hang';
import { sendWebSocketMessage, addMessageListener, connectWebSocket } from '../services/websocketservice';
import { getToken } from '../services/login';
import { CONFIG } from '../services/config';
import sipManager from '../services/sipManager';

const VoipPhone = ({
  extension = '',
  password = 'user_password',
  setIsLoading,
  darkMode,
  initialTargetExtension = '',
  onCallStatusChange,
  incomingStream,
  incomingPeerConnection,
}) => {
  const [targetExtension, setTargetExtension] = useState(initialTargetExtension);
  const [status, setStatus] = useState(extension ? 'Disconnected' : 'No extension provided');
  const [callStatus, setCallStatus] = useState('');
  const uaRef = useRef(null);
  const callRef = useRef(null);
  const wsRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (incomingStream && incomingPeerConnection && audioRef.current) {
      audioRef.current.srcObject = incomingStream;
      audioRef.current.play().catch((error) => {
        console.error('Error playing incoming audio:', error);
      });
      setStatus('Connected');
      setCallStatus('Call connected');
      onCallStatusChange('Call connected');
    }
  }, [incomingStream, incomingPeerConnection, onCallStatusChange]);

  const setupWebSocket = useCallback(() => {
    if (!extension || incomingStream) return;
    // Reuse shared WebSocket via websocketservice — no duplicate SIP sessions
    try { connectWebSocket(extension); } catch {}
    setStatus('WebSocket connected');
    const unsubscribe = addMessageListener((event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'call-status' || message.type === 'call_status') {
          setCallStatus(message.status || message.Status);
          onCallStatusChange && onCallStatusChange(message.status || message.Status);
        }
      } catch {}
    });
    return () => unsubscribe();
  }, [extension, onCallStatusChange, incomingStream]);

  useEffect(() => {
    if (incomingStream) return; // Skip SIP setup for incoming calls

    // Single source of truth for SIP — reuse singleton sipManager to avoid duplicate sessions
    if (sipManager.ua) {
      uaRef.current = sipManager.ua;
      setStatus(sipManager.isRegistered ? 'Registered' : 'Connected');
      // Subscribe to singleton events for status updates (generic for any extension)
      const onReg = () => setStatus('Registered');
      const onUnreg = () => setStatus('Unregistered');
      const onFailed = (e) => setStatus(`Registration failed: ${e?.cause || e}`);
      sipManager.on('registered', onReg);
      sipManager.on('unregistered', onUnreg);
      sipManager.on('registrationFailed', onFailed);
      return () => {
        sipManager.off('registered', onReg);
        sipManager.off('unregistered', onUnreg);
        sipManager.off('registrationFailed', onFailed);
      };
    }

    // No existing UA — initialize via singleton (no duplicate JsSIP instance here)
    let cancelled = false;
    sipManager.initialize(extension, password).then(() => {
      if (!cancelled) {
        uaRef.current = sipManager.ua;
        setStatus('Registered');
      }
    }).catch((e) => {
      if (!cancelled) setStatus(`Registration failed: ${e.message}`);
    });

    return () => {
      cancelled = true;
      // Do not stop singleton UA here; owner (App/Dashboard) manages lifecycle
    };
  }, [extension, password]);

  useEffect(() => {
    const cleanup = setupWebSocket();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [setupWebSocket, incomingStream]);

  const makeCall = useCallback(async () => {
    if (!uaRef.current || !uaRef.current.isRegistered()) {
      setCallStatus('Please register first');
      return;
    }
    if (!targetExtension) {
      setCallStatus('Please enter target extension');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${CONFIG.API_URL}/protected/call/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ target_extension: targetExtension }),
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        setCallStatus(`Call initiated to ${targetExtension} (Channel: ${data.channel})`);
        callRef.current = uaRef.current.call(`sip:${targetExtension}@${CONFIG.SIP_SERVER}`, {
          mediaConstraints: { audio: true, video: false },
          eventHandlers: {
            progress: () => setCallStatus('Dialing...'),
            failed: (e) => {
              setCallStatus(`Call failed: ${e.cause}`);
              onCallStatusChange(`Call failed: ${e.cause}`);
            },
            ended: () => {
              setCallStatus('Call ended');
              onCallStatusChange('Call ended');
            },
            confirmed: () => {
              setCallStatus('Call connected');
              onCallStatusChange('Call connected');
            },
          },
        });
      } else {
        setCallStatus(`Failed to initiate call: ${data.error}`);
      }
    } catch (error) {
      setCallStatus(`Error initiating call: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [targetExtension, setIsLoading, onCallStatusChange]);

  const endCall = useCallback(async () => {
    if (callRef.current) {
      callRef.current.terminate();
      callRef.current = null;
    }
    if (incomingStream) {
      incomingStream.getTracks().forEach((track) => track.stop());
    }
    if (incomingPeerConnection) {
      incomingPeerConnection.close();
    }
    try {
      await hangup(`PJSIP/${extension}`);
      await sendWebSocketMessage({
        type: 'hangup',
        to: targetExtension,
        from: extension,
      });
      setCallStatus('Call ended');
      onCallStatusChange('Call ended');
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }, [extension, targetExtension, onCallStatusChange, incomingStream, incomingPeerConnection]);

  return (
    <div className="animate-[fadeInUp_1.8s_ease-out_forwards]">
      <audio ref={audioRef} autoPlay />
      {!incomingStream && (
        <>
          <div className="flex flex-col xs:flex-row space-y-2 xs:space-y-0 xs:space-x-3 mb-3 xs:mb-4">
            <TextField
              label="Target Extension"
              value={targetExtension}
              onChange={(e) => setTargetExtension(e.target.value)}
              variant="outlined"
              fullWidth
              className="glass-effect"
              InputProps={{
                className: darkMode ? 'text-white' : 'text-black',
                style: { fontSize: '16px' } // Prevents zoom on iOS
              }}
              disabled={!!callRef.current}
              size="small"
            />
            <Tooltip title={callRef.current ? 'End Call' : 'Make Call'}>
              <Button
                variant="contained"
                onClick={callRef.current ? endCall : makeCall}
                className={`min-w-[80px] xs:min-w-[100px] touch-target tap-highlight ${
                  callRef.current
                    ? 'bg-gradient-to-r from-red-700 to-red-900 hover:from-red-800 hover:to-red-950'
                    : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800'
                } text-white`}
                startIcon={callRef.current ? <CallEnd /> : <Call />}
                aria-label={callRef.current ? 'End the call' : 'Make a call'}
                size="medium"
                sx={{
                  minHeight: '44px',
                  fontSize: { xs: '0.875rem', sm: '1rem' }
                }}
              >
                <span className="hidden xs:inline">{callRef.current ? 'End' : 'Call'}</span>
                <span className="xs:hidden">{callRef.current ? 'End' : 'Call'}</span>
              </Button>
            </Tooltip>
          </div>
          <div className="text-center">
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              SIP Status: {status}
            </p>
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Call Status: {callStatus}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default VoipPhone;
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Avatar, Tooltip, Button } from "@mui/material";
import { Call, CallEnd } from "@mui/icons-material";
import { sendWebSocketMessage } from "../services/websocketservice";
import { hangup } from "../services/hang";
import webrtcCallService from "../services/webrtcCallService";

const IncomingCallPage = ({ callData, contacts, user, darkMode = false, onCallAccepted, onCallRejected, onSwitchToCallPage }) => {
  const [notification, setNotification] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const audioContextRef = useRef(null);
  const timerRef = useRef(null);
  const callHandlerRef = useRef(null);


  const caller = useMemo(() => {
    // First try to find in contacts
    const contactMatch = (contacts || []).find((c) => c.extension === callData?.from);
    if (contactMatch) {
      return contactMatch;
    }

    // If not in contacts, use the username from call data if available
    const callerName = callData?.fromUsername || callData?.caller_username || `Ext ${callData?.from || 'Unknown'}`;

    return {
      name: callerName,
      extension: callData?.from || 'Unknown',
      avatar: null,
    };
  }, [contacts, callData?.from, callData?.fromUsername, callData?.caller_username]);

  useEffect(() => {
    // Safety check for callData
    if (!callData) {
      console.error('[IncomingCallPage] No callData provided');
      return;
    }

    console.log('[IncomingCallPage] Incoming call data:', callData);

    // Note: WebSocket connection is handled by the parent component (DashboardPage)
    // and WebRTC call service. No need to create a separate connection here.

    // Store call handler functions
    // Determine if this is a WebRTC call based on the call data
    const isWebRTCCall = callData.channel && callData.channel.startsWith('webrtc-call-');

    callHandlerRef.current = {
      acceptCall: async () => {
        try {
          // Update UI to show connection status
          setCallAccepted(true);
          setConnectionStatus('Connecting to extension...');

          // Clear the timeout timer since call is being accepted
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          if (isWebRTCCall) {
            // For WebRTC calls, delegate to WebRTC call service
            console.log('[IncomingCallPage] Accepting WebRTC call via service');
            setConnectionStatus('Accepting call...');

            // Accept the call and wait for connection establishment
            await webrtcCallService.acceptCall();
            setConnectionStatus('Call accepted! Initializing communication...');

            if (onSwitchToCallPage) {
              onSwitchToCallPage({
                contact: caller,
                callStatus: "Initializing Communication",
                isOutgoing: false,
                channel: callData?.channel,
                transport: callData?.transport || "transport-ws",
                callAccepted: true,
                isWebRTCCall: true,
                callId: callData?.call_id
              });
            }
          } else {
            // For traditional SIP calls, send answer_call message
            console.log('[IncomingCallPage] Accepting SIP call via WebSocket');
            setConnectionStatus('Accepting call...');

            await sendWebSocketMessage({
              type: "answer_call",
              to: callData.from,
              from: user.extension,
              channel: callData.channel,
              transport: callData.transport || "transport-ws",
            });

            setConnectionStatus('Call accepted! Connecting...');

            if (onSwitchToCallPage) {
              onSwitchToCallPage({
                contact: caller,
                callStatus: "Connecting",
                isOutgoing: false,
                channel: callData?.channel,
                transport: callData?.transport || "transport-ws",
                callAccepted: true,
                isWebRTCCall: false
              });
            }
          }

          // Notify parent component that call was accepted (after navigation to avoid state update during render)
          setTimeout(() => {
            if (onCallAccepted) {
              onCallAccepted();
            }
          }, 100);

        } catch (error) {
          console.error("Error accepting call:", error);
          setConnectionStatus('Failed to connect. Please try again.');
          setCallAccepted(false);
          throw error;
        }
      },
      rejectCall: async () => {
        try {
          if (isWebRTCCall) {
            // For WebRTC calls, delegate to WebRTC call service
            console.log('[IncomingCallPage] Rejecting WebRTC call via service');
            webrtcCallService.rejectCall();
          } else {
            // For traditional SIP calls, use hangup API and WebSocket
            console.log('[IncomingCallPage] Rejecting SIP call via hangup API');
            await hangup(callData.channel);
            await sendWebSocketMessage({
              type: "hangup",
              to: callData.from,
              from: user.extension,
              channel: callData.channel,
              transport: callData.transport || "transport-ws",
            });
          }

          // Notify parent component that call was rejected (use setTimeout to avoid state update during render)
          setTimeout(() => {
            if (onCallRejected) {
              onCallRejected();
            }
          }, 100);

          setNotification({ message: "Call rejected", type: "info" });
          setTimeout(() => setNotification(null), 3000);
        } catch (error) {
          console.error("Error rejecting call:", error);
          throw error;
        }
      }
    };

    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContextRef.current.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, audioContextRef.current.currentTime);
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    oscillator.start();
    setTimeout(() => oscillator.stop(), 30000);

    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Only reject if call hasn't been accepted yet
          if (!callAccepted) {
            handleReject();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (navigator.vibrate) {
        navigator.vibrate(0);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callData, user, caller]);

  const handleAccept = async () => {
    if (!callHandlerRef.current) return;
    setIsLoading(true);
    try {
      await callHandlerRef.current.acceptCall();
      setNotification({ message: "Call accepted", type: "success" });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Error accepting call:", error);
      setNotification({
        message: `Failed to answer call: ${error.message}`,
        type: "error",
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!callHandlerRef.current) return;

    // Clear the timeout timer since call is being rejected
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsLoading(true);
    try {
      await callHandlerRef.current.rejectCall();
    } catch (error) {
      console.error("Error rejecting call:", error);
      setNotification({
        message: `Failed to reject call: ${error.message}`,
        type: "error",
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleAccept();
    } else if (e.key === "Escape") {
      handleReject();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 animate-[fadeInUp_0.6s_ease-out_forwards]"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-label="Incoming call dialog"
    >
      {notification && (
        <div
          className={`fixed top-20 right-4 sm:right-6 z-50 glass-effect p-3 sm:p-4 rounded-lg shadow-lg animate-[fadeInUp_0.6s_ease-out_forwards] ${
            notification.type === "success"
              ? "bg-green-500/80"
              : notification.type === "error"
              ? "bg-red-500/80"
              : "bg-blue-500/80"
          }`}
          role="alert"
          aria-live="polite"
        >
          <span className="text-xs sm:text-sm font-medium text-white">
            {notification.message}
          </span>
        </div>
      )}
      <div
        className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg glass-effect p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl shadow-xl border border-white/20 transform transition-all duration-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] animate-[fadeInUp_0.8s_ease-out_forwards]"
        style={{
          background: darkMode
            ? "rgba(30, 30, 30, 0.25)"
            : "rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="flex items-center space-x-3 sm:space-x-4 mb-4 sm:mb-6 animate-[fadeInUp_1s_ease-out_forwards]">
          <Avatar
            alt={caller.name}
            src={caller.avatar}
            className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full border-3 border-white/40 shadow-md"
            sx={{
              bgcolor: caller.avatar ? 'transparent' : '#6366f1',
              color: 'white',
              fontSize: { xs: '1rem', sm: '1.2rem', md: '1.4rem' },
              fontWeight: 'bold'
            }}
          >
            {!caller.avatar && (caller.name ? caller.name.charAt(0).toUpperCase() : caller.extension?.charAt(0) || '?')}
          </Avatar>
          <div>
            <h2
              className={`text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold ${
                darkMode ? "text-white" : "text-white"
              } animate-pulse leading-tight`}
              aria-live="polite"
              style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" }}
            >
              {callAccepted ? "📞 Connecting..." : `📞 ${caller.name} is calling`}
            </h2>
            <p
              className={`text-sm sm:text-base md:text-lg font-semibold ${
                darkMode ? "text-blue-200" : "text-blue-200"
              } leading-tight`}
            >
              Extension: {caller.extension}
            </p>
            <p
              className={`text-xs sm:text-sm md:text-base ${
                darkMode ? "text-gray-400" : "text-gray-300"
              } mt-1`}
            >
              Priority: {callData?.priority || "Normal"} • Method: WebRTC
            </p>
            {callAccepted ? (
              <p
                className={`text-sm ${
                  darkMode ? "text-green-400" : "text-green-300"
                } mt-1 font-semibold animate-pulse`}
              >
                {connectionStatus}
              </p>
            ) : (
              <p
                className={`text-sm ${
                  darkMode ? "text-gray-400" : "text-gray-300"
                } mt-1`}
              >
                Time Left: {timeLeft}s
              </p>
            )}
          </div>
        </div>
        {!callAccepted && (
          <div className="flex justify-center space-x-4 sm:space-x-6 md:space-x-8 animate-[fadeInUp_1.2s_ease-out_forwards]">
            <Tooltip title="Accept Call">
              <Button
                variant="contained"
                onClick={handleAccept}
                disabled={isLoading}
                className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-emerald-600 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-500/60 transition-all transform active:scale-95 sm:hover:scale-110 ${
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                } ${darkMode ? "shadow-emerald-900/60" : "shadow-emerald-700/60"} min-w-[44px] min-h-[44px]`}
                startIcon={<Call className="text-lg sm:text-xl md:text-2xl" />}
                aria-label="Accept the incoming call"
              />
            </Tooltip>
            <Tooltip title="Reject Call">
              <Button
                variant="contained"
                onClick={handleReject}
                disabled={isLoading}
                className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-500/60 transition-all transform active:scale-95 sm:hover:scale-110 ${
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                } ${darkMode ? "shadow-red-900/60" : "shadow-red-700/60"} min-w-[44px] min-h-[44px]`}
                startIcon={<CallEnd className="text-lg sm:text-xl md:text-2xl" />}
                aria-label="Reject the incoming call"
              />
            </Tooltip>
          </div>
        )}

        {callAccepted && (
          <div className="flex justify-center animate-[fadeInUp_1.2s_ease-out_forwards]">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></div>
              <span className={`text-lg font-semibold ${
                darkMode ? "text-green-400" : "text-green-300"
              }`}>
                Establishing connection...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomingCallPage;
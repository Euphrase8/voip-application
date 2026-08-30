import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { FiPhone, FiPhoneOff, FiPhoneIncoming } from "react-icons/fi";
import { sendWebSocketMessage } from "../services/websocketservice";
import { hangup } from "../services/hang";
import webrtcCallService from "../services/webrtcCallService";
import { cn, getInitials, getAvatarColor } from "../utils/ui";
import { startRingtone, stopRinging } from "../utils/ringtone";

const IncomingCallPage = ({ callData, contacts, user, darkMode = false, onCallAccepted, onCallRejected, onSwitchToCallPage }) => {
  const [notification, setNotification] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const audioContextRef = useRef(null);
  const timerRef = useRef(null);
  const callHandlerRef = useRef(null);
  const callAcceptedRef = useRef(false);


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
          callAcceptedRef.current = true;
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
            // For traditional SIP calls — prefer JsSIP session if present (no duplicate SIP sessions)
            console.log('[IncomingCallPage] Accepting SIP call');
            setConnectionStatus('Accepting call...');
            if (callData.session) {
              const sipManager = (await import('../services/sipManager')).default;
              await sipManager.answerCall(callData.session);
            } else {
              await sendWebSocketMessage({
                type: "answer_call",
                to: callData.from,
                from: user.extension,
                channel: callData.channel,
                transport: callData.transport || "transport-ws",
              });
            }

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
            console.log('[IncomingCallPage] Rejecting WebRTC call via service');
            webrtcCallService.rejectCall();
          } else if (callData.session) {
            console.log('[IncomingCallPage] Rejecting SIP JsSIP session');
            const sipManager = (await import('../services/sipManager')).default;
            sipManager.rejectCall(callData.session);
          } else {
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

    // Use shared ringtone utility (works for any extension, no asset dependency)
    try { startRingtone(); } catch {}
    audioContextRef.current = { close: () => stopRinging() };

    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Only reject if call hasn't been accepted yet
          if (!callAcceptedRef.current) {
            handleReject();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      try { stopRinging(); } catch {}
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
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
    try { stopRinging(); } catch {}
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
    try { stopRinging(); } catch {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    callAcceptedRef.current = false;
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

  const accepting = isLoading && callAccepted;
  const rejecting = isLoading && !callAccepted;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call dialog"
    >
      {notification && (
        <div
          className={`fixed top-6 right-4 sm:right-6 z-[61] p-3 sm:p-4 rounded-lg shadow-lg animate-[fadeInUp_0.6s_ease-out_forwards] ${
            notification.type === "success"
              ? "bg-green-500/90"
              : notification.type === "error"
              ? "bg-red-500/90"
              : "bg-blue-500/90"
          }`}
          role="alert"
          aria-live="polite"
        >
          <span className="text-xs sm:text-sm font-medium text-white">
            {notification.message}
          </span>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className={cn(
          "w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border",
          darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-gray-200"
        )}
      >
        {/* Top bar */}
        <div className={cn(
          "px-6 py-3 flex items-center justify-center gap-2 border-b",
          darkMode ? "bg-secondary-900 border-secondary-700" : "bg-gray-50 border-gray-100"
        )}>
          <FiPhoneIncoming className="w-4 h-4 text-green-500" />
          <span className={cn(
            "text-sm font-semibold tracking-wide",
            darkMode ? "text-secondary-300" : "text-secondary-600"
          )}>
            Incoming Call
          </span>
        </div>

        <div className="px-8 py-8 flex flex-col items-center">
          {/* Avatar */}
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full border-2 border-green-400/40 animate-ping" />
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg",
              getAvatarColor(caller.name)
            )}>
              {getInitials(caller.name)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-4 border-white dark:border-secondary-800 flex items-center justify-center">
              <FiPhone className="w-4 h-4 text-white" />
            </div>
          </div>

          <h2 className={cn("text-2xl font-bold mb-1 text-center", darkMode ? "text-white" : "text-gray-900")}>
            {caller.name}
          </h2>
          <p className={cn("text-sm mb-3", darkMode ? "text-secondary-400" : "text-secondary-500")}>
            Extension: {caller.extension}
          </p>

          <span className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-6",
            darkMode ? "bg-secondary-700 text-secondary-200" : "bg-gray-100 text-secondary-600"
          )}>
            {callData?.priority || "Normal"} priority
          </span>

          {/* Status */}
          <div className="flex items-center gap-2 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className={cn("text-sm", darkMode ? "text-secondary-400" : "text-secondary-500")}>
              {callAccepted ? connectionStatus : `Ringing... ${timeLeft}s`}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-12">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleReject}
              disabled={isLoading}
              className="flex flex-col items-center gap-2"
              aria-label="Decline call"
            >
              <span className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 transition-colors",
                "bg-red-500 hover:bg-red-600 text-white",
                isLoading && "opacity-50"
              )}>
                {rejecting ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiPhoneOff className="w-6 h-6" />
                )}
              </span>
              <span className={cn("text-xs font-medium", darkMode ? "text-secondary-300" : "text-secondary-600")}>
                Decline
              </span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleAccept}
              disabled={isLoading}
              className="flex flex-col items-center gap-2"
              aria-label="Accept call"
            >
              <span className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40 transition-colors",
                "bg-green-500 hover:bg-green-600 text-white",
                isLoading && "opacity-50"
              )}>
                {accepting ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiPhone className="w-6 h-6" />
                )}
              </span>
              <span className={cn("text-xs font-medium", darkMode ? "text-secondary-300" : "text-secondary-600")}>
                Accept
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default IncomingCallPage;
